# HealthPoints Backend

Initial implementation scaffold for the HealthPoints API.

## Tech
- Node.js + TypeScript
- Express
- PostgreSQL (`pg`)
- Zod for request validation

## Quick Start

1. Copy env file:

```bash
cp .env.example .env
```

2. Install dependencies:

```bash
npm install
```

3. Create database and run migration:

```bash
psql "$DATABASE_URL" -f migrations/001_init.sql
```

4. Start dev server:

```bash
npm run dev
```

Server runs at `http://localhost:4000` by default.

## Initial endpoints
- `GET /api/v1`
- `GET /api/v1/health`
- `GET /api/v1/customers?mobile=9663192245`
- `POST /api/v1/invoices`

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

## Next implementation targets
- Auth + JWT
- Invoice create transaction
- Bill number sequence generation
- Loyalty ledger and balance updates
- Offline sync batch endpoint
