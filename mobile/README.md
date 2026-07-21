# ReceiptGuard — Android employee app

Expo (React Native) app for business employees: sign in to the account your
owner/manager created, verify receipts, and track your own daily progress.
It talks to the **same backend as the web app** — no separate API.

Full plan and phase breakdown: [`../docs/mobile-app-plan.md`](../docs/mobile-app-plan.md).

## Status

| Phase | Scope | State |
|---|---|---|
| 0 | Backend: `/api/me`, `/api/me/stats`, `/api/me/password`, API 401s | ✅ Done |
| 1 | Scaffold, session handling, login, forced password change, tabs, Home | ✅ Done |
| 2 | Verify flow: provider picker, QR scan, manual entry, result, decisions | ✅ Done |
| 2b | Photo + OCR fallback for providers without scannable QRs | ⬜ Next |
| 3 | Progress chart + history list | ⬜ |
| 4 | Polish + EAS build (APK) | ⬜ |

## Running it

```bash
cd mobile
npm install
npm start          # then press "a" for Android, or scan the QR with Expo Go
```

Requires [Expo Go](https://expo.dev/go) on the phone (same Wi-Fi as the
computer), or an Android emulator.

### Pointing at a different backend

The API base URL lives in `app.json` → `expo.extra.apiBaseUrl` (defaults to the
production deployment). For local development against `next dev`, use your
machine's LAN IP — `localhost` refers to the phone itself:

```jsonc
"extra": { "apiBaseUrl": "http://192.168.1.20:3000" }
```

## How authentication works

The backend issues a 30-day JWT in the `authjs.session-token` cookie
(NextAuth, `strategy: 'jwt'`). The app drives the same credentials flow a
browser would:

1. `GET /api/auth/csrf` → csrf token + cookie
2. `POST /api/auth/callback/credentials` (form-encoded, `redirect=false`)
3. Capture `authjs.session-token` from `Set-Cookie`, store it in
   **`expo-secure-store`** (encrypted at rest)
4. Replay it as a `Cookie` header on every request (`src/api/client.ts`)
5. Any `401` clears the token and returns to the login screen

Employees created by an owner keep an `invitationToken` until they set their
own password. `GET /api/me` exposes this as `mustChangePassword`, and
`app/_layout.tsx` blocks the rest of the app until the change is done.

## Layout

```
app/                      expo-router routes
  _layout.tsx             AuthProvider + auth-state routing (AuthGate)
  (auth)/login.tsx        email + password sign in
  (auth)/change-password  forced temp-password change
  (tabs)/index.tsx        Home — today's tiles + verify CTA
  (tabs)/verify.tsx       provider picker → scan/manual → result → decision
  (tabs)/progress.tsx     Phase 3
  (tabs)/history.tsx      Phase 3
src/
  api/session.ts          NextAuth login + SecureStore token storage
  api/client.ts           apiFetch: base URL, cookie, envelope, 401 handling
  api/endpoints.ts        typed wrappers per backend route
  auth/AuthContext.tsx    session state, sign in/out, user profile
  components/ui.tsx       Screen/Card/Button/Input primitives
  components/QrScanner    camera viewfinder (native barcode engine)
  components/ResultCard   GREEN/YELLOW/RED verdict + transaction details
  lib/receipt.ts          re-exports shared parsing + provider constants
  theme/index.ts          palette mirrored from the web's globals.css
```

### Shared receipt-parsing logic

`metro.config.js` watches the repo root so the app imports the web app's
`src/lib/receipt-input.ts` directly (via the `@shared/*` alias) — a QR that
works on the web works here, because it is literally the same function.

That module imports `@/types` (a Next.js path alias) for a single erased
type. Metro's `resolveRequest` redirects that specifier to
`src/lib/shared-types.ts`, a runtime-empty shim, so the web app's Next and
NextAuth type surface never enters the bundle.

### Which providers can be scanned

Only **CBE, CBE Birr and Abyssinia** publish receipt QRs that a public
endpoint can resolve (`QR_SCANNER_PROVIDERS`). telebirr and Dashen QRs are
app-internal payloads — selecting those providers opens manual entry, and
scanning one anyway explains why it cannot be used.

## Testing against the seeded accounts

The database seed creates (see `../prisma/seed.ts`):

- `cashier@receiptguard.et` / `Password123!` — employee view
- `owner@receiptguard.et` / `Password123!` — to confirm decisions land

Smoke checklist for Phase 1 (auth):

1. Sign in as the cashier → lands on Home with today's numbers
2. Kill and relaunch the app → still signed in (token restored from SecureStore)
3. Sign out → returns to login, relaunch stays on login
4. Wrong password → "Wrong email or password."
5. Airplane mode → "Could not reach the server."

Smoke checklist for Phase 2 (verify):

1. Pick CBE → scanner opens; point it at a CBE receipt QR → verifies GREEN
2. Accept the result → reappears in the web dashboard's recent activity
3. Verify the same reference again → RED with the duplicate warning naming
   who accepted it and when
4. Pick telebirr → opens manual entry directly (no scanner); type a reference
   → verifies
5. Scan a telebirr in-app QR while on CBE → explains it can't be verified
   rather than failing a lookup
6. Type a reference that doesn't exist → YELLOW "unable to verify"
7. Return to Home → today's tiles reflect the new verification
