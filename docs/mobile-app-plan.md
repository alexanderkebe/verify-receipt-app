# ReceiptGuard Android Employee App — Implementation Plan

**Goal:** an Android app for business employees (cashiers) that lets them sign in to
the account their owner/manager created, verify receipts, and see their own
day-to-day progress — running against the **same backend** as the web app
(`verify-receipt-app.vercel.app`, Next.js API routes + Supabase Postgres).

---

## 1. Technology choice

**Recommendation: Expo (React Native) + TypeScript, living in this repo under `mobile/`.**

| Reason | Detail |
|---|---|
| Same language as the web app | The receipt-reference parsing (`src/lib/receipt-input.ts`), provider types (`src/types`), and text-hunting logic (`findReferenceInText`) are pure TypeScript — reuse them instead of rewriting in Kotlin/Dart. |
| Better scanning than the web | `expo-camera` uses Android's native ML Kit barcode engine — the same one the phone's camera app uses. It reads glary/angled/screen-displayed QRs that the web's jsQR fallback misses. |
| One repo, main-only | The app lives in `mobile/`; Vercel ignores it. Backend and app changes that belong together land in one commit. Matches the main-only workflow. |
| Cheap builds & updates | EAS Build produces signed APKs in the cloud (no local Android Studio needed). Expo OTA updates push JS-level fixes without reinstalling the APK. |

Alternatives considered: **Flutter** and **native Kotlin** both mean rewriting the
parsing/matching logic in another language and maintaining two implementations —
no benefit for this app's scope.

---

## 2. What the backend already provides (no changes needed)

| App need | Existing endpoint | Notes |
|---|---|---|
| Sign in to boss-created account | NextAuth credentials login | Owners/managers create employees via `POST /api/employees` (temp password shared manually). JWT sessions, 30-day expiry. |
| Verify a receipt | `POST /api/verify/manual` | Body: `{ input, provider?, expectedAmount? }`. Full pipeline: duplicate check → external verifier → recipient match → GREEN/YELLOW/RED classification. `maxDuration 60` (Telebirr can take 45s). |
| Record decision | `POST /api/verify/[id]/decision` | `{ decision: ACCEPTED \| REJECTED \| ESCALATED, reason? }` |
| Supervisor override | `POST /api/verify/[id]/override` | Requires password re-entry; likely v1.1 for mobile. |
| My history | `GET /api/history` | Already scopes the EMPLOYEE role to their own records. Supports paging + filters. |
| Verifier status | `GET /api/verify/health` | For a "service degraded" banner. |

All endpoints return the shared `{ success, data | error }` envelope.

---

## 3. Backend additions (Phase 0)

Three small pieces, all in the existing codebase, all covered by the existing
build/lint/test gates. The web app is otherwise untouched.

### 3.1 `GET /api/me/stats` — employee day-to-day analytics

The existing `/api/dashboard/stats` is business-wide (built for owners). Employees
need *their own* numbers. New endpoint, any authenticated business role:

```jsonc
{
  "today":   { "total": 23, "verified": 19, "issues": 3, "rejected": 1, "valueVerified": 41200 },
  "yesterday": { "total": 31, "verified": 27 },
  "trend": [ { "date": "2026-07-15", "total": 12, "verified": 10, "failed": 1 }, /* 7 days */ ],
  "decisions": { "accepted": 18, "rejected": 2, "escalated": 1 },   // last 7 days
  "openAlerts": 0
}
```

Implementation: reuse the aggregation patterns in `src/lib/dashboard.ts`
(one `COUNT(*) FILTER` raw query for today/yesterday, one day-trunc query for the
trend) with `employeeId = session.user.id` added to the WHERE. The existing
`(businessId, createdAt)` and `employeeId` indexes serve these queries.
Cache per user with `unstable_cache` keyed `['me-stats', userId]`, 60s TTL,
tag `me-stats:${userId}` revalidated in `performVerification`'s `after()` block
(same pattern as the dashboard tag).

### 3.2 `POST /api/me/password` — change password

Employees start with a temp password their boss hands them; the app forces a
change on first login.

- Body: `{ currentPassword, newPassword }` (zod-validated, min length from `AUTH_CONFIG.passwordMinLength`)
- Verify `currentPassword` with bcrypt against `user.passwordHash`, hash the new one (cost 10, matching `src/auth.ts`)
- Clear `invitationToken` to mark the account as activated (the "must change password" signal — see 5.2)
- Audit-log as `user.password_changed` (no values recorded)

### 3.3 Middleware: 401 JSON for unauthenticated API calls

`src/middleware.ts:58-62` currently redirects **all** unauthenticated non-public
requests to `/login` — including `/api/*`, so an expired mobile session gets an
HTML login page instead of an error. Add before the redirect:

```ts
if (!loggedIn && pathname.startsWith('/api/')) {
  return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
}
```

