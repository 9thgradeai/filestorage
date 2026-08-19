# Secure File Storage

A full-stack, production-grade file storage service.

- **Backend** — Express + TypeScript + PostgreSQL + AWS S3 (`backend/`)
- **Frontend** — Next.js 16 (App Router) + React 19 (`frontend/`)
- **Infra** — Docker Compose, GitHub Actions CI/CD

## Features

- Cookie-based auth: JWT access token (15 min) + rotating, DB-backed refresh
  token (7 days), both `HttpOnly`/`SameSite=Lax`; double-submit CSRF protection.
- Files uploaded via a temp-file pipeline, validated by **magic bytes**
  (never trusting the client MIME/extension), then streamed to **private,
  SSE-encrypted S3** without buffering in RAM (up to 100 MB).
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
              │  /api/* proxied (rewrite → API_BACKEND_URL)
              ▼
            Express API (:5000) ──► PostgreSQL (:5432)
                                  └─► AWS S3 (private, SSE-AES256)
```

The frontend calls `/api/*` on its own origin; Next rewrites those to the
backend. This keeps everything same-origin (no CORS in production) and lets
`SameSite=Lax` cookies work naturally.

## Getting started (local)

Prerequisites: Node 20+, a local PostgreSQL instance, and AWS credentials.

### 1. Database

```bash
psql -U postgres -c "CREATE DATABASE filestorage;"
```

### 2. Backend

```bash
cd backend
cp .env.example .env        # edit DB_* / JWT_SECRET / AWS_*
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
JWT_SECRET='a-very-long-secure-random-value-32-chars' \
AWS_ACCESS_KEY_ID='...' AWS_SECRET_ACCESS_KEY='...' \
S3_BUCKET_NAME='your-bucket' docker compose up --build
```

- Backend applies migrations automatically on container start.
- Frontend proxies `/api` to the `backend` service via runtime `API_BACKEND_URL`.

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
| DELETE | `/api/files/:id`                      | ✓*    | Deletes S3 object + metadata           |
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
  runs Next 16 + React 19 with ESLint flat config; `/api` calls are proxied at
  runtime by a Next proxy (`proxy.ts`) so `API_BACKEND_URL` can differ per
  environment without a rebuild.

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
  Dockerfile           Next standalone output
docker-compose.yml     db + backend + frontend
.github/workflows/     CI/CD: backend tests/coverage, frontend lint/build, Docker push
```