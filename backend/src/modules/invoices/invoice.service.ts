import { PoolClient } from 'pg';
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

export interface CreateInvoiceInput {
  organizationId: string;
  storeId: string;
  customerName: string;
  customerMobile: string;
  grossAmount: number;
  discountAmount: number;
  pointsEarned: number;
  pointsRedeemed: number;
  redemptionValue: number;
  clientTransactionId: string;
  businessDate?: string;
  medicines?: InvoiceMedicineLine[];
}

export interface CreateInvoiceResult {
  invoiceId: string;
  billNumber: string;
  customerId: string;
  pointsBalance: number;
}

interface StoreRow {
  code: string;
}

interface CustomerRow {
  id: string;
}

interface SequenceRow {
  last_value: number;
}

interface InvoiceRow {
  id: string;
  bill_number: string;
}

interface LoyaltyBalanceRow {
  current_balance: number;
}

function toBusinessDate(inputDate?: string): string {
  if (!inputDate) {
    return new Date().toISOString().slice(0, 10);
  }

  return inputDate;
}

function formatDateStamp(date: string): string {
  return date.replace(/-/g, '');
}

function padSequence(value: number): string {
  return String(value).padStart(4, '0');
}

async function getStoreCode(client: PoolClient, organizationId: string, storeId: string): Promise<string> {
  const result = await client.query<StoreRow>(
    `
    select code
    from stores
    where id = $1 and organization_id = $2 and is_active = true
    limit 1
    `,
    [storeId, organizationId]
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error('Store not found or inactive');
  }

  return row.code.toUpperCase();
}

async function upsertCustomer(
  client: PoolClient,
  organizationId: string,
  storeId: string,
  customerName: string,
  customerMobile: string
): Promise<string> {
  const result = await client.query<CustomerRow>(
    `
    insert into customers (organization_id, store_id, mobile, name)
    values ($1, $2, $3, $4)
    on conflict (organization_id, mobile)
    do update set
      name = excluded.name,
      store_id = excluded.store_id,
      updated_at = now()
    returning id
    `,
    [organizationId, storeId, customerMobile, customerName]
  );

  return result.rows[0].id;
}

async function nextSequence(client: PoolClient, storeId: string, businessDate: string): Promise<number> {
  const result = await client.query<SequenceRow>(
    `
    insert into invoice_sequences (store_id, business_date, last_value)
    values ($1, $2, 1)
    on conflict (store_id, business_date)
    do update set last_value = invoice_sequences.last_value + 1
    returning last_value
    `,
    [storeId, businessDate]
  );

  return Number(result.rows[0].last_value);
}

async function upsertLoyaltyAccount(client: PoolClient, customerId: string, deltaPoints: number): Promise<number> {
  const result = await client.query<LoyaltyBalanceRow>(
    `
    insert into loyalty_accounts (customer_id, current_balance)
    values ($1, $2)
    on conflict (customer_id)
    do update set
      current_balance = loyalty_accounts.current_balance + $2,
      updated_at = now()
    returning current_balance
    `,
    [customerId, deltaPoints]
  );

  return Number(result.rows[0].current_balance);
}

function ensureNonNegativeBalance(balance: number): void {
  if (balance < 0) {
    throw new Error('Insufficient points balance');
  }
}

async function insertInvoice(
  client: PoolClient,
  input: CreateInvoiceInput,
  customerId: string,
  businessDate: string,
  billNumber: string,
  netAmount: number
): Promise<InvoiceRow> {
  const result = await client.query<InvoiceRow>(
    `
    insert into invoices (
      organization_id,
      store_id,
      bill_number,
      business_date,
      customer_id,
      customer_name,
      customer_mobile,
      gross_amount,
      discount_amount,
      net_amount,
      points_earned,
      points_redeemed,
      redemption_value,
      client_transaction_id,
      medicines
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb)
    returning id, bill_number
    `,
    [
      input.organizationId,
      input.storeId,
      billNumber,
      businessDate,
      customerId,
      input.customerName,
      input.customerMobile,
      input.grossAmount,
      input.discountAmount,
      netAmount,
      input.pointsEarned,
      input.pointsRedeemed,
      input.redemptionValue,
      input.clientTransactionId,
      JSON.stringify(input.medicines ?? []),
    ]
  );

  return result.rows[0];
}

async function insertLoyaltyLedger(
  client: PoolClient,
  organizationId: string,
  storeId: string,
  customerId: string,
  invoiceId: string,
  pointsEarned: number,
  pointsRedeemed: number
): Promise<void> {
  if (pointsEarned > 0) {
    await client.query(
      `
      insert into loyalty_ledger (
        organization_id,
        store_id,
        customer_id,
        invoice_id,
        entry_type,
        points_delta,
        note
      )
      values ($1, $2, $3, $4, 'EARN', $5, $6)
      `,
      [organizationId, storeId, customerId, invoiceId, pointsEarned, 'Points earned from billing']
    );
  }

  if (pointsRedeemed > 0) {
    await client.query(
      `
      insert into loyalty_ledger (
        organization_id,
        store_id,
        customer_id,
        invoice_id,
        entry_type,
        points_delta,
        note
      )
      values ($1, $2, $3, $4, 'REDEEM', $5, $6)
      `,
      [organizationId, storeId, customerId, invoiceId, -pointsRedeemed, 'Points redeemed at billing']
    );
  }
}

export async function createInvoice(input: CreateInvoiceInput): Promise<CreateInvoiceResult> {
  const businessDate = toBusinessDate(input.businessDate);
  const netAmount = input.grossAmount - input.discountAmount - input.redemptionValue;

  if (netAmount < 0) {
    throw new Error('Net amount cannot be negative');
  }

  const client = await pool.connect();

  try {
    await client.query('begin');

    const storeCode = await getStoreCode(client, input.organizationId, input.storeId);
    const customerId = await upsertCustomer(
      client,
      input.organizationId,
      input.storeId,
      input.customerName,
      input.customerMobile
    );

    const sequence = await nextSequence(client, input.storeId, businessDate);
    const billNumber = `${storeCode}-${formatDateStamp(businessDate)}-${padSequence(sequence)}`;

    const invoice = await insertInvoice(client, input, customerId, businessDate, billNumber, netAmount);

    const pointsDelta = input.pointsEarned - input.pointsRedeemed;
    const pointsBalance = await upsertLoyaltyAccount(client, customerId, pointsDelta);
    ensureNonNegativeBalance(pointsBalance);

    await insertLoyaltyLedger(
      client,
      input.organizationId,
      input.storeId,
      customerId,
      invoice.id,
      input.pointsEarned,
      input.pointsRedeemed
    );

    await client.query('commit');

    return {
      invoiceId: invoice.id,
      billNumber: invoice.bill_number,
      customerId,
      pointsBalance,
    };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