The app treats any 401 as "session expired → return to login". (Browser behavior
is unchanged — page navigations still redirect.)

### 3.4 (Decision needed) `POST /api/extract/pdf` — Dashen shared-PDF support

React Native has no good on-device PDF text extraction, and Dashen receipts are
shared as PDFs. Options:

- **A (recommended):** small endpoint that accepts the PDF upload, runs the same
  `findReferenceInText` hunting server-side (pdfjs-dist works in Node), returns
  only the extracted reference, stores nothing. Slightly weaker privacy posture
  than the web's on-device extraction (the file transits the server), same data
  stored either way.
- **B:** ship v1 without PDF support; cashiers type the Dashen reference printed
  on the receipt (already supported by manual entry). Add A in v1.1.

---

## 4. Mobile auth strategy

Use NextAuth's cookie flow directly — **zero backend auth changes**:

1. `GET /api/auth/csrf` → `{ csrfToken }` (also sets the csrf cookie — echo it back)
2. `POST /api/auth/callback/credentials` (form-encoded: `email`, `password`, `csrfToken`) → on success the response sets the **`authjs.session-token`** cookie — a JWT valid 30 days (`session.strategy: 'jwt'` in `src/auth.config.ts`)
3. Store the token in **`expo-secure-store`** (encrypted at rest); attach `Cookie: authjs.session-token=…` on every API request via a small `apiFetch` wrapper
4. Wrong credentials → the callback responds with a redirect containing an error param → show "wrong email or password"
5. Any later `401` → clear SecureStore, navigate to Login

Fallback (only if the cookie flow proves brittle across NextAuth upgrades): a thin
`/api/mobile/login` that runs the same bcrypt check and returns the same JWT.
Do not build it preemptively.

**Session payload** already carries everything the app needs: `id`, `role`,
`businessId`, `branchId`, `businessName` (threaded through the JWT in
`auth.config.ts` callbacks).

---

## 5. The app

### 5.1 Project structure

```
mobile/
  app/                     # expo-router file-based navigation
    (auth)/login.tsx
    (auth)/change-password.tsx
    (tabs)/index.tsx       # Home
    (tabs)/verify.tsx      # Verify flow entry
    (tabs)/progress.tsx    # My progress
    (tabs)/history.tsx
    settings.tsx
  src/
    api/client.ts          # apiFetch wrapper: base URL, cookie header, 401 handling
    api/endpoints.ts       # typed wrappers per endpoint
    auth/session.ts        # SecureStore read/write, login/logout
    lib/                   # imported from ../../src/lib via metro watchFolders
    theme/                 # colors matching the web's light/dark palette
  app.json / eas.json
  package.json             # standalone; not an npm workspace (keep it simple)
```

Code sharing: configure Metro `watchFolders` to include the repo root so
`mobile/` can import `src/lib/receipt-input.ts` and `src/types` directly (they
are dependency-free pure TS). If that fights the tooling, copy the two files and
add a CI check that diffs them — but try direct import first.

### 5.2 Screens & flows

**Login**
- Email + password, base URL from config (prod default, overridable for dev)
- On success: if the account still has its `invitationToken` set (returned by a
  tiny `GET /api/me` addition or included in the login session), route to
  **Change password** and block the rest of the app until done
- Errors: wrong credentials, suspended account, no network

**Home (tab 1)**
- Greeting + business name, today's tiles (verified / issues / value ETB) from `/api/me/stats`
- Big primary "Verify receipt" button
- Degraded-service banner when `/api/verify/health` is unhealthy

**Verify flow (tab 2)** — mirrors the web's logic in `VerifyForm.tsx`:
1. Provider picker (6 providers, same logos from `public/providers/`)
2. Three input modes:
   - **Scan** — `expo-camera` with `barcodeScannerSettings: { barcodeTypes: ['qr'] }`.
     Only for providers whose QRs are verifiable: **CBE, CBE Birr, Abyssinia**
     (same `QR_SCANNER_PROVIDERS` gating the web uses). Run the scanned text
     through `findReceiptReference`; app-only QRs (Telebirr in-app, Dashen
     SuperApp) show the same guidance messages the web shows.
   - **Manual** — reference input with per-provider help text + placeholder
     (reuse `PROVIDER_HELP_TEXTS` / `PROVIDER_PLACEHOLDERS` content), optional
     expected amount.
   - **Photo** — camera or gallery via `expo-image-picker`; QR decode first from
     the still image, then OCR with `@react-native-ml-kit/text-recognition`
     (on-device, free), then `findReferenceInText`. PDFs per decision 3.4.
3. Submit → `POST /api/verify/manual` (45s+ timeout tolerance, progress state,
   "Telebirr can take up to a minute" hint)
