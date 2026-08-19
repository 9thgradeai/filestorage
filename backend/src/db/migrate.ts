import fs from 'fs';
import path from 'path';
import { Pool, PoolClient } from 'pg';
import { pool } from '../config/database';

// SQL migration files live in ./migrations at the package root so they survive
// both ts-node (dev) and the compiled dist (production).
export const MIGRATIONS_DIR =
  process.env.MIGRATIONS_DIR || path.join(process.cwd(), 'migrations');

export const migrate = async (target: Pool = pool): Promise<string[]> => {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    throw new Error(`Migrations directory not found: ${MIGRATIONS_DIR}`);
  }

  await target.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) UNIQUE NOT NULL,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const { rows } = await target.query('SELECT name FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.name));

  const appliedNow: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const client: PoolClient = await target.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      appliedNow.push(file);
      console.log(`✅ Applied migration: ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`❌ Migration failed: ${file}`, err);
      throw err;
    } finally {
      client.release();
    }
  }

  if (appliedNow.length === 0) {
    console.log('Database is up to date.');
  }
  return appliedNow;
};

// Drop everything and re-run all migrations (dev/demo convenience).
export const reset = async (target: Pool = pool): Promise<void> => {
  await target.query(`
    DROP TABLE IF EXISTS refresh_tokens;
    DROP TABLE IF EXISTS files;
    DROP TABLE IF EXISTS users;
    DROP TABLE IF EXISTS schema_migrations;
  `);
  await migrate(target);
};

if (require.main === module) {
  const run = async () => {
    const shouldReset = process.argv.includes('--reset');
    if (shouldReset) {
      console.log('Resetting database schema...');
      await reset();
    } else {
      await migrate();
    }
    await pool.end();
  };
  run().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}