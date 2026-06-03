# HealthPoints Backend

HealthPoints API — **Hono on Cloudflare Workers**, **Neon** Postgres (serverless driver), Zod validation.

## Tech
- Hono (runs on Cloudflare Workers)
- Neon serverless Postgres driver (`@neondatabase/serverless`)
- Zod for request validation
- Migrations run in Node via `pg` (`src/db/migrate.ts`)

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars     # set DATABASE_URL to your Neon DEV branch URL
npm run dev                        # wrangler dev → http://localhost:8787
```

`wrangler dev` reads `.dev.vars` (gitignored) for `DATABASE_URL` and `CORS_ORIGIN`.

## Migrations

```bash
# DATABASE_URL comes from backend/.env (gitignored)
npm run migrate                    # applies all pending migrations idempotently
```

## Deploy (Cloudflare)

```bash
npx wrangler login                 # once

# secrets (per environment)
npx wrangler secret put DATABASE_URL --env dev          # Neon DEV pooled URL
npx wrangler secret put DATABASE_URL --env production    # Neon PROD pooled URL

npm run deploy:dev                 # → healthpoints-api-dev.workers.dev
npm run deploy:prod                # → healthpoints-api.workers.dev
```

Environment config (Worker names, `CORS_ORIGIN`) lives in `wrangler.toml`.

## Endpoints (base `…/api/v1`)
- `GET  /` — service info
- `GET  /health` — DB connectivity check
- `GET  /context/default` — seed/return demo org + store ids
- `GET  /customers?mobile=9663192245` — lookup by mobile
- `GET  /customers/all?limit=500` — list customers
- `POST /customers` — upsert customer
- `GET  /invoices?limit=500` — list invoices
- `POST /invoices` — create invoice (transactional, idempotent on `clientTransactionId` → 409 on duplicate)

### Create invoice payload

```json
{
  "organizationId": "3d2f8d4f-c433-4f4c-bbc8-e6958ad88f8f",
  "storeId": "0d8475af-5978-4f5e-97b9-47589e36d6c9",
  "customerName": "Asha",
  "customerMobile": "9663192245",
  "grossAmount": 1200,
  "discountAmount": 100,
  "pointsEarned": 11,
  "pointsRedeemed": 5,
  "redemptionValue": 5,
  "clientTransactionId": "txn-20260602-101010",
  "businessDate": "2026-06-02"
}
```
