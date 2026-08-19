// Runs before the test framework is loaded (setupFiles).
// Normalizes test environment so the app boots deterministically under Jest.

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// Keep the global limiter permissive by default so individual suites are not
// throttled out; the rate-limit suite exercises the throttle in isolation.
if (!process.env.RATE_LIMIT_MAX) process.env.RATE_LIMIT_MAX = '100000';
if (!process.env.RATE_LIMIT_WINDOW_MS) process.env.RATE_LIMIT_WINDOW_MS = '600000';

// Use a small upload cap under test so size-limit scenarios run with tiny
// buffers instead of allocating ~100MB per test. Forced unconditionally so an
// ambient .env (e.g. from a local backend/.env) cannot leak MAX_FILE_SIZE into
// the suite and silently change which files are accepted.
process.env.MAX_FILE_SIZE = '1024';