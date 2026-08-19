# Production-Readiness Plan & Implementation Roadmap

> Derived from a full scan of the repo on 2026-08-16. The spec lives in `PROJECT_PLAN.md`; this
> document captures what is actually present versus what is required to ship a working,
> production-grade full-stack application, plus the implementation order used to get there.

## 1. Current State

| Area | Status |
|------|--------|
| `PROJECT_PLAN.md` | Solid design doc: schema, endpoints, security considerations. This is the spec. |
| `backend/` | Express + TypeScript. Auth controller, file controller, S3 service, file validation, model, middleware, and tests exist. |
| `frontend/` | Next.js (App Router). Two pages and custom CSS. |
| `src/` | Empty leftover directory. Safe to ignore. |
| `.github/workflows/ci-cd.yml` | CI definition that will not currently pass. |

**Bottom line:** The application does **not** run today. The backend will not compile and the
frontend will not build. However, foundational pieces (auth logic, validation, file model, and a
security test suite) are partially in place.

---

## 2. Critical Blockers (won't even start)

1. **Missing `backend/src/routes/file.routes.ts`.** `index.ts` imports it, so the backend fails to
   compile/launch. The six file endpoints (`upload`, `GET /files`, `delete`, `toggle-public`,
   `download`, `public/:token`) have controllers/models but no router wiring.
2. **Import mismatch in auth.** `auth.controller.ts` imports `{ db }`, but `config/database.ts`
   exports `pool`. Compile error.
3. **Backend runs TS as JS.** `package.json` sets `main: src/index.js` and `dev: nodemon
   src/index.js`, with no `build`/`tsc` script. Needs a build step or `ts-node`/`tsx`. Also
   `aws-sdk` v2 is listed but `s3.service.ts` imports `@aws-sdk/client-s3` (v3), which is not
   installed.
4. **Missing dependency `file-type`** in `package.json`, though `fileValidation.ts` imports it.
5. **Frontend routing is broken/swapped.** `app/page.tsx` actually contains the **Login** page
   while `app/dashboard/page.tsx` contains the **home/marketing** page. No real dashboard and no
   register page exist. `page.tsx` also has broken JSX (`<` on line 23) and an invalid
   `export default LoginPage = LoginPage;` statement that returns an empty `</div>`.
6. **Frontend build config missing.** `next.config.js`, `tailwind.config.js`, `postcss.config.js`,
   and `next-env.d.ts` are all absent despite Tailwind being a dependency and used throughout.
   `npm run build` fails and utility classes never apply.
7. **No Multer wiring.** `file.controller` reads `req.file`, but no multer middleware exists
   (no upload route, no multipart body-parser). Uploads cannot function.

---

## 3. Backend Functional Gaps

8. **`file.controller.ts` bugs.** Line 37 references `res.rows` instead of `result.rows`; the
   dedup query reads `req.params.s3_key` (always undefined); a second `Pool` is instantiated
   instead of reusing the shared pool.
9. **No DB schema applied.** `db:migrate` points to `src/db/migrate.js`, which does not exist.
   No migration files, no seed, no docker-compose for Postgres.
10. **Auth input validation.** The controller only checks that email and password exist; tests
    expect `BAD_REQUEST` on invalid email format and weak passwords. Needs Joi/Yup + a password
    policy.
11. **No refresh-token flow** despite `JWT_REFRESH_*` env vars. `logout` is a no-op and performs
    no server-side token revocation/denylist.
12. **Ownership gaps.** `findFileById` with no `userId` means `GET /api/files/:id` enforces no
    ownership. `authenticate` stores the whole decoded payload on `req.user`; the share-token
    generation logic needs the public route that does not yet exist.
13. **Body size vs spec.** `express.json({ limit: '50mb' })` while the plan specifies 100 MB.
    Multer must be configured for 100 MB with early rejection.
14. **Auth rate-limiting.** Only a single global limiter (100/15 min). Login needs a stricter
    per-IP/per-account limiter to resist brute force.
15. **CSP `connectSrc` is hardcoded** to the Vercel URL; should be env-driven.

---

## 4. Frontend Gaps

16. **No API client config.** No `NEXT_PUBLIC_API_URL`, no `.env`. `page.tsx` posts to the
    relative `/api/auth/login`, which will not reach the backend in production.
17. **No auth layer.** No context/guard; token stored in `localStorage` (XSS-exfiltratable);
    `document.location.href` navigation; no `Authorization` interceptor.
18. **No real UI.** No register page, no upload form (with progress), no file list/manage grid,
    no share-link UI, no public-view page.
19. **App Router misuse.** `dashboard/page.tsx` uses `router.asPath` (Pages Router API), which is
    invalid in the App Router.

---

## 5. Infra / Ops / Quality

20. **No `Dockerfile`** (backend or frontend) although CI builds/pushes them. No healthcheck; CI
    references a `frontend:latest` image that is never built.
21. **CI is broken.** Runs `npm ci`/`npm run lint` at the repo root, but there is **no root
    `package.json`**. Needs per-app steps or a workspace. Also `npm test` requires a live
    Postgres (`filestorage_test`) with no service/container in CI, so tests fail.
22. **Jest misconfig.** `coverageReporters: ['lambada']` is a typo (should be `lcov`);
    `identity-obj-proxy` is referenced but not installed; importing `index.ts` in tests calls
    `app.listen(5000)` at import time (should be lazy/skipped under test).
23. **No `.gitignore`** (root or backend), risking committed `node_modules`/`.env`. No README, no
    `vercel.json`/deploy config.
24. **Security hardening not done.** No ClamAV/AV scan, no SSE-KMS on S3, no S3 bucket
    policy/versioning/lifecycle, no shared `share_token` generation endpoint exposed.

---

## 6. Implementation Order (MVP-first)

1. **Fix compile blockers** — add `file.routes.ts`; fix `db` → `pool` import; add `@aws-sdk/client-s3`
   + `file-type`; correct `package.json` scripts and dependencies.
2. **Add Multer (100 MB)** and wire upload/list/delete/toggle/public routes.
3. **Add DB migrations + docker-compose Postgres**; make tests run against a test container.
4. **Fix frontend** — split into real `/` (home), `/login`, `/register`, `/dashboard`; add
   `next.config`/tailwind/postcss; API client + auth provider; upload UI.
5. **Add Dockerfiles + fix CI** (per-app, with a Postgres service).
6. **Layer on security** — AV scan, encryption, stricter rate limits, share-token endpoint.

---

## 7. Definition of Done (MVP)

- `npm run build` succeeds for both backend and frontend.
- `npm test` passes against a disposable Postgres instance.
- A user can register, log in, upload a file (≥100 MB), list/delete files, toggle public/private,
  and fetch a public file via a share token.
- CI runs lint + tests + build and produces Docker images.
- `.gitignore` and sensible documentation are in place.
