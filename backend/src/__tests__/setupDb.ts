import { Pool } from 'pg';
import { migrate } from '../db/migrate';

export default async function globalSetup() {
  const pool = new Pool({
    user: process.env.DB_TEST_USER || 'postgres',
    host: process.env.DB_TEST_HOST || 'localhost',
    database: process.env.DB_TEST_NAME || 'filestorage_test',
    password: process.env.DB_TEST_PASSWORD || 'password',
    port: parseInt(process.env.DB_TEST_PORT || '5432', 10),
  });

  try {
    await migrate(pool);
  } finally {
    await pool.end();
  }
}