# Vault (filestorage) — System Architecture

> A production-grade, full-stack file-storage platform with cookie-based
> authentication, real-email OTP verification, shareable public links, and
> pluggable object storage. Written as the source of truth for how the system
> is built, deployed, and operated.

---

## 1. System Overview

**Vault** is a secure file-storage web application. Users register with a real
email (verified via a one-time code), sign in with cookie-based sessions, upload
files, and share them via time-limited public links.

```
                          ┌─────────────────────────────────────────────┐
                          │                  User / Browser             │
                          └──────────────────────┬──────────────────────┘
                                                 │ HTTPS (edge CDN)
                                                 ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                          Vercel (Frontend CDN/Edge)                       │
│  Next.js 16 (App Router) — static/SSR pages; /api/* rewrites stream to   │
│  the backend at the platform layer (bypasses the 4.5 MB edge-function    │
│  payload cap, enabling up to 100 MB uploads)                              │
└──────────────────────────────┬─────────────────────────────────────────────┘
                               │ HTTPS (same-origin /api/*)
                               ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                     Railway — backend service (Node 20)                   │
│  Express 4 + TypeScript                                                    │
│  • Auth: register / OTP verify / login / refresh / logout / me            │
│  • Files: upload / list / download / delete / share                        │
│  • Email: Resend HTTPS API (primary) + SMTP fallback (non-blocking)       │
└────────────┬──────────────────────────────┬───────────────────────────────┘
             │                              │
             ▼                              ▼
┌──────────────────────────┐   ┌────────────────────────────────────────────┐
│  Railway Postgres (16)   │   │  Object storage (pluggable driver):        │
│  users / files /         │   │  • STORAGE_DRIVER=s3  → AWS S3 (SSE-S3/    │
│  refresh_tokens /        │   │     SSE-KMS, private ACL, presigned URLs)  │
│  email_otps              │   │  • STORAGE_DRIVER=local → Railway volume   │
└──────────────────────────┘   └────────────────────────────────────────────┘
```

**Deployment topology:** single git monorepo (`9thgradeai/filestorage`) →
GitHub Actions CI → two platforms:
- **Vercel** — serves the Next.js frontend (Project `filestorage`,
  `rootDirectory: frontend`, framework `nextjs`).
- **Railway** — runs the Express backend + Postgres (Service `backend`,
  environment `production`, project `filestorage`).

The backend and frontend live behind one origin from the browser's perspective:
Next.js rewrites `/api/*` to the backend at Vercel's platform layer, so cookies
work with `SameSite=Lax` and no CORS is exercised in production.

---

## 2. Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend** | Next.js 16 (App Router), React 19 | RSC + client components, edge-ready |
| Frontend | TypeScript 5.9 | Static typing |
| Frontend | motion (Framer Motion v13), Phosphor Icons, react-hot-toast | UI/UX polish, toasts |
| Frontend | eslint-config-next | Linting |
| **Backend** | Node 20 + Express 4 + TypeScript | HTTP API |
| Backend | pino / pino-http | Structured + access logging |
| Backend | helmet, cors, cookie-parser | Security headers, CORS, cookies |
| Backend | express-rate-limit | Per-IP brute-force / abuse throttling |
| Backend | joi | Request validation |
| Backend | jsonwebtoken, bcryptjs | JWT access tokens, password hashing |
| Backend | pg (`node-postgres`) + `Pool` | PostgreSQL access (transactional) |
| Backend | multer + `magic-bytes.js` | Multipart uploads + MIME sniffing |
| Backend | @aws-sdk/client-s3, s3-request-presigner | S3 object storage + presigned URLs |
| Backend | nodemailer (SMTP fallback) | Email when SMTP is available |
| Backend | **Resend REST API** (HTTPS) | Primary email delivery |
| **Database** | PostgreSQL 16 (Railway Postgres / Docker) | Relational data store |
| **Storage** | AWS S3 **or** local volume (driver switch) | Object/blob storage |
| **Email** | Resend (HTTPS API) + SMTP fallback | OTP / verification / reset mail |
| **CI/CD** | GitHub Actions (Jest against ephemeral Postgres) | Test gate on push/PR |
| **Deploy** | Vercel (frontend) + Railway (backend & DB) | Production hosting |
| **Containers** | Docker (backend multi-stage, node:20-alpine) | Reproducible image |
| **Local dev** | docker-compose (db/backend/frontend) | Full-stack parity |

