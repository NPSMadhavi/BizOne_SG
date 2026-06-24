---
name: AR payment tracking
description: AR (customer invoice) partial payment system — table, JE helpers, status flow, view page
---

## Table
`invoice_payments` — mirrors `vendor_payments` exactly. Columns: id, companyId, invoiceId, paymentDate, amount, reference, paymentMethod, notes, createdBy, createdAt. Created with direct SQL (drizzle push gets stuck on interactive prompt for existing data).

## Status flow
confirmed → partial (paidAmount > 0) → paid (paidAmount >= totalAmount - 0.005). Draft and void statuses are never overridden by recomputeInvoiceStatus().

## JE helper
`artifacts/api-server/src/lib/invoice-payment-je.ts`
- postARPaymentJE: DR 1010 Bank / CR 1100 AR (Singapore companies only — same rule as invoice-auto-post)
- reverseARPaymentJE: flips debit/credit of original lines

## Knock-off behaviour
`POST /invoices/:id/knock-off` now also creates an invoice_payments record for the remaining balance (paymentMethod = "knock_off") and posts the JE. This means all knock-offs going forward have a proper payment trail.

## GET /invoices/:id response
Returns `payments[]`, `paidAmount`, `balance` appended to the standard invoice object. Frontend accesses these as `(doc as any).paidAmount` etc. since the OpenAPI-generated InvoiceStatus type doesn't include "partial" — cast through `(doc as any).status as string` for status comparisons.

## Why
AP (vendor invoices) already had partial payment tracking; AR had only a binary knock-off. This brings AR to parity with AP.
