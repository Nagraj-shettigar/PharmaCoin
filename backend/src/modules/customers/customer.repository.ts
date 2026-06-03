import { pool } from '../../db/pool';

export interface CustomerLookupRow {
  id: string;
  name: string;
  mobile: string;
  points_balance: number;
}

export interface LatestInvoiceRow {
  id: string;
  bill_number: string;
  net_amount: string;
  created_at: string;
}

export interface CustomerListRow {
  id: string;
  name: string;
  mobile: string;
  points_balance: number;
  created_at: string;
  updated_at: string;
}

export interface UpsertCustomerInput {
  organizationId: string;
  storeId: string;
  mobile: string;
  name: string;
}

export async function findCustomerByMobile(mobile: string): Promise<CustomerLookupRow | null> {
  const result = await pool.query<CustomerLookupRow>(
    `
    select c.id, c.name, c.mobile, coalesce(la.current_balance, 0) as points_balance
    from customers c
    left join loyalty_accounts la on la.customer_id = c.id
    where c.mobile = $1
    limit 1
    `,
    [mobile]
  );

  return result.rows[0] ?? null;
}

export async function findLatestInvoiceByCustomer(customerId: string): Promise<LatestInvoiceRow | null> {
  const result = await pool.query<LatestInvoiceRow>(
    `
    select id, bill_number, net_amount, created_at
    from invoices
    where customer_id = $1
    order by created_at desc
    limit 1
    `,
    [customerId]
  );

  return result.rows[0] ?? null;
}

export async function upsertCustomerByMobile(input: UpsertCustomerInput): Promise<CustomerLookupRow> {
  const result = await pool.query<CustomerLookupRow>(
    `
    with upserted as (
      insert into customers (organization_id, store_id, mobile, name)
      values ($1, $2, $3, $4)
      on conflict (organization_id, mobile)
      do update set
        name = excluded.name,
        store_id = excluded.store_id,
        updated_at = now()
      returning id, name, mobile
    )
    select u.id, u.name, u.mobile, coalesce(la.current_balance, 0) as points_balance
    from upserted u
    left join loyalty_accounts la on la.customer_id = u.id
    limit 1
    `,
    [input.organizationId, input.storeId, input.mobile, input.name]
  );

  return result.rows[0];
}

export async function listCustomers(limit: number): Promise<CustomerListRow[]> {
  const result = await pool.query<CustomerListRow>(
    `
    select
      c.id,
      c.name,
      c.mobile,
      coalesce(la.current_balance, 0) as points_balance,
      c.created_at,
      c.updated_at
    from customers c
    left join loyalty_accounts la on la.customer_id = c.id
    order by c.updated_at desc
    limit $1
    `,
    [limit]
  );

  return result.rows;
}
