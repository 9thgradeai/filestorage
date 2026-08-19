# Secure File Storage

A full-stack, production-grade file storage service.

- **Backend** — Express + TypeScript + PostgreSQL (`backend/`), with pluggable
  storage: local disk (Railway volume / Docker named volume) **or** AWS S3.
- **Frontend** — Next.js 16 (App Router) + React 19 (`frontend/`)
- **Infra** — Docker Compose, GitHub Actions CI/CD, production on Railway
  (backend + Postgres) and Vercel (frontend).

## Features

- Cookie-based auth: JWT access token (15 min) + rotating, DB-backed refresh
  token (7 days), both `HttpOnly`/`SameSite=Lax`; double-submit CSRF protection.
- Files uploaded via a temp-file pipeline, validated by **magic bytes**
  (never trusting the client MIME/extension), then streamed to storage
  (local disk or SSE-encrypted S3) without buffering in RAM (up to 100 MB).
- Public share links with expiry (7 days); unauthenticated streaming forces
  `attachment` + `nosniff` so untrusted content cannot render inline.
- Paginated file listing, structured `pino` logging, DB-aware health check,
  per-IP and per-auth rate limiting, helmet security headers, env validation
  (fails fast in production on missing secrets).
- 59 backend tests with enforced coverage thresholds (statements ≥ 80%,
  functions ≥ 75%, branches ≥ 50%); 0 known `npm audit` vulnerabilities in the
  backend dependency tree.

## Architecture

```
Browser ──► Next.js frontend (:3000)
              │  /api/* rewritten (API_BACKEND_URL)
              ▼
            Express API (:5000) ──► PostgreSQL (:5432)
                                  └─► Storage driver
                                      ├─ local disk (STORAGE_DRIVER=local)
                                      └─ AWS S3 (private, SSE-AES256)
```

The frontend calls `/api/*` on its own origin; Next rewrites those to the
backend. This keeps everything same-origin (no CORS in production) and lets
`SameSite=Lax` cookies work naturally. On Vercel the rewrite is handled at the
platform layer (not an edge function), so uploads up to the 100 MB cap stream
end-to-end.

## Getting started (local)

Prerequisites: Node 20+ and a local PostgreSQL instance. For storage you can
use the built-in **local driver** (no AWS account needed) or AWS S3.

### 1. Database

```bash
psql -U postgres -c "CREATE DATABASE filestorage;"
```

### 2. Backend

```bash
cd backend
cp .env.example .env        # edit DB_* / JWT_SECRET; for local storage set
                            # STORAGE_DRIVER=local (default) — AWS_* only if
                            # STORAGE_DRIVER=s3
npm install
npm run db:migrate          # apply versioned migrations
npm run dev                 # or: npm run build && npm start
```

### 3. Frontend

```bash
cd frontend
cp .env.example .env.local  # optional; defaults to same-origin proxying
npm install
npm run dev                 # http://localhost:3000
```

## Running with Docker Compose

```bash
# JWT_SECRET is required (interpolated with :? so compose fails fast if missing)
# Local storage needs no AWS credentials (a named volume persists /data):
JWT_SECRET='a-very-long-secure-random-value-32-chars' docker compose up --build

# ...or switch to S3:
JWT_SECRET='a-very-long-secure-random-value-32-chars' STORAGE_DRIVER=s3 \
AWS_ACCESS_KEY_ID='...' AWS_SECRET_ACCESS_KEY='...' \
S3_BUCKET_NAME='your-bucket' docker compose up --build
```

- Backend applies migrations automatically on container start.
- Frontend proxies `/api` to the `backend` service — the rewrite target is
  passed as a build arg (`API_BACKEND_URL`) so it works with `npm start`.

## Production deployment (Railway + Vercel)

The live production stack runs the backend and Postgres on Railway and the
frontend on Vercel, with `API_BACKEND_URL` baked into Next.js rewrites so the
browser never leaves the frontend origin (no CORS; `SameSite=Lax` cookies work).

### Backend — Railway

1. `railway init --name <project>` and add a **Postgres** plugin and a
   **backend** service connected to the repo (`rootDirectory: ./backend`).
2. Add a volume (e.g. `backend-volume`) mounted at `/data` for file storage.
3. Set service variables:
   ```
   JWT_SECRET=<long random hex>
   NODE_ENV=production
   STORAGE_DRIVER=local
   STORAGE_DIR=/data
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   FRONTEND_URL=<frontend https URL>
   PUBLIC_FILE_BASE_URL=<frontend https URL>
   ```