---

## 3. Repository Layout

```
filestorage/
├── backend/                 # Express API (TypeScript, compiled to dist/)
│   ├── migrations/          # versioned SQL (001–004)
│   ├── src/
│   │   ├── config/          # env validation, pg pool, pino logger
│   │   ├── controllers/     # auth, file, folder, and AI chat handlers
│   │   ├── middleware/      # authenticate, csrf, errorHandler
│   │   ├── models/          # user, file, folder, refreshToken (SQL access)
│   │   ├── routes/          # auth.routes, file.routes, folder.routes, ai.routes
│   │   ├── services/        # auth, otp, email, validation, storage, s3, trashPurge
│   │   ├── db/migrate.ts    # idempotent migration runner
│   │   ├── types/, utils/   # express typing, crypto helpers
│   │   └── __tests__/       # Jest + supertest suites
│   ├── Dockerfile           # multi-stage node:20-alpine build
│   └── jest.config.js       # test + coverage thresholds
├── frontend/                # Next.js 16 app
│   ├── app/                 # pages: dashboard, login, register, forgot-password,
│   │                        # settings, shared/[token], terms, privacy
│   ├── lib/                 # api client, auth context, drive helpers
│   ├── components/          # Brand, FileTypeIcon, ProductPreview, landing, drive UI
│   └── next.config.js       # /api/* rewrites to API_BACKEND_URL
├── .github/workflows/ci-cd.yml   # backend tests against ephemeral Postgres
├── docker-compose.yml       # local db + backend + frontend
└── README.md / PROJECT_PLAN.md
```

---

## 4. Data Model (PostgreSQL)

Four versioned, idempotent migrations are applied at container boot by
`backend/src/db/migrate.ts` (runs `node dist/db/migrate.js` in the Docker CMD
before the API starts).

### `users` (001 → 003)
| Column | Type | Notes |
|---|---|---|
| id | SERIAL PK | |
| email | VARCHAR(255) UNIQUE NOT NULL | normalized lowercase at the app layer |
| password_hash | TEXT NOT NULL | bcrypt, cost 12 |
| name | VARCHAR(100) NOT NULL DEFAULT '' | added in 003 |
| email_verified_at | TIMESTAMP NULL | null = unverified; gates login (403) |
| created_at / updated_at | TIMESTAMP | |

### `files` (001 → 004)
| Column | Type | Notes |
|---|---|---|
| id | SERIAL PK | |
| user_id | FK → users ON DELETE CASCADE | ownership |
| original_filename | VARCHAR(255) | display name only |
| stored_filename / s3_key | UNIQUE | server-generated, never client-provided |
| file_size | BIGINT | byte count |
| mime_type | VARCHAR(100) | derived from magic-bytes sniffing |
| is_public | BOOLEAN DEFAULT FALSE | |
| share_token | VARCHAR(64) UNIQUE | opaque share identifier |
| share_expires_at | TIMESTAMP | time-limited public access |
| parent_id | FK → folders ON DELETE SET NULL (004) | folder membership |
| starred | BOOLEAN NOT NULL DEFAULT FALSE (004) | favorites |
| trashed_at | TIMESTAMP NULL (004) | non-null = in trash; purged after retention |
| created_at / updated_at | TIMESTAMP | |
| Indexes | user_id, is_public, share_token, (user_id, trashed_at) | |

### `folders` (004)
| Column | Type | Notes |
|---|---|---|
| id | SERIAL PK | |
| user_id | FK → users ON DELETE CASCADE | ownership |
| name | VARCHAR(255) NOT NULL | not unique per user |
| parent_id | FK → folders ON DELETE CASCADE NULL | nesting; cycles blocked at the app layer |
| trashed_at | TIMESTAMP NULL | trash applies to the whole subtree recursively |
| created_at / updated_at | TIMESTAMP | |
| Indexes | user_id, parent_id, (user_id, trashed_at) | |

