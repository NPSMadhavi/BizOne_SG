---
name: Pre-existing TypeScript errors in po-app and api-server
description: Known pre-existing TS errors that are not caused by current work and can be ignored
---

## po-app pre-existing errors

- `deliveryAddress` form.setValue call in Customer picker on all forms — field not in schema, TS2345, pre-existing
- `form.handleSubmit(onSubmit)` where onSubmit has `(values, openPreview?)` signature — BaseSyntheticEvent vs boolean, TS2345, pre-existing
- `quotations/new.tsx` and `edit.tsx` same handleSubmit + deliveryAddress issues
- `stock/list.tsx` missing queryKey on useQuery options
- `vendor-invoices/new-dialog.tsx` currency property on UserCompany

## api-server pre-existing errors

- `lib/api-zod` duplicate export errors (TS2308) — orval codegen ambiguity, pre-existing
- `routes/auth.ts`, `users.ts` LoginBody/SelectCompanyBody/CreateUserBody etc missing from api-zod — cascades from above
- `routes/customers.ts`, `vendors.ts`, `settings.ts` — not all code paths return value (TS7030)
- `lib/integrations-openai-ai-server` errors — unrelated to core ERP

**Why:** These were present before the invoice improvements session and do not affect runtime.
