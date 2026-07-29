---
name: Vendor Invoice GST fields
description: IRAS-compliant GST columns on vendor_invoices, F5 Box 4/5/7 logic, JE split, accountant role
---

## GST Columns (already migrated in DB)
Four columns added via ALTER TABLE (migration already ran):
- `gst_treatment TEXT DEFAULT 'standard_rated'` — SR | ZR | exempt | out_of_scope
- `gst_rate NUMERIC(5,2) DEFAULT 9`
- `gst_amount NUMERIC(15,2) DEFAULT 0`
- `gst_inclusive BOOLEAN DEFAULT FALSE`

Also added to Drizzle schema in `lib/db/src/schema/vendor-invoices.ts`.

## GST F5 Box Logic (accounting.ts)
- **Box 4** = net SR vendor invoices (totalAmount − gstAmount) + confirmed claimable expense amounts
- **Box 5** = totalAmount of ZR + exempt vendor invoices
- **Box 7** = SR vendor invoice gstAmount + confirmed claimable expense gstAmount
- GL account 1110 lookup was removed (it was always returning 0 and would double-count with direct approach)

**Why:** Old code used GL-1110 JE debit sum for Box 7, but auto-JE never posted to 1110, so Box 7 was always 0. Direct sum from invoice.gstAmount is IRAS-correct and avoids double-counting if JE split is later used.

## Auto-JE Split (vendor-invoice-auto-post.ts)
When SR and gstAmount > 0 and expenseAccountId set:
- DR Expense account (netAmount = total − gst)
- DR Input Tax 1110 (gstAmount)
- CR AP 2000 (totalAmount)
When not SR, or gstAmount = 0: simple 2-line JE (DR Expense / CR AP) as before.

## UI Behaviour
- `new-dialog.tsx` + `view.tsx` (edit dialog): GST Treatment dropdown + GST Inclusive toggle + live breakdown panel
- Amount field label changes based on gstInclusive toggle
- `totalAmount` stored = full amount (net + gst); net is back-calculated on display

## Accountant Role
- Added `"accountant"` to UserRole enums in all generated type files (api-client-react, api-zod src + dist)
- `isAccountant = user?.role === "accountant"` in auth-context.tsx
- `hasModuleAccess` returns true for accountant (same as admin, except Settings page gated by isAdmin separately in shell)
- Backend expenses.ts + income.ts: delete and edit-confirmed gates extended to `userRole === 'accountant'`
- Frontend expenses.tsx + income.tsx: delete button visible for `isAdmin || isAccountant`