### `refresh_tokens` (002)
| Column | Type | Notes |
|---|---|---|
| id | SERIAL PK | |
| user_id | FK → users ON DELETE CASCADE | |
| token_hash | VARCHAR(64) UNIQUE | SHA-256 of the raw token — the raw value exists only in an HttpOnly cookie |
| expires_at | TIMESTAMP | |
| revoked_at | TIMESTAMP NULL | server-side revocation (logout, password reset) |
| created_at | TIMESTAMP | |
| Indexes | user_id, token_hash | |

### `email_otps` (003)
| Column | Type | Notes |
|---|---|---|
| id | SERIAL PK | |
| email | VARCHAR(255) | normalized |
| purpose | VARCHAR(32) | `email_verification` \| `password_reset` |
| code_hash | TEXT | SHA-256 of the 6-digit code — raw code never persisted |
| expires_at | TIMESTAMPTZ | 10-minute TTL |
| attempts | INTEGER DEFAULT 0 | brute-force counter; ≥ 5 burns the code |
| used_at / created_at | TIMESTAMP | single-use enforcement |
| Indexes | (email, purpose), expires_at | |

### Design decisions
- **Hashed secrets everywhere:** refresh tokens and OTPs are stored as SHA-256
  hashes; a DB leak does not expose usable credentials.
- **TIMESTAMPTZ for expires_at:** UTC-aware comparisons with app-generated
  timestamps.
- **Row-level OTP atomicity:** `SELECT … FOR UPDATE` inside a transaction
  serializes verify/issue against the same (email, purpose) so a code is
  single-use even under concurrency.
- **`name` default `''`:** additive migration (003) back-fills legacy rows
  rather than forcing a rewrite of existing accounts.

---

## 5. Authentication & Session Security

### 5.1 Session architecture (cookie-based, defense-in-depth)

- **Access token:** short-lived JWT (default `15m`), carried in an **HttpOnly**
  cookie named `token`.
- **Refresh token:** opaque random 256-bit value, persisted **hashed** in
  `refresh_tokens`, issued for `REFRESH_TOKEN_DAYS` (7), in an **HttpOnly**
  cookie with `Max-Age`.
- **Rotation:** `POST /api/auth/refresh` verifies the old token, revokes it
  (`revoked_at`), and issues a new pair — replay of a rotated token returns 401.
- **Cookie flags:** `HttpOnly`, `Secure` (production), `SameSite=Lax`, `Path=/`
  — scripts cannot read tokens and cross-site requests are not attached.
- **CSRF (double-submit cookie):** every cookie-authenticated mutation must echo
  a non-HttpOnly `csrf_token` cookie as the `X-CSRF-Token` header. Bearer-token
  clients and safe methods are exempt (`middleware/csrf.ts`).
- **API clients:** `Authorization: Bearer <jwt>` is supported alongside cookies
  by `middleware/authenticate.ts`.

### 5.2 Registration & email verification (OTP)

```
register(name, email, password, confirmPassword)
  └─ validate (joi: name, email, password ≥ 8 w/ rules, confirm match)
  └─ findByEmail (normalized) → 409 if exists
  └─ bcrypt.hash(password, 12)
  └─ INSERT user (email_verified_at = NULL)
  └─ issueOtp('email_verification')          → 6-digit CSPRNG, 10-min TTL
  └─ sendOtpEmailAsync(...)                  → NON-BLOCKING (Resend/SMTP)
  └─ 201 (no auto-login; no session cookies)
```

- **verify-email(email, otp):** validates the hash, burns the code, sets
  `email_verified_at`, and issues the first session. Wrong OTPs increment
  `attempts`; after 5 the code is invalidated (burned).
- **login:** unverified accounts get **403 `EMAIL_NOT_VERIFIED`** (with a
  client hint to resend) rather than a session.
- **resend-otp:** enforced by a 60-second DB-backed cooldown read at request
  time; each resend invalidates the previous unused code.

### 5.3 Password reset (enumeration-safe)

- **forgot-password(email):** *always* returns the same message regardless of
  whether the address exists (no account enumeration). Only sends when a
  verified account is found.
