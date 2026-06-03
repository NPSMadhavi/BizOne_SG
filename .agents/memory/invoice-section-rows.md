---
name: Invoice section rows and poRefNo
description: How section header rows and PO Reference No. are implemented across DB, API, PDF, view, and forms for invoices
---

## Section Items

Section items are stored in the `items` JSONB column of `invoices` as `{ type: "section", sectionLabel: "..." }`.

**Why:** They are purely visual grouping rows — no qty, price, or amount. They are filtered out of:
- Subtotal calculation (both forms)
- `doSubmit` validation (real item count check excludes sections)
- Auto-append logic (the last-row watch skips section rows)
- API route subtotal calc (section items have no amount)

**How to apply:** Any new form or PDF that reads invoice items must guard on `item.type === "section"` before accessing numeric fields.

## PO Reference No.

Stored in `invoices.po_ref_no` (TEXT, nullable). Added via `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS po_ref_no text`.

Exposed as `poRefNo` in OpenAPI spec. Shown in:
- Invoice form Invoice Details card (below Payment Terms)
- Invoice view page Invoice Details card
- Invoice PDF right column at y=83 (below Payment Terms at y=75)

## PDF column logic

`hasInvPartNo` checks if any non-section item has a non-empty `partNumber`. If false, the Part No. column is dropped entirely.
