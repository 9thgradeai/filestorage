<div align="center">

# Vault — Secure File Storage

A production-grade, full-stack file storage platform with real-email
verification, rotating session security, and pluggable object storage.

**Next.js 16 · Express 4 · TypeScript · PostgreSQL 16 · AWS S3 · Resend**

[![Node](https://img.shields.io/badge/node-20.x-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/typescript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Express](https://img.shields.io/badge/express-4.x-000000?logo=express&logoColor=white)](https://expressjs.com)
[![PostgreSQL](https://img.shields.io/badge/postgres-16-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![Next.js](https://img.shields.io/badge/next.js-16-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![React](https://img.shields.io/badge/react-19-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![Jest](https://img.shields.io/badge/tests-76%20passing-C21325?logo=jest&logoColor=white)]()
[![Dependencies](https://img.shields.io/badge/npm%20audit-0%20vulnerabilities-success)]()

</div>

---

## Table of Contents

- [What is it?](#what-is-it)
- [Highlights](#highlights)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Getting started (local)](#getting-started-local)
- [Running with Docker Compose](#running-with-docker-compose)
- [Production deployment](#production-deployment-railway--vercel)
- [API surface](#api-surface)
- [Security](#security)
- [Testing & quality](#testing--quality)
- [Project layout](#project-layout)

---

## What is it?

Vault is a **full-stack file storage service**: users sign up with a real email
(verified via a one-time code), upload files, and share them through expiring
public links. It is built to a production bar — defense-in-depth auth, validated
uploads, structured logging, enforced test coverage, and zero known dependency
vulnerabilities.

Two deployable halves share one monorepo:

| Component | Path | Stack |
|---|---|---|
| Backend API | `backend/` | Express 4 + TypeScript + PostgreSQL, Docker image |
| Frontend app | `frontend/` | Next.js 16 (App Router) + React 19 |

---

## Highlights

- **Cookie-based sessions without `localStorage`.** Short-lived JWT access token
  (15 min) + rotating, DB-backed, hashed refresh token (7 days), both in
  `HttpOnly` / `SameSite=Lax` cookies. Double-submit CSRF protection on every
  mutation.
- **Real-email verification.** New accounts must confirm a 6-digit OTP delivered
  via the **Resend HTTPS API** (SendGrid or SMTP fallback) before they can sign in.
  OTP delivery is **non-blocking** — register/resend/forgot respond in
  milliseconds while mail goes out in the background.
- **Password reset that revokes everything.** Reset OTPs are emailed to the
  verified address; on reset the password is rotated, the account is marked
  verified, and **all existing sessions are revoked**.
- **Uploads that never trust the client.** Files stream through a temp-file
  pipeline, the real type is sniffed from **magic bytes**, and objects are stored
  under random server-generated keys (up to 100 MB without buffering in RAM).
- **Pluggable storage.** Local disk (Railway/Docker volume) or **AWS S3**
  (private ACL, SSE-S3 AES256 or SSE-KMS) behind one driver interface.
- **Shareable, expiring links.** Owners can flip a file to public and mint a
  token with a 7-day expiry; public downloads stream with `attachment` +
  `nosniff`.
- **Operations-ready.** Structured `pino` logging, DB-aware health check,
  per-IP + per-auth rate limiting, helmet security headers, fail-fast env
  validation, graceful shutdown, and CI with enforced coverage gates.

---

## Tech stack

| Layer | Technology | Why |
|---|---|---|
| **Frontend** | Next.js 16 (App Router), React 19, TypeScript 5.9 | RSC + edge-ready SSR, static typing |
| Frontend UI | `motion`, Phosphor Icons, `react-hot-toast` | Animation, iconography, toasts |
| **Backend** | Node 20, Express 4, TypeScript | HTTP API |
| Backend validation | `joi` | Schema validation on every request body |
| Backend auth | `jsonwebtoken`, `bcryptjs` | JWT access tokens, bcrypt password hashing (cost 12) |
| Backend DB | `pg` (node-postgres `Pool`) | Transactional PostgreSQL access |
| Backend uploads | `multer` + `magic-bytes.js` | Streaming multipart + content sniffing |
| Backend storage | `@aws-sdk/client-s3`, `s3-request-presigner` | S3 ops + presigned URLs |
| Backend email | Resend REST API (primary) + SendGrid / `nodemailer` (fallbacks) | OTP / verification / reset delivery |
| Backend logging | `pino`, `pino-http` | Structured + access logs |
| Backend hardening | `helmet`, `cors`, `cookie-parser`, `express-rate-limit` | Headers, CORS, cookies, throttling |
| **Database** | PostgreSQL 16 | Relational store (migrations 001–003) |
| **Storage** | AWS S3 **or** local volume (env-switched driver) | Object storage |
| **Email** | Resend HTTPS API, SendGrid, or SMTP | Reliable transactional delivery |
| **CI** | GitHub Actions | Backend tests vs ephemeral Postgres + frontend lint/build |
| **Deploy** | Vercel (frontend) + Railway (backend & Postgres) | Production hosting |
| **Containers** | Docker (multi-stage, `node:20-alpine`) | Reproducible builds |

---

## Architecture

```
                          ┌────────────────────────────────────────────┐
                          │                   Browser                  │
                          └──────────────────────┬─────────────────────┘
                                                 │  HTTPS
                                                 ▼
        ┌────────────────────────────────────────────────────────────────┐
        │              Vercel — Next.js 16 (frontend)                    │
        │  /api/*  ──rewritten at the platform layer──►  backend         │
        │  (same-origin: no CORS, SameSite=Lax cookies work)             │
        └────────────────────────────────────┬───────────────────────────┘
                                             │  HTTPS /api/* (streams up to 100 MB)
                                             ▼
        ┌────────────────────────────────────────────────────────────────┐
        │            Railway — Express 4 backend (Node 20)               │
        │  auth routes · file routes · otp/email services · storage      │
        └──────────────┬──────────────────────────────┬──────────────────┘
                       ▼                              ▼
        ┌────────────────────────────┐   ┌──────────────────────────────────┐
        │   Railway Postgres (16)    │   │  Storage driver (STORAGE_DRIVER) │
        │   users · files ·          │   │   ├─ local → volume at /data     │
        │   refresh_tokens ·         │   │   └─ s3    → AWS S3 (private,    │
        │   email_otps               │   │              SSE-S3 / SSE-KMS)   │
        └────────────────────────────┘   └──────────────────────────────────┘
```

**Key idea — one origin.** The frontend calls `/api/*` on its own origin and
Next rewrites those to the backend. This makes everything same-origin in
production (no CORS), so `SameSite=Lax` cookie sessions work naturally. On
Vercel the rewrite runs at the **platform layer** (not an edge function), so
uploads up to the 100 MB cap stream end-to-end without the ~4.5 MB
edge-function payload limit.

> Full deep-dive — data model, OTP lifecycle, session/CSRF flow, storage
> drivers, and operational history — lives in
> [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Getting started (local)

Prerequisites: **Node 20+** and a local **PostgreSQL** instance. The built-in
**local storage driver** works with zero AWS setup.

### 1. Database

```bash
psql -U postgres -c "CREATE DATABASE filestorage;"
```

### 2. Backend

```bash
cd backend
cp .env.example .env        # edit DB_* and JWT_SECRET;
                            # STORAGE_DRIVER=local is the default — AWS_* only
                            # needed when STORAGE_DRIVER=s3
npm install
npm run db:migrate          # apply versioned migrations (001→003)
npm run dev                 # or: npm run build && npm start
```

### 3. Frontend

```bash
cd frontend
cp .env.example .env.local  # optional; defaults to same-origin proxying
npm install
npm run dev                 # http://localhost:3000
```

---

## Running with Docker Compose

One command brings up the full stack (db + backend + frontend), with migrations
applied automatically on backend start.

```bash
# Local storage — no AWS credentials needed (named volume persists /data).
JWT_SECRET='a-very-long-secure-random-value-32-chars' docker compose up --build

# ...or switch to S3:
JWT_SECRET='a-very-long-secure-random-value-32-chars' STORAGE_DRIVER=s3 \
AWS_ACCESS_KEY_ID='...' AWS_SECRET_ACCESS_KEY='...' \
S3_BUCKET_NAME='your-bucket' docker compose up --build
```

`JWT_SECRET` is interpolated with `:?` so compose fails fast if it's missing.
The frontend's `/api` proxy target is baked in as the `API_BACKEND_URL` build
arg, so `next start` works without runtime env gymnastics.

---

## Production deployment (Railway + Vercel)

The live stack runs **backend + Postgres on Railway** and the **frontend on
Vercel**. `API_BACKEND_URL` is baked into the Next rewrites, keeping the browser
on one origin.

### Backend — Railway

```bash
railway init --name filestorage          # add Postgres plugin + backend service
                                         #   (rootDirectory: ./backend)
railway volume add backend-volume        # mount at /data for local storage
```

Service variables:

```
JWT_SECRET=<long random hex ≥32 chars>
NODE_ENV=production
STORAGE_DRIVER=local
STORAGE_DIR=/data
DATABASE_URL=${{Postgres.DATABASE_URL}}
FRONTEND_URL=<frontend https URL>
PUBLIC_FILE_BASE_URL=<frontend https URL>

# Email delivery needs one provider:
#  - Resend HTTPS API (recommended — works on all Railway plans, incl. the
#    Free/Trial/Hobby tiers where outbound SMTP is blocked)
#  - SendGrid v3 REST API (free trial — no domain needed, 100 emails/day for
#    60 days; verify a Single Sender, then use it as EMAIL_FROM_EMAIL)
#  - SMTP (Railway Pro and above only)
RESEND_API_KEY=<resend key>
EMAIL_FROM_NAME=Vault
EMAIL_FROM_EMAIL=<address on your verified Resend domain>
# SENDGRID_API_KEY=<sg key>          # alternative when RESEND_API_KEY is unset
# EMAIL_FROM_EMAIL=<verified single sender>
# SMTP_HOST=smtp.example.com   # fallback provider; Pro plan and above
# SMTP_PORT=587
# SMTP_USER=<smtp username>
# SMTP_PASS=<smtp password>
```

Deploy:

```bash
railway redeploy --service backend --environment production --from-source --yes
```

> The Dockerfile runs `node dist/db/migrate.js` (idempotent) before starting the
> API, so new schema ships with each deploy.

### Frontend — Vercel

1. `vercel link --project filestorage` (project settings:
   `rootDirectory: frontend`, framework `nextjs`).
2. Set the Production env var `API_BACKEND_URL=https://<backend>.up.railway.app`.
3. `vercel --prod --yes` — or simply push to `main`; GitHub-triggered deploys
   pick up the latest commit.

---

## API surface

`✓*` = also requires the `X-CSRF-Token` header (echo of the `csrf_token` cookie).

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/auth/register` | — | Creates unverified account, emails OTP |
| POST | `/api/auth/verify-email` | — | Verifies emailed OTP, signs in |
| POST | `/api/auth/resend-otp` | — | Resends OTP (60s cooldown) |
| POST | `/api/auth/forgot-password` | — | Emails a reset OTP (enumeration-safe) |
| POST | `/api/auth/reset-password` | — | OTP + new password; revokes sessions |
| POST | `/api/auth/login` | — | Verified accounts only |
| POST | `/api/auth/refresh` | — | Rotates refresh token (cookie) |
| POST | `/api/auth/logout` | ✓* | Revokes refresh token |
| GET | `/api/auth/me` | ✓ | Current user |
| POST | `/api/files/upload` | ✓* | Multipart upload (magic-byte validated) |
| GET | `/api/files?page=&limit=` | ✓ | Paginated list |
| GET | `/api/files/:id` | ✓ | Metadata |
| GET | `/api/files/:id/download` | ✓ | Streams file bytes |
| DELETE | `/api/files/:id` | ✓* | Deletes stored file + metadata |
| PUT | `/api/files/:id/toggle-public` | ✓* | Public/private toggle |
| POST | `/api/files/:id/share` | ✓* | Generates expiring share token |
| GET | `/api/files/public/:token/info` | — | Safe metadata for the shared page |
| GET | `/api/files/public/:token` | — | Streams a public file (attachment) |
| GET | `/api/health` | — | DB-aware readiness check |

Mutating requests authenticate via `Authorization: Bearer` **or** the HttpOnly
access-token cookie. Header-based requests are CSRF-exempt (API clients);
cookie-based browser requests must echo the CSRF cookie as a header.

---

## Security

| Area | Control |
|---|---|
| **Tokens** | JWT (15 min) + rotating, hashed, revocable refresh token (7 days) — never in `localStorage` |
| **Cookies** | `HttpOnly` + `Secure` + `SameSite=Lax` |
| **CSRF** | Double-submit cookie token on all cookie-authenticated mutations |
| **Passwords** | bcrypt (cost 12); weak passwords rejected by policy |
| **Brute force** | Per-IP rate limits (login 20/15 min, OTP 30/15 min) + per-email OTP attempt cap |
| **OTPs** | 6 digits from CSPRNG, stored only as SHA-256, 10-min TTL, single-use, burned after 5 failed attempts |
| **Enumeration** | Uniform forgot-password responses regardless of account existence |
| **Uploads** | 100 MB cap, magic-byte MIME sniffing, server-generated object keys |
| **Serving** | Forced `attachment` + `nosniff` for public streams |
| **Headers** | `helmet` CSP / HSTS / anti-sniffing defaults |
| **Secrets** | Never committed; `JWT_SECRET` ≥ 32 chars enforced at boot |
| **At rest** | S3 private ACL + SSE-S3 (AES256) or SSE-KMS |

---

## Testing & quality

```bash
# Backend (needs a test DB; see backend/jest.config.js defaults)
cd backend
JWT_SECRET=test-secret npm test          # 76 tests, runInBand (avoids DB deadlocks)
JWT_SECRET=test-secret npm run test:coverage

# Frontend
cd frontend
npm run lint
npm run build
```

- **76 backend tests** across auth, files, validation, rate limiting, security,
  and email — driving the real app against a dedicated `filestorage_test`
  database with a fully mocked S3 client (no network calls).
- **Enforced coverage thresholds** — statements ≥ 80%, functions ≥ 75%,
  branches ≥ 50% — currently exceeded across all metrics.
- **CI (GitHub Actions)** spins up an ephemeral `postgres:16` service container
  and runs the full suite on every push/PR to `main`, plus frontend lint/build.
- **`npm audit` clean** — 0 known vulnerabilities in the dependency tree.

---

## Project layout

```
filestorage/
├── backend/                  # Express + TypeScript API
│   ├── migrations/           # versioned SQL: 001_initial, 002_refresh_tokens,
│   │                         #               003_auth_verification
│   ├── src/
│   │   ├── config/           # pg pool, env validation (fail-fast), pino logger
│   │   ├── controllers/      # auth + file request handlers
│   │   ├── middleware/       # authenticate (JWT/cookie), csrf, error handler
│   │   ├── models/           # user, file, refreshToken (SQL access)
│   │   ├── routes/           # auth.routes, file.routes
│   │   ├── services/         # auth (tokens/cookies), otp, email (Resend/SMTP),
│   │   │                     # storage (S3/local), file validation, joi schemas
│   │   ├── db/migrate.ts     # idempotent migration runner
│   │   ├── utils/, types/    # crypto helpers, express typing
│   │   └── __tests__/        # Jest + supertest suites
│   ├── Dockerfile            # multi-stage node:20-alpine; runs migrations at boot
│   └── jest.config.js        # coverage thresholds
├── frontend/                 # Next.js 16 app
│   ├── app/                  # login / register / forgot-password / dashboard /
│   │                         # shared/[token]
│   ├── lib/                  # api client (CSRF + single-flight refresh), auth context
│   ├── components/           # Brand, FileTypeIcon, ProductPreview, landing
│   └── next.config.js        # /api/* rewrites → API_BACKEND_URL
├── .github/workflows/ci-cd.yml   # backend tests/coverage + frontend lint/build
├── docker-compose.yml            # db + backend + frontend (local full stack)
└── docs/ARCHITECTURE.md          # system architecture deep-dive
```