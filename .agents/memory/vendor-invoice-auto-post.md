---
name: Vendor Invoice Auto-posting
description: Accrual-basis journal entry automation for the AP (vendor invoice) module — when to post, what accounts, and how reversal works.
---

## Rule

Every vendor invoice with an `expenseAccountId` set triggers automatic journal entries. Invoices without one are recorded as ledger-only (no GL posting).

## Accounting Flow

| Event | DR | CR |
|---|---|---|
| Vendor invoice created | `expenseAccountId` (user-selected) | 2000 Accounts Payable |
| Payment recorded | 2000 Accounts Payable | 1010 Cash at Bank - SGD |
| Vendor invoice deleted | Reversal of create JE (swapped DR/CR) | — |
| Payment deleted | Reversal of payment JE | — |

**Why:** Proper accrual basis — expense recognised when invoice received, AP settled when cash leaves.

## DB Column

`vendor_invoices.expense_account_id INTEGER` (nullable — null means skip GL posting). Added June 2026.

## Implementation

- Auto-post lib: `artifacts/api-server/src/lib/vendor-invoice-auto-post.ts`
- Four exported functions: `postVendorInvoiceJE`, `reverseVendorInvoiceJE`, `postPaymentJE`, `reversePaymentJE`
- All functions are idempotent (check for existing JE before inserting)
- Reversal sets original JE status to `"reversed"` and creates a new `"posted"` entry with `reversalOfId` pointing to the original
- All errors are non-fatal (logged but don't break the API response)

## How to Apply

- When adding new vendor invoice events (e.g. bulk payments), call the matching auto-post function after the DB write
- The `ensureAccountsSeeded(companyId)` call at the top of each function handles companies that don't have accounts yet
- `refType="vendor_invoice"` / `refType="vendor_payment"` is used for idempotency checks — don't reuse these refTypes for other purposes

## api-zod pre-existing issue

`lib/api-zod/src/index.ts` exports both `./generated/api` and `./generated/types` which have duplicate named exports → `typecheck:libs` fails. This is pre-existing from codegen output; api-server and po-app typecheck separately and are unaffected.
