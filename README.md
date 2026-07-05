# ReceiptGuard — Receipt Verification System

A receipt/payment verification platform for Ethiopian businesses. Cashiers scan or enter a payment reference and the system verifies it in real time against the payment provider, flags fraud (duplicates, amount tampering, recipient mismatches), and keeps a full audit trail.

**Live demo:** https://verify-receipt-app.vercel.app/

## Supported Payment Providers

Verification is powered by the open-source [Vixen878/verifier-api](https://github.com/Vixen878/verifier-api) (hosted at `https://verifyapi.leulzenebe.pro`):

| Provider | Required fields |
|---|---|
| Commercial Bank of Ethiopia (CBE) | Reference + 8-digit account suffix |
| Telebirr | Reference |
| Dashen Bank | Reference |
| Bank of Abyssinia | Reference + 5-digit suffix |
| CBE Birr | Receipt number + phone number |
| M-Pesa | Receipt number |

Receipt image upload with OCR (`/verify-image`) is also supported.

## Features

- **Manual & image verification** — enter a reference or upload a receipt photo
- **GREEN / YELLOW / RED result classification** — verified, needs review, or fraud detected
- **Fraud detection** — duplicate receipts, amount mismatches, recipient mismatches, failed transactions
- **Multi-role auth** — Owner, Manager, Employee, Platform Admin (NextAuth v5)
- **Dashboard & reports** — daily stats, provider breakdown, trends, CSV export
- **Fraud alerts** — severity-ranked alert queue with resolution workflow
- **Admin portal** — business management, API monitoring, audit log
- **Subscription tiers** — Free / Basic / Pro with monthly verification limits
- **Demo mode** — full UI walkthrough without a database

## Tech Stack

Next.js 16 (App Router) · React 19 · TypeScript · Prisma + PostgreSQL · NextAuth v5 · Zod · Recharts

## Getting Started

```bash
npm install
cp .env.example .env.local   # then fill in values
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (not needed in demo mode) |
| `NEXTAUTH_SECRET` / `AUTH_SECRET` | Auth secret (32+ chars) |
| `VERIFIER_API_URL` | Verifier API base URL (default: `https://verifyapi.leulzenebe.pro`) |
| `VERIFIER_API_KEY` | API key — get one free at [verify.leul.et](https://verify.leul.et) |
| `ENCRYPTION_KEY` | 32-byte hex key for encrypting account numbers |
| `DEMO_MODE` / `NEXT_PUBLIC_DEMO_MODE` | `true` = run without a database |

### Demo mode

With `DEMO_MODE=true` the app runs without a database: login with one-click demo accounts, and dashboard/history/alerts show mock data.

**Receipt verification is still real** when `VERIFIER_API_KEY` is set — references are checked live against the provider via the Verifier API. Without a key, verification results are mocked too.

### Full (database) mode

```bash
npm run db:push    # create schema
npm run db:seed    # seed demo data
npm run dev
```

## Deployment (Vercel)

1. Push to GitHub and import the repo in Vercel.
2. Set the environment variables above in the Vercel project settings.
   - For a no-database demo deployment: `DEMO_MODE=true`, `NEXT_PUBLIC_DEMO_MODE=true`, plus `VERIFIER_API_KEY` for real verification.
   - For production: a `DATABASE_URL` (e.g. Vercel Postgres / Neon) and `DEMO_MODE=false`.
3. Deploy — the build runs `prisma generate` automatically.

## Verification Flow

1. Validate input (provider, reference format)
2. Check for duplicate submissions (hash-based, privacy-preserving)
3. Call the Verifier API for the provider
4. Match the recipient against the business's registered payment accounts
5. Compare expected vs. verified amount
6. Classify GREEN / YELLOW / RED and generate fraud alerts
7. Record the employee's accept/reject/escalate decision with audit logging
