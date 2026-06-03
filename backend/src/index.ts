import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';
import { createPool } from './db/client';
import {
  findCustomerByMobile,
  findLatestInvoiceByCustomer,
  listCustomers,
  upsertCustomerByMobile,
} from './modules/customers/customer.repository';
import { listInvoices } from './modules/invoices/invoice.repository';
import { createInvoice } from './modules/invoices/invoice.service';

type Bindings = {
  DATABASE_URL: string;
  CORS_ORIGIN: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// ---- CORS (allow-list from CORS_ORIGIN, comma-separated) ----
app.use('*', (c, next) => {
  const allowed = c.env.CORS_ORIGIN.split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return cors({
    origin: (origin) => (allowed.includes(origin) ? origin : (allowed[0] ?? '')),
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
    maxAge: 86400,
  })(c, next);
});

app.onError((err, c) => {
  console.error(err);
  return c.json({ message: 'Internal server error' }, 500);
});

function hasPgCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === code
  );
}

// ---- Schemas ----
const lookupQuerySchema = z.object({
  mobile: z.string().regex(/^\d{10}$/, 'mobile must be a valid 10-digit number'),
});

const upsertCustomerSchema = z.object({
  organizationId: z.string().uuid(),
  storeId: z.string().uuid(),
  mobile: z.string().regex(/^\d{10}$/, 'mobile must be a valid 10-digit number'),
  name: z.string().trim().min(1).max(120),
});

const listCustomersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(2000).default(500),
});

const medicineLineSchema = z.object({
  medicineId: z.string().trim().min(1).max(120).nullish(),
  name: z.string().trim().min(1).max(200),
  manufacturer: z.string().trim().max(200).nullish(),
  packSize: z.string().trim().max(120).nullish(),
  mrp: z.coerce.number().nonnegative().nullish(),
  quantity: z.coerce.number().int().positive(),
  unitPrice: z.coerce.number().nonnegative(),
  lineTotal: z.coerce.number().nonnegative(),
  isPriceOverridden: z.coerce.boolean().optional(),
  source: z.enum(['local', 'remote', 'manual']).nullish(),
});

const createInvoiceSchema = z.object({
  organizationId: z.string().uuid(),
  storeId: z.string().uuid(),
  customerName: z.string().trim().min(1).max(120),
  customerMobile: z.string().regex(/^\d{10}$/, 'customerMobile must be a 10-digit number'),
  grossAmount: z.coerce.number().nonnegative(),
  discountAmount: z.coerce.number().nonnegative().default(0),
  pointsEarned: z.coerce.number().int().nonnegative().default(0),
  pointsRedeemed: z.coerce.number().int().nonnegative().default(0),
  redemptionValue: z.coerce.number().nonnegative().default(0),
  clientTransactionId: z.string().trim().min(8).max(120),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'businessDate must be YYYY-MM-DD').optional(),
  medicines: z.array(medicineLineSchema).max(500).default([]),
});

const listInvoicesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(2000).default(500),
});

// ---- Root ----
app.get('/api/v1', (c) => c.json({ service: 'healthpoints-backend', version: '0.1.0' }));

// ---- Health ----
app.get('/api/v1/health', async (c) => {
  const pool = createPool(c.env.DATABASE_URL);
  try {
    await pool.query('select 1');
    return c.json({ ok: true, service: 'healthpoints-backend', db: 'up' });
  } catch {
    return c.json({ ok: false, service: 'healthpoints-backend', db: 'down' }, 503);
  } finally {
    await pool.end();
  }
});

