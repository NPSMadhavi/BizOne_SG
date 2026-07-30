---
name: Exchange rate feature
description: SGD exchange rate for IRAS GST F5 compliance — implementation notes and gotchas
---

## What was built
- `exchange_rate numeric(10,6) DEFAULT 1.000000` on `vendor_invoices`, `invoices`, `income_records`
- `artifacts/api-server/src/lib/exchange-rate.ts` — `getExchangeRateToSGD(currency, date?)` via jsDelivr CDN; 10-min in-memory cache
- `GET /accounting/exchange-rate?currency=X&date=Y` — returns `{ rateSGD }` for the frontend
- `POST /accounting/exchange-rate/backfill` — auto-fills rates for all non-SGD records still at 1.0 in the current company
- GST F5 vendor-invoices table shows FX Rate / Net SGD / GST SGD columns when any row has a non-SGD currency
- Vendor invoice new-dialog: exchange rate field (amber callout) auto-fetches on currency/date change
- Income new + edit forms: same exchange rate callout pattern
- Boxes 1/4/6/7 in F5 use `amount × exchangeRate` for SGD-equivalent totals

## Critical gotcha — lib/db dist rebuild
The `api-server` uses TypeScript project references. It reads compiled `.d.ts` from `lib/db/dist/`, NOT the source files.
Whenever a new column is added to `lib/db/src/schema/*.ts`, **must** run:
```
cd lib/db && npx tsc -p tsconfig.json
```
Otherwise insert/update calls will get `TS2769: property does not exist in type` even though the source schema is correct.

**Why:** `lib/db/package.json` has no `build` script and exports point to `src/`, but `tsconfig.json` at the monorepo root uses project references, so `api-server/tsconfig.json` references `lib/db` and resolves types from `dist/`.

## Production DB
ALTER TABLE for `exchange_rate` has only been run on the dev DB. Must run on production:
```sql
ALTER TABLE vendor_invoices ADD COLUMN IF NOT EXISTS exchange_rate numeric(10,6) NOT NULL DEFAULT 1.000000;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS exchange_rate numeric(10,6) NOT NULL DEFAULT 1.000000;
ALTER TABLE income_records ADD COLUMN IF NOT EXISTS exchange_rate numeric(10,6) NOT NULL DEFAULT 1.000000;
```