- **reset-password(email, otp, password):** verifies the reset OTP, updates the
  bcrypt hash, **marks email verified** (proves ownership), and revokes all
  sessions for that user — old passwords and tokens are immediately worthless.

### 5.4 OTP service hardening (`services/otp.service.ts`)
- 6 digits from `crypto.randomInt` (CSPRNG, uniform).
- Stored only as SHA-256 hash; compared with `crypto.timingSafeEqual`.
- 10-minute TTL, max 5 attempts then burn, single-use, resend cooldown.
- Expired rows purged at boot and by a 6-hour sweep (`setInterval`).
- Per-IP rate limits backstop per-email controls (`authLimiter` 20/15m,
  `otpLimiter` 30/15m).

### 5.5 Email delivery (`services/email.service.ts`)
- **Resend HTTPS API is the primary provider** — `POST https://api.resend.com/emails`
  with `Authorization: Bearer <RESEND_API_KEY>`. This is required because
  Railway blocks outbound SMTP (ports 25/465/587) on Free/Trial/Hobby plans.
- **SMTP (nodemailer) is a fallback** for Pro plans/local dev, with explicit
  15-second timeouts so failures fail fast instead of the 120s default.
- **Non-blocking delivery:** OTP emails are dispatched via
  `sendOtpEmailAsync(...)` (fire-and-forget). The code is already persisted in
  the DB, so register/resend/forgot respond in milliseconds even if delivery is
  slow; failures are logged and recoverable via resend.
- Provider selection: Resend if `RESEND_API_KEY` set, else SMTP if
  `SMTP_HOST/USER/PASS` set, else console-log (dev). Production boot fails if
  neither provider is configured (`config/env.ts`).

---

## 6. File Storage & Sharing

### 6.1 Upload pipeline (`file.routes.ts` → `file.controller.ts`)

1. **Authentication** (`authenticate`) → 401 for anonymous uploads.
2. **CSRF check** (`csrfProtect`) for cookie sessions.
3. **Multer** streams the multipart body to a **private OS temp dir** with a
   server-generated name (`<timestamp>-<randomHex(8)>`) — never the
   client filename, so 100 MB uploads never buffer in RAM and paths stay safe.
4. **Magic-byte sniffing** (`magic-bytes.js`) infers the real `mime_type` from
   content, independent of the claimed filename/type.
5. **Storage driver** (`storage.service.ts`) writes the object:
   - `STORAGE_DRIVER=s3` → **AWS S3** (`PutObjectCommand`, `ACL: private`,
     SSE-S3 AES256 or SSE-KMS, key `<userId>/<timestamp>-<random>-<sanitized>`).
   - `STORAGE_DRIVER=local` → Railway **volume** at `STORAGE_DIR` with a
     path-traversal guard (`localPath`).
6. A `files` row records metadata; the DB is the source of truth for listings
   and ACLs.

### 6.2 Access control
- All file routes require ownership: `:id` operations filter by `user_id`.
- `download` streams from storage (`GetObjectCommand` / `createReadStream`) with
  the authenticated session.
- **Public sharing:** `POST /:id/share` generates an opaque `share_token` (only
  for the owner) with `share_expires_at` (`SHARE_LINK_EXPIRY_DAYS`, default 7).
  Unauthenticated access is possible only via `/public/:shareToken` and
  `/public/:shareToken/info`, gated on `is_public` + expiry.
- S3 driver additionally supports **presigned URLs** (`generateShareableLink`).

### 6.3 Storage driver abstraction
A single interface (`storageUpload/Delete/Download`) selects the backend by env,
so S3 and local-volume deployments share identical application logic — ideal for
free-tier (volume) and production-scale (S3) usage.

---

## 7. API Surface

