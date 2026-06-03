import fs from 'fs/promises';
import path from 'path';
import { env } from '../config/env';
import { pool } from './pool';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'migrations');

async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name        TEXT PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function appliedMigrations(): Promise<Set<string>> {
  const { rows } = await pool.query<{ name: string }>('SELECT name FROM _migrations');
  return new Set(rows.map((r) => r.name));
}

async function listMigrationFiles(): Promise<string[]> {
  const files = await fs.readdir(MIGRATIONS_DIR);
  return files.filter((f) => f.endsWith('.sql')).sort((a, b) => a.localeCompare(b));
}

/** Apply one migration file inside its own transaction, then record it. */
async function applyMigration(fileName: string): Promise<void> {
  const sql = await fs.readFile(path.join(MIGRATIONS_DIR, fileName), 'utf-8');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('INSERT INTO _migrations (name) VALUES ($1)', [fileName]);
    await client.query('COMMIT');
    console.log(`Applied migration: ${fileName}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  // Hide credentials when logging the target.
  const target = env.DATABASE_URL.replace(/:\/\/[^@]*@/, '://***@');
  console.log(`Running migrations against: ${target}`);

  await ensureMigrationsTable();
  const done = await appliedMigrations();
  const files = await listMigrationFiles();
  const pending = files.filter((f) => !done.has(f));

  if (pending.length === 0) {
    console.log('No pending migrations. Database is up to date.');
    return;
  }

  for (const file of pending) {
    await applyMigration(file);
  }
  console.log(`Migration completed successfully (${pending.length} applied).`);
}

void main()
  .catch((error) => {
    console.error('Migration failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
