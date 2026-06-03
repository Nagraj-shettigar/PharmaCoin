import { pool } from '../../db/pool';

export interface InvoiceMedicineLine {
  medicineId?: string | null;
  name: string;
  manufacturer?: string | null;
  packSize?: string | null;
  mrp?: number | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  isPriceOverridden?: boolean;
  source?: 'local' | 'remote' | 'manual' | null;
}

export interface InvoiceListRow {
  id: string;
  client_transaction_id: string | null;
  bill_number: string;
  customer_id: string;
  customer_name: string;
  customer_mobile: string;
  gross_amount: string;
  net_amount: string;
  points_earned: number;
  points_redeemed: number;
  redemption_value: string;
  medicines: InvoiceMedicineLine[];
  created_at: string;
}

export async function listInvoices(limit: number): Promise<InvoiceListRow[]> {
  const result = await pool.query<InvoiceListRow>(
    `
    select
      id,
      client_transaction_id,
      bill_number,
      customer_id,
      customer_name,
      customer_mobile,
      gross_amount,
      net_amount,
      points_earned,
      points_redeemed,
      redemption_value,
      medicines,
      created_at
    from invoices
    order by created_at desc
    limit $1
    `,
    [limit]
  );

  return result.rows;
}