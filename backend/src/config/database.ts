import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const isTest = process.env.NODE_ENV === 'test';

// Managed Postgres providers (Railway, Neon, RDS, Heroku) hand the app a single
// DATABASE_URL connection string. When present it takes precedence over the
// field-by-field DB_* config and its sslmode is honored.
const databaseUrl =
  process.env.DATABASE_URL ||
  (isTest ? process.env.DB_TEST_DATABASE_URL : undefined);

const sslFromConnectionString = (url: string) => {
  const mode = new URL(url).searchParams.get('sslmode');
  if (mode === 'require' || mode === 'verify-ca' || mode === 'verify-full') {
    return { rejectUnauthorized: mode !== 'require' };
  }
  return false;
};

// When running under Jest, connect to the dedicated test database so that
// application queries and test fixtures target the same instance. Fall back to
// conventional local defaults so `npm test` works without a .env file.
const pool = new Pool(
  databaseUrl
    ? {
        connectionString: databaseUrl,
        ssl: sslFromConnectionString(databaseUrl),
        max: isTest ? 10 : 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: isTest ? 5000 : 2000,
      }
    : {
        host:
          (isTest ? process.env.DB_TEST_HOST : process.env.DB_HOST) || 'localhost',
        port: parseInt(
          (isTest ? process.env.DB_TEST_PORT : process.env.DB_PORT) || '5432',
          10
        ),
        database:
          (isTest ? process.env.DB_TEST_NAME : process.env.DB_NAME) ||
          (isTest ? 'filestorage_test' : 'filestorage'),
        user:
          (isTest ? process.env.DB_TEST_USER : process.env.DB_USER) || 'postgres',
        password:
          (isTest ? process.env.DB_TEST_PASSWORD : process.env.DB_PASSWORD) ||
          (isTest ? 'password' : undefined),
        max: isTest ? 10 : 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: isTest ? 5000 : 2000,
        // SSL is opt-in (set DB_SSL=true) so local/dev/Docker Postgres works out of
        // the box while managed providers (RDS, Neon, etc.) can require it.
        ssl:
          process.env.DB_SSL === 'true'
            ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }
            : false,
      }
);

export { pool };