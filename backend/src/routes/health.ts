import { Router } from 'express';
import { pool } from '../db/pool';

export const healthRouter = Router();

healthRouter.get('/', async (_req, res) => {
  try {
    await pool.query('select 1');
    res.json({ ok: true, service: 'healthpoints-backend', db: 'up' });
  } catch {
    res.status(503).json({ ok: false, service: 'healthpoints-backend', db: 'down' });
  }
});
