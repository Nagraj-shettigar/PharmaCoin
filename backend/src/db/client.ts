import { Pool } from '@neondatabase/serverless';

export { Pool };

/**
 * Anything that can run a parameterised query — a Neon `Pool` or a checked-out
 * client from `pool.connect()`. Repositories accept this so they work both for
 * one-shot queries and inside a transaction.
 */
export type Queryable = Pick<Pool, 'query'>;

/**
 * Create a per-request Neon pool from the Worker's `DATABASE_URL` binding.
 * Neon's serverless driver talks to Postgres over WebSocket/HTTP, so it runs on
 * Cloudflare Workers (no raw TCP). Create one per request and `end()` it after.
 */
export function createPool(connectionString: string): Pool {
  return new Pool({ connectionString });
}