### Auth (`/api/auth`)
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/register` | — | Create unverified account, email OTP |
| POST | `/verify-email` | — | Verify OTP, activate, sign in |
| POST | `/resend-otp` | — | Resend code (60s cooldown) |
| POST | `/forgot-password` | — | Email reset code (enumeration-safe) |
| POST | `/reset-password` | — | OTP + new password; revoke sessions |
| POST | `/login` | — | Sign in (verified only) |
| POST | `/refresh` | — | Rotate refresh token |
| POST | `/logout` | CSRF | Revoke + clear cookies |
| GET | `/me` | JWT | Current user |

### Files (`/api/files`)
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/upload` | JWT+CSRF | Multipart upload |
| GET | `/` | JWT | List owned files (pagination, filters) |
| GET | `/stats` | JWT | Quota meter + counts |
| GET | `/recent` | JWT | Most recent active files |
| GET | `/:id` | JWT | File metadata |
| PUT | `/:id` | JWT+CSRF | Rename / move |
| DELETE | `/:id` | JWT+CSRF | Permanent delete (storage first, then row) |
| POST | `/:id/trash` / `/restore` | JWT+CSRF | Soft-delete lifecycle |
| POST | `/:id/star` | JWT+CSRF | Toggle starred |
| PUT | `/:id/toggle-public` | JWT+CSRF | Toggle shareability |
| GET | `/:id/download` | JWT | Stream bytes |
| POST | `/:id/share` | JWT+CSRF | Create share token |
| GET | `/public/:token/info` | — | Public metadata |
| GET | `/public/:token` | — | Public download |

### Folders (`/api/folders`)
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | JWT | List owned folders |
| POST | `/` | JWT+CSRF | Create (optional parent) |
| PUT | `/:id` | JWT+CSRF | Rename / move (cycle-checked) |
| POST | `/:id/trash` | JWT+CSRF | Trash subtree recursively |
| POST | `/:id/restore` | JWT+CSRF | Restore subtree |
| DELETE | `/:id` | JWT+CSRF | Permanent delete incl. storage objects |

### AI (`/api/ai`)
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/chat` | JWT+CSRF | Vault AI assistant (Groq tool-calling; file/folder ops, search, stats). Falls back to a config-missing notice when `GROQ_API_KEY` is unset. |

### System
- `GET /api/health` — DB-aware health (200/503) for load-balancer draining.

### Background jobs
- OTP sweep every 6h (`purgeExpiredOtps`).
- Trash purge on boot + every 24h: rows past `TRASH_RETENTION_DAYS`
  (default 30) are deleted atomically with `RETURNING s3_key`, then objects are
  removed best-effort with retries.

---

## 8. Frontend (Next.js 16)

- **App Router** with client components; routes: `/` (landing),
  `/register` (multi-step name → OTP → verify), `/login` (incl. resend +
  forgot), `/forgot-password` (email → OTP → new password), `/dashboard`
  (files + folders + trash + AI chat), `/settings` (profile, password, email,
  account deletion), `/shared/[token]` (public file), `/terms`, `/privacy`.
- **`lib/api.ts`** — typed fetch wrapper that:
  - sends `credentials: 'include'` (cookie sessions),
  - attaches `X-CSRF-Token` from the non-HttpOnly cookie on mutations,
  - transparently refreshes on 401 with a shared single-flight
    `tryRefreshSession()` and retries once,
  - streams downloads as blobs with Content-Disposition filename parsing.
- **`lib/auth.tsx`** — React context exposing
  `user / register / verifyEmail / resendOtp / forgotPassword / resetPassword /
  login / logout`, bootstrapped by `GET /me`.
- **`next.config.js` rewrites:** `/api/:path* → ${API_BACKEND_URL}/api/:path*`
  resolved at build time (`API_BACKEND_URL` on Vercel). The rewrite happens at
  the platform layer so **large uploads stream at the edge** rather than being
  buffered by a middleware/edge function (avoids the ~4.5 MB edge limit).
- Same-origin architecture → `SameSite=Lax` cookies + no CORS in production.

---

## 9. Deployment & Operations

### 9.1 Build & run
- **Backend Dockerfile** (multi-stage, `node:20-alpine`): `npm ci` → `tsc` →
  `npm ci --omit=dev` → copy `dist/` + `migrations/`. CMD runs
  `node dist/db/migrate.js && node dist/index.js` (migrations are idempotent
  and re-runnable).
- **Railway** (manual deploys from source — GitHub push does **not** auto-deploy
  to this service):
  `railway redeploy --service backend --environment production --from-source --yes`.
- **Vercel** auto-deploys from GitHub pushes to `main` (project settings:
  `rootDirectory: frontend`, `framework: nextjs`).

### 9.2 Required production environment
Backend (Railway): `NODE_ENV=production`, `JWT_SECRET` (≥ 32 chars),
`DATABASE_URL` (Postgres plugin), `FRONTEND_URL`, `PUBLIC_FILE_BASE_URL`,
`STORAGE_DRIVER=local` + `STORAGE_DIR=/data` (volume) **or** S3 vars, and an
email provider: `RESEND_API_KEY` (+ `EMAIL_FROM_NAME`/`EMAIL_FROM_EMAIL`)
**or** SMTP vars. Boot-time validation in `config/env.ts` fails fast on missing
values.

Frontend (Vercel): `API_BACKEND_URL=https://<backend>.up.railway.app`.