// ---- Context (seed demo org + store) ----
app.get('/api/v1/context/default', async (c) => {
  const pool = createPool(c.env.DATABASE_URL);
  const client = await pool.connect();
  try {
    await client.query('begin');

    const orgResult = await client.query<{ id: string; code: string }>(
      `
      insert into organizations (name, code)
      values ('HealthPoints Demo Org', 'HPORG')
      on conflict (code)
      do update set name = excluded.name
      returning id, code
      `
    );
    const orgId = orgResult.rows[0].id;

    const storeResult = await client.query<{ id: string; code: string }>(
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

    return c.json({
      organizationId: orgId,
      organizationCode: orgResult.rows[0].code,
      storeId: storeResult.rows[0].id,
      storeCode: storeResult.rows[0].code,
    });
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
});

// ---- Customers ----
app.get('/api/v1/customers/all', async (c) => {
  const parsed = listCustomersQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    return c.json({ message: 'Invalid query params', issues: parsed.error.issues }, 400);
  }

  const pool = createPool(c.env.DATABASE_URL);
  try {
    const rows = await listCustomers(pool, parsed.data.limit);
    return c.json({
      customers: rows.map((row) => ({
        id: row.id,
        name: row.name,
        mobile: row.mobile,
        pointsBalance: Number(row.points_balance),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    });
  } finally {
    await pool.end();
  }
});

app.get('/api/v1/customers', async (c) => {
  const parsed = lookupQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    return c.json({ message: 'Invalid query params', issues: parsed.error.issues }, 400);
  }

  const pool = createPool(c.env.DATABASE_URL);
  try {
    const customer = await findCustomerByMobile(pool, parsed.data.mobile);
    if (!customer) {
      return c.json({ found: false });
    }

    const lastInvoice = await findLatestInvoiceByCustomer(pool, customer.id);
    return c.json({
      found: true,
      customer: {
        id: customer.id,
        name: customer.name,
        mobile: customer.mobile,
        pointsBalance: Number(customer.points_balance),
      },
      lastInvoice: lastInvoice
        ? {
            id: lastInvoice.id,
            billNumber: lastInvoice.bill_number,
            netAmount: Number(lastInvoice.net_amount),
            date: lastInvoice.created_at,
          }
        : null,
    });
  } finally {
    await pool.end();
  }
});

app.post('/api/v1/customers', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = upsertCustomerSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ message: 'Invalid request payload', issues: parsed.error.issues }, 400);
  }

  const pool = createPool(c.env.DATABASE_URL);
  try {
    const customer = await upsertCustomerByMobile(pool, parsed.data);
    return c.json(
      {
        customer: {
          id: customer.id,
          name: customer.name,
          mobile: customer.mobile,
          pointsBalance: Number(customer.points_balance),
        },
      },
      201
    );
  } finally {
    await pool.end();
  }
});

// ---- Invoices ----
app.get('/api/v1/invoices', async (c) => {
  const parsed = listInvoicesQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    return c.json({ message: 'Invalid query params', issues: parsed.error.issues }, 400);
  }

  const pool = createPool(c.env.DATABASE_URL);
  try {
    const rows = await listInvoices(pool, parsed.data.limit);
    return c.json({
      invoices: rows.map((row) => ({
        id: row.id,
        transactionId: row.client_transaction_id ?? row.id,
        billNumber: row.bill_number,
        customerId: row.customer_id,
        customerName: row.customer_name,
        customerMobile: row.customer_mobile,
        billAmount: Number(row.gross_amount),
        netAmount: Number(row.net_amount),
        pointsEarned: Number(row.points_earned),
        pointsRedeemed: Number(row.points_redeemed),
        redeemedValue: Number(row.redemption_value),
        medicines: Array.isArray(row.medicines) ? row.medicines : [],
        date: row.created_at,
        syncStatus: 'synced',
      })),
    });
  } finally {
    await pool.end();
  }
});

app.post('/api/v1/invoices', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = createInvoiceSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ message: 'Invalid request payload', issues: parsed.error.issues }, 400);
  }

  const pool = createPool(c.env.DATABASE_URL);
  try {
    const result = await createInvoice(pool, parsed.data);
    return c.json({ message: 'Invoice created successfully', ...result }, 201);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Insufficient points balance') {
        return c.json({ message: error.message }, 409);
      }
      if (error.message === 'Store not found or inactive') {
        return c.json({ message: error.message }, 404);
      }
    }
    if (hasPgCode(error, '23505')) {
      return c.json({ message: 'Duplicate invoice submission detected' }, 409);
    }
    throw error;
  } finally {
    await pool.end();
  }
});

export default app;
