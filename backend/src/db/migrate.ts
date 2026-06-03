import fs from 'fs/promises';
import path from 'path';
import { env } from '../config/env';
import { pool } from './pool';

async function runMigration(fileName: string): Promise<void> {
  const filePath = path.resolve(process.cwd(), 'migrations', fileName);
  const sql = await fs.readFile(filePath, 'utf-8');

  await pool.query(sql);
  console.log(`Applied migration: ${fileName}`);
}

async function main(): Promise<void> {
  console.log(`Running migrations against: ${env.DATABASE_URL}`);
  await runMigration('001_init.sql');
  console.log('Migration completed successfully.');
}

void main()
  .catch((error) => {
    console.error('Migration failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