### 9.3 Health & logging
- Structured pino logs (access + app), pino-http request IDs.
- `GET /api/health` DB probe; Dockerfile `HEALTHCHECK` every 30s.
- Graceful shutdown on SIGINT/SIGTERM with a 10s force-exit fallback.

---

## 10. Testing & Quality Gates

- **Jest 29 + ts-jest + supertest**, `--runInBand` (avoids DB deadlocks),
  against a dedicated test DB (`filestorage_test`).
- **76 tests** across 6 suites: auth controller (full OTP lifecycle incl.
  brute-force burn, session revocation, refresh rotation, CSRF), file
  controller/validation (magic-bytes, limits), rate limiting, security headers,
  email service (Resend mock, SMTP fallback, async capture).
- **Coverage thresholds:** statements 80, branches 50, functions 75, lines 80 —
  enforced globally; currently exceeding all.
- **CI (GitHub Actions):** runs the full backend suite against an ephemeral
  `postgres:16` service container on every push/PR to `main`.
- Frontend: `next build` + `eslint` clean.
- Test-mode email capture (`getLastSentCode`) lets suites drive the complete
  OTP flow deterministically with zero network.

---

## 11. Operational Incidents Resolved (Engineering Notes)

1. **Vercel deploy failures on GitHub push** — a stray root `vercel.json`
   contained `rootDirectory` (invalid in that schema), breaking every
   GitHub-triggered deploy. Removed the file; rootDirectory lives only in the
   Vercel project settings. Pushes now deploy cleanly (`framework: nextjs`).
2. **Email delivery timeout in production** — the backend awaited SMTP delivery
   and Railway blocks outbound SMTP on free plans, so `register` hung ~120s and
   no mail sent. Fixed by switching to the **Resend HTTPS API** and making
   delivery **non-blocking**; register/resend/forgot now return in ~40 ms and
   OTP mail is delivered.
3. **Misleading 409/429 during testing** — caused by earlier requests still
   completing server-side after the client timed out (120s SMTP wait), plus a
   macOS `md5` formatting quirk in an ad-hoc email generator; not an
   application defect. Confirm via logs/DB before chasing ghosts.

---

## 12. Security Posture Summary

| Area | Control |
|---|---|
| Passwords | bcrypt (cost 12); rejected if weak (joi policy) |
| Tokens | Short-lived JWT + rotating, hashed, revocable refresh tokens |
| Cookies | HttpOnly + Secure + SameSite=Lax |
| CSRF | Double-submit cookie token on all cookie-authenticated mutations |
| Brute force | Per-IP rate limits (login 20/15m, OTP 30/15m) + per-email OTP attempt cap |
| OTPs | CSPRNG, SHA-256 stored, 10-min TTL, single-use, cooldown |
| Email enumeration | Uniform forgot-password responses |
| Uploads | Size cap (100 MB), magic-byte MIME sniffing, server-generated paths |
| Path traversal | Storage-key guard + server-side naming |
| Headers | helmet CSP/HSTS/anti-sniffing defaults |
| Secrets | Never persisted in code; validated at boot; JWT_SECRET ≥ 32 chars |
| File objects | S3 private ACL + SSE (S3/KMS) |