import { Router } from 'express';
import { z } from 'zod';
import { findCustomerByMobile, findLatestInvoiceByCustomer, listCustomers, upsertCustomerByMobile } from '../modules/customers/customer.repository';

export const customersRouter = Router();

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

customersRouter.get('/all', async (req, res, next) => {
  const parsed = listCustomersQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      message: 'Invalid query params',
      issues: parsed.error.issues,
    });
  }

  try {
    const rows = await listCustomers(parsed.data.limit);
    return res.json({
      customers: rows.map((row) => ({
        id: row.id,
        name: row.name,
        mobile: row.mobile,
        pointsBalance: Number(row.points_balance),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    });
  } catch (error) {
    return next(error);
  }
});

customersRouter.get('/', async (req, res) => {
  const parsed = lookupQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      message: 'Invalid query params',
      issues: parsed.error.issues,
    });
  }

  const { mobile } = parsed.data;
  const customer = await findCustomerByMobile(mobile);

  if (!customer) {
    return res.json({ found: false });
  }

  const lastInvoice = await findLatestInvoiceByCustomer(customer.id);

  return res.json({
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
});

customersRouter.post('/', async (req, res, next) => {
  const parsed = upsertCustomerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      message: 'Invalid request payload',
      issues: parsed.error.issues,
    });
  }

  try {
    const customer = await upsertCustomerByMobile(parsed.data);
    return res.status(201).json({
      customer: {
        id: customer.id,
        name: customer.name,
        mobile: customer.mobile,
        pointsBalance: Number(customer.points_balance),
      },
    });
  } catch (error) {
    return next(error);
  }
});