4. Deploy: `railway redeploy --service backend --from-source --yes`. The
   Dockerfile runs migrations, then starts the API.

### Frontend — Vercel

1. `vercel link --project <name>` and set the Production env var
   `API_BACKEND_URL` to the backend's public URL (e.g.
   `https://<backend>.up.railway.app`).
2. `vercel --prod --yes`. The `rewrites()` in `next.config.js` route `/api/*`
   to the backend at Vercel's platform layer — large uploads up to 100 MB
   stream through without hitting the edge-function 4.5 MB limit.

## Testing & quality

```bash
# Backend (requires a test DB; see backend/jest.config.js defaults)
cd backend
JWT_SECRET=test-secret npm test        # 59 tests, runInBand to avoid DB deadlocks
JWT_SECRET=test-secret npm run test:coverage

# Frontend
cd frontend
npm run lint
npm run build
```

The test suite spins up the real app against a dedicated `filestorage_test`
database and a fully mocked S3 client (no network calls). CI runs both, plus
typecheck and a coverage gate.

## API surface

| Method | Path                                  | Auth  | Notes                                  |
| ------ | ------------------------------------- | ----- | -------------------------------------- |
| POST   | `/api/auth/register`                  | —     | Creates account, sets auth cookies     |
| POST   | `/api/auth/login`                     | —     | Sets auth cookies + CSRF cookie        |
| POST   | `/api/auth/refresh`                   | —     | Rotates refresh token (cookie)         |
| POST   | `/api/auth/logout`                    | ✓*    | Revokes refresh token                  |
| GET    | `/api/auth/me`                        | ✓     | Current user                           |
| POST   | `/api/files/upload`                   | ✓*    | Multipart upload (magic-byte validated)|
| GET    | `/api/files?page=&limit=`             | ✓     | Paginated list                         |
| GET    | `/api/files/:id`                      | ✓     | Metadata                               |
| GET    | `/api/files/:id/download`             | ✓     | Streams file bytes                     |
| DELETE | `/api/files/:id`                      | ✓*    | Deletes stored file + metadata           |
| PUT    | `/api/files/:id/toggle-public`        | ✓*    | Public/private toggle                  |
| POST   | `/api/files/:id/share`                | ✓*    | Generates expiring share token         |
| GET    | `/api/files/public/:token/info`       | —     | Safe metadata for the shared page      |
| GET    | `/api/files/public/:token`            | —     | Streams a public file (attachment)     |
| GET    | `/api/health`                         | —     | DB-aware readiness check               |

`✓*` = also requires the `X-CSRF-Token` header (echo of the `csrf_token` cookie).

Mutating requests accept auth via the `Authorization: Bearer` header **or** the
HttpOnly access-token cookie; header-based requests are CSRF-exempt (API
clients), cookie-based requests must send the CSRF header (browsers).

## Security notes

- **Tokens never touch `localStorage`** — access/refresh tokens live in
  `HttpOnly` cookies; the access token also rotates on refresh.
- **CSRF** uses the double-submit pattern; `SameSite=Lax` plus the header check
  block cross-site requests.
- **Uploads** are validated against the file's magic bytes, stored under a
  random key (never the client filename), and served with forced download +
  `nosniff`.
- **Migrations** are versioned and idempotent; `schema_migrations` tracks
  applied files, each in its own transaction.
- **Dependencies** are audited clean (0 known vulnerabilities). The frontend
  runs Next 16 + React 19 with ESLint flat config; `/api` calls are rewritten
  to `API_BACKEND_URL` (baked in at build time, so it differs per environment
  without code changes).

## Project layout

```
backend/
  migrations/          versioned SQL migrations (001_initial, 002_refresh_tokens)
  src/
    config/            database pool, env validation, logger
    controllers/       auth + file controllers
    middleware/        authenticate, csrf, error handler
    models/            users, files, refresh_tokens
    routes/            auth.routes, file.routes
    services/          s3, file validation, auth (tokens/cookies), validation
    utils/             crypto helpers
    __tests__/         Jest suites (S3 mocked, real test DB)
  Dockerfile           multi-stage; runs migrations then starts the API
frontend/
  app/                 Next.js App Router pages (login/register/dashboard/shared)
  lib/                 auth context, api client (CSRF + refresh), toaster
  Dockerfile           multi-stage, non-standalone `next start`
docker-compose.yml     db + backend + frontend
.github/workflows/     CI/CD: backend tests/coverage + frontend lint/build
```