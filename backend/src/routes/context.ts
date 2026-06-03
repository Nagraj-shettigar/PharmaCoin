import { Router } from 'express';
import { pool } from '../db/pool';

export const contextRouter = Router();

interface OrgRow {
  id: string;
  code: string;
}

interface StoreRow {
  id: string;
  code: string;
}

contextRouter.get('/default', async (_req, res, next) => {
  const client = await pool.connect();

  try {
    await client.query('begin');

    const orgResult = await client.query<OrgRow>(
      `
      insert into organizations (name, code)
      values ('HealthPoints Demo Org', 'HPORG')
      on conflict (code)
      do update set name = excluded.name
      returning id, code
      `
    );

    const orgId = orgResult.rows[0].id;

    const storeResult = await client.query<StoreRow>(
      `
      insert into stores (organization_id, name, code)
      values ($1, 'Main Store', 'HPMN')
      on conflict (organization_id, code)
      do update set name = excluded.name
      returning id, code
      `,
      [orgId]
    );

    await client.query('commit');

    return res.json({
      organizationId: orgId,
      organizationCode: orgResult.rows[0].code,
      storeId: storeResult.rows[0].id,
      storeCode: storeResult.rows[0].code,
    });
  } catch (error) {
    await client.query('rollback');
    return next(error);
  } finally {
    client.release();
  }
});