4. **Result card** — GREEN / YELLOW / RED with the same fields as the web
   (payer, recipient + match, amount + match, duplicate warning with previous
   acceptance details, transaction date) → **Accept / Reject / Escalate** buttons
   → `POST /api/verify/[id]/decision`
5. After decision: "verify another" resets the flow

**My progress (tab 3)**
- Today vs yesterday comparison, 7-day bar/line chart (`react-native-svg` +
  `victory-native`, or hand-rolled SVG bars — avoid heavy chart deps), decision
  split, personal success rate
- Data: `/api/me/stats` (already cached server-side)

**History (tab 4)**
- `GET /api/history` paginated list (infinite scroll), result badges, decision
  chips; tap → detail sheet
- Filters: date range, result level

**Settings**
- Change password, theme toggle (default follows system), app version, logout

### 5.3 UX/platform details

- **Offline:** the app is online-only by nature (verification hits external
  providers). Detect connectivity (`@react-native-community/netinfo`), disable
  submit with a clear banner. Do not queue verifications offline — a stale
  verification is a fraud risk.
- **Errors:** every API error surfaces the backend's `error` string; 401 → login.
- **Permissions:** camera requested on first use of scan/photo with rationale copy.
- **Localization:** wire `i18next` from day one with an `en` catalog only;
  Amharic (`am`) becomes a translation task, not a refactor.
- **Android specifics:** min SDK 24 (covers ML Kit), hardware back handled by
  expo-router, keyboard-safe forms.

---

## 6. Phases & acceptance criteria

### Phase 0 — Backend prep (~½ day)
- [ ] `GET /api/me/stats` (+ cache + tag revalidation)
- [ ] `POST /api/me/password` (+ audit log, clears `invitationToken`)
- [ ] Middleware returns 401 JSON for unauthenticated `/api/*`
- [ ] Decision made on 3.4 (PDF endpoint now vs v1.1)
- **Accept:** curl against a preview deploy with the seeded cashier login
  (`cashier@receiptguard.et`) returns correct stats; wrong-password change is
  rejected; unauthenticated `/api/history` returns 401 JSON. Web app unaffected
  (`npm run build`, tests, lint pass).

### Phase 1 — Scaffold + auth (~1–2 days)
- [ ] Expo app in `mobile/` with expo-router, theme, `apiFetch`
- [ ] Login via the NextAuth cookie flow, SecureStore persistence, auto-login on
  relaunch, logout
- [ ] Forced change-password flow for temp-password accounts
- **Accept:** sign in on a physical Android device against the production
  backend; kill and relaunch the app → still signed in; expired/invalid token →
  clean return to login.

### Phase 2 — Verify flow (~3–4 days)
- [ ] Provider picker + manual entry + result card + decisions (end-to-end first)
- [ ] QR scanning with expo-camera (CBE / CBE Birr / Abyssinia), app-only-QR guidance
- [ ] Photo OCR path (ML Kit + shared `findReferenceInText`)
- **Accept:** a real CBE receipt QR scans and verifies GREEN on-device; a
  duplicate re-verification shows the duplicate warning; Accept/Reject lands in
  the web dashboard's history and recent-activity list.

### Phase 3 — Analytics + history (~1–2 days)
- [ ] Home tiles, My progress screen with 7-day chart
- [ ] History list with paging + filters
- **Accept:** numbers on the phone match the web dashboard's employee breakdown
  for the same user/day.

### Phase 4 — Polish + release (~2 days)
- [ ] Error/offline states, loading skeletons, dark/light parity with the web
- [ ] App icon + splash (reuse ReceiptGuard branding)
- [ ] EAS Build signed APK; internal distribution (direct APK share), Play Store
  internal-testing track optional
- **Accept:** APK installs on a clean device; a cashier can go
  login → change password → verify → decide → see progress with no crashes.

Total: roughly **8–10 working days** end to end.

---

## 7. Testing & rollout

- **Backend:** Phase-0 endpoints get the same gates as the rest of the repo
  (`tsc`, lint, `npm test`, build) plus curl smoke tests documented above.
- **App:** manual smoke matrix on at least two devices (one low-end Android);
  Maestro flows for login + manual verify + decision once the UI stabilizes.
- **Seeded accounts:** `cashier@receiptguard.et / Password123!` for employee
  flows; `owner@receiptguard.et` to confirm the boss-side view of decisions.
- **Rollout:** distribute the APK to one pilot business first; production web
  is unaffected throughout (only additive backend changes).

## 8. Open decisions

1. **Dashen PDF support in v1?** → determines whether `/api/extract/pdf` is built
   in Phase 0 (recommended: yes, it's small) or deferred.
2. **Language:** English-only v1 with i18n wiring, Amharic strings as a follow-up
   translation pass (recommended), or bilingual at launch.
3. **Play Store:** direct-APK distribution is enough to start; decide on Play
   publication (needs a developer account, privacy policy page) before wider
   rollout.
