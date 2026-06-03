import { Router } from 'express';
import { z } from 'zod';
import { createInvoice } from '../modules/invoices/invoice.service';
import { listInvoices } from '../modules/invoices/invoice.repository';

export const invoicesRouter = Router();

function hasPgCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === code;
}

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

invoicesRouter.get('/', async (req, res, next) => {
  const parsed = listInvoicesQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      message: 'Invalid query params',
      issues: parsed.error.issues,
    });
  }

  try {
    const rows = await listInvoices(parsed.data.limit);
    return res.json({
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
  } catch (error) {
    return next(error);
  }
});

invoicesRouter.post('/', async (req, res, next) => {
  const parsed = createInvoiceSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: 'Invalid request payload',
      issues: parsed.error.issues,
    });
  }

  try {
    const result = await createInvoice(parsed.data);
    return res.status(201).json({
      message: 'Invoice created successfully',
      ...result,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Insufficient points balance') {
        return res.status(409).json({ message: error.message });
      }

      if (error.message === 'Store not found or inactive') {
        return res.status(404).json({ message: error.message });
      }
    }

    if (hasPgCode(error, '23505')) {
      return res.status(409).json({ message: 'Duplicate invoice submission detected' });
    }

    return next(error);
  }
});
