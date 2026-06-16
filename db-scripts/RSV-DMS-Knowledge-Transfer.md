# RSV Infotech Document Management System — Knowledge Transfer Kit

> **Audience:** Developers inheriting or extending this project.  
> **Date:** June 2026  
> **Default admin:** username `admin` / password `admin123`

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Repository Structure](#2-repository-structure)
3. [Tech Stack](#3-tech-stack)
4. [Environment & Local Setup](#4-environment--local-setup)
5. [Architecture Diagram](#5-architecture-diagram)
6. [Authentication & Session System](#6-authentication--session-system)
7. [Multi-Company & Module Access Control](#7-multi-company--module-access-control)
8. [Document Number (Running Number) System](#8-document-number-running-number-system)
9. [Module: Purchase Orders (PO)](#9-module-purchase-orders-po)
10. [Module: Quotations (QT)](#10-module-quotations-qt)
11. [Module: Invoices (INV)](#11-module-invoices-inv)
12. [Module: Delivery Orders (DO)](#12-module-delivery-orders-do)
13. [Module: Goods Received Notes (GRN)](#13-module-goods-received-notes-grn)
14. [Module: Stock / Inventory](#14-module-stock--inventory)
15. [Module: Vendor Invoices (AP)](#15-module-vendor-invoices-ap)
16. [Module: Vendors & Customers Directories](#16-module-vendors--customers-directories)
17. [Module: Settings](#17-module-settings)
18. [Module: Email Sending](#18-module-email-sending)
19. [Module: Admin Panel](#19-module-admin-panel)
20. [Module: Audit Logs](#20-module-audit-logs)
21. [PDF Generation](#21-pdf-generation)
22. [Frontend Architecture](#22-frontend-architecture)
23. [API Reference](#23-api-reference)
24. [Database Schema Reference](#24-database-schema-reference)
25. [Line Item (JSONB) Structure](#25-line-item-jsonb-structure)
26. [Cross-Cutting Concerns & Patterns](#26-cross-cutting-concerns--patterns)
27. [How to Add a New Module](#27-how-to-add-a-new-module)
28. [Common Pitfalls & Gotchas](#28-common-pitfalls--gotchas)

---

## 1. Project Overview

This is a **multi-company document management ERP** built for three companies:

| # | Company | Country |
|---|---------|---------|
| 1 | RSV Infotech Pte Ltd | Singapore (SG) |
| 2 | Netopsys Pte Ltd | Singapore (SG) |
| 3 | Netopsys AI Pvt Ltd | India (IN) |

**Core documents managed:**
- Purchase Orders (PO) — sent to vendors
- Quotations (QT) — sent to customers
- Invoices (INV / Tax Invoice) — sent to customers
- Delivery Orders (DO) — accompanies shipments
- Goods Received Notes (GRN) — records incoming goods
- Vendor Invoices (AP/PI) — vendor proforma invoices with payment tracking

**Key capabilities:** PDF generation, email with PDF attachment, multi-currency, GST/tax management, per-company settings, role-based access, private documents, audit trail, stock/inventory integration.

---

## 2. Repository Structure

```
workspace/
├── artifacts/
│   ├── po-app/                 ← React + Vite frontend (served at path /)
│   └── api-server/             ← Express 5 API server (served at path /api)
├── lib/
│   ├── db/                     ← Drizzle ORM schema + DB client
│   ├── api-spec/               ← OpenAPI 3.0 specification (source of truth for contracts)
│   ├── api-client-react/       ← Generated React Query hooks (from OpenAPI)
│   └── api-zod/                ← Generated Zod validation schemas (from OpenAPI)
├── scripts/                    ← Utility scripts
├── db-scripts/                 ← SQL schema scripts (PostgreSQL + MySQL)
├── pnpm-workspace.yaml         ← Package catalog + workspace config
└── package.json                ← Root: typecheck + build tasks
```

### Key directories inside `artifacts/api-server/src/`

```
src/
├── app.ts              ← Express app setup (CORS, sessions, middleware)
├── index.ts            ← Entry point: starts server, runs seed
├── seed.ts             ← One-time DB seed (admin user + 3 companies + settings)
├── routes/
│   ├── index.ts        ← Mounts all routers under /api
│   ├── auth.ts         ← Login / logout / me / select-company
│   ├── users.ts        ← Admin: CRUD users + company assignments
│   ├── companies.ts    ← Company info
│   ├── purchase-orders.ts
│   ├── quotations.ts
│   ├── invoices.ts
│   ├── delivery-orders.ts
│   ├── grn.ts
│   ├── stock-items.ts
│   ├── stock-serials.ts
│   ├── vendor-invoices.ts
│   ├── vendors.ts
│   ├── customers.ts
│   ├── settings.ts
│   ├── email.ts        ← SMTP email with PDF attachment
│   ├── email-contacts.ts
│   ├── audit-logs.ts
│   ├── maintenance.ts
│   ├── extract-po.ts   ← AI-powered PO extraction
│   └── agent.ts        ← AI assistant chat
└── lib/
    ├── running-numbers.ts  ← Atomic document numbering
    ├── audit.ts            ← Audit log helper
    └── logger.ts           ← Pino logger singleton
```

### Key directories inside `artifacts/po-app/src/`

```
src/
├── App.tsx                 ← Router + protected route wrapper
├── contexts/
│   └── auth-context.tsx    ← Global auth state, company selection, module access
├── pages/
│   ├── login.tsx
│   ├── select-company/
│   ├── dashboard.tsx
│   ├── purchase-orders/    ← list, new, edit, view
│   ├── quotations/         ← list, new, edit, view
│   ├── invoices/           ← list, new, edit, view
│   ├── delivery-orders/    ← list, new, edit, view
│   ├── grn/                ← list, view
│   ├── stock/              ← list
│   ├── vendor-invoices/    ← list, view, new-dialog
│   ├── vendors/
│   ├── customers/
│   ├── address-book/
│   ├── admin/              ← user management + audit log
│   └── settings/
├── components/
│   ├── pdf-preview-modal.tsx   ← Inline PDF viewer (all doc types)
│   ├── email-send-dialog.tsx   ← Multi-recipient email sender
│   ├── item-image-field.tsx    ← Per-line image upload/paste
│   ├── rich-text-editor.tsx    ← Bold/italic text editor
│   ├── directory-picker.tsx    ← Vendor/customer directory modal
│   ├── payment-terms-select.tsx
│   ├── delivery-date-field.tsx
│   └── issue-date-field.tsx
└── lib/
    ├── pdf.ts              ← All PDF generation (jsPDF + jspdf-autotable)
    └── utils.ts
```

---

## 3. Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Package manager | pnpm workspaces | 9.x |
| Language | TypeScript | 5.9 |
| Frontend framework | React + Vite | React 18, Vite 6 |
| UI library | shadcn/ui + Tailwind CSS | Tailwind 3 |
| Routing (frontend) | wouter | — |
| API client | TanStack React Query + Orval (codegen) | — |
| Form management | react-hook-form + Zod | — |
| Backend framework | Express | 5.x |
| ORM | Drizzle ORM | — |
| Database | PostgreSQL | 13+ |
| Session store | connect-pg-simple (sessions in PG) | — |
| Authentication | express-session + bcryptjs | — |
| PDF generation | jsPDF + jspdf-autotable | — |
| Email | nodemailer (SMTP) | — |
| Logging | Pino | — |
| Validation | Zod (zod/v4) + drizzle-zod | — |
| API contract | OpenAPI 3.0 (Orval codegen) | — |
| Node version | 24 | — |

---

## 4. Environment & Local Setup

### Required environment variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string, e.g. `postgres://user:pass@host:5432/dbname` |
| `SESSION_SECRET` | Secret for signing session cookies (store securely) |
| `PORT` | HTTP port for each service (set automatically by the workflow system) |

### Running the project locally (Replit)

The project runs via three **workflows** (long-running processes):

| Workflow | Command | Purpose |
|----------|---------|---------|
| `API Server` | `pnpm --filter @workspace/api-server run dev` | Starts Express API on assigned port |
| `po-app: web` | `pnpm --filter @workspace/po-app run dev` | Starts Vite dev server for React frontend |
| `Component Preview` | `pnpm --filter @workspace/mockup-sandbox run dev` | UI component mockup sandbox (dev only) |

### Database setup

On first API startup, `seed.ts` runs automatically and creates:
1. Admin user (`admin` / `admin123`)
2. Three companies (RSV Infotech SG, Netopsys SG, Netopsys AI IN)
3. Default settings rows for each company

To push Drizzle schema changes to the database:
```bash
pnpm --filter @workspace/db run push
```

To regenerate API hooks and Zod schemas from the OpenAPI spec:
```bash
pnpm --filter @workspace/api-spec run codegen
```

To typecheck everything:
```bash
pnpm run typecheck
```

---

## 5. Architecture Diagram

```
Browser (React SPA)
      │
      │  HTTPS (proxied by Replit gateway)
      ▼
 ┌─────────────────────────────────────┐
 │  Replit Reverse Proxy               │
 │  /         → po-app (Vite, React)   │
 │  /api       → api-server (Express)  │
 └─────────────────────────────────────┘
      │                   │
      ▼                   ▼
  React App          Express API
  (Vite SPA)          (REST JSON)
  - wouter routes      │
  - React Query        │  Drizzle ORM
  - shadcn/ui          ▼
  - jsPDF          PostgreSQL DB
                    - Documents (JSONB items)
                    - Users / Companies
                    - Settings
                    - Session store
```

**Request flow:**
1. User opens the app → React SPA loads
2. SPA calls `GET /api/auth/me` → checks session → if 401, redirect to `/login`
3. After login, if user has multiple companies → redirect to `/select-company`
4. All subsequent API calls include the session cookie (automatically) and use the `companyId` stored in the session
5. Each route handler calls `requireAuth()` and `requireCompany()` before touching the database

---

## 6. Authentication & Session System

### How login works

**File:** `artifacts/api-server/src/routes/auth.ts`

```
POST /api/auth/login
Body: { username, password }
```

1. Look up user by `username` in `users` table
2. Compare `password` with stored `password_hash` using `bcrypt.compare()`
3. On success, store in session: `userId`, `username`, `isAdmin`, `userRole`
4. If user has exactly **one** company → set `companyId` in session immediately
5. If user has **multiple** companies → `companyId` stays `undefined` → frontend redirects to `/select-company`
6. Return the user object (id, username, role, companies list, selectedCompanyId)

### Company selection

```
POST /api/auth/select-company
Body: { companyId }
```

Verifies the user has access to that `companyId` (via `user_companies` table), then sets `req.session.companyId`. All subsequent document queries are scoped to this company.

### Session storage

Sessions are persisted in a PostgreSQL `session` table (created automatically on startup by `connect-pg-simple`). Session lifetime is **7 days**. The `SESSION_SECRET` environment variable signs/encrypts the session cookie.

### Session data shape

```typescript
req.session = {
  userId: number,          // User's DB id
  username: string,        // For audit logs
  isAdmin: boolean,        // true if role === "admin"
  userRole: string,        // "admin" | "user" | "external"
  companyId: number,       // Currently selected company
}
```

### Route protection pattern

Each route file uses **local guard functions** (not global middleware):

```typescript
function requireAuth(req, res): boolean {
  if (!req.session.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return false;
  }
  return true;
}

function requireCompany(req, res): boolean {
  if (!req.session.companyId) {
    res.status(400).json({ error: "No company selected." });
    return false;
  }
  return true;
}
```

Pattern used at the top of every mutating route handler:
```typescript
router.post("/purchase-orders", async (req, res) => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  // ... safe to proceed
});
```

### Admin guard

```typescript
async function requireAdmin(req, res): Promise<boolean> {
  if (!req.session.userId) { res.status(401)...; return false; }
  const [user] = await db.select()...where(eq(usersTable.id, req.session.userId));
  if (!user || user.role !== "admin") { res.status(403)...; return false; }
  return true;
}
```

### Frontend auth state

**File:** `artifacts/po-app/src/contexts/auth-context.tsx`

Provides the `AuthContext` with:
- `user` — current user object (from `GET /api/auth/me`)
- `selectedCompany` — the active company object
- `hasModuleAccess(module)` — checks if current company grants access to a module key
- `logout()` — calls `POST /api/auth/logout`, clears state, redirects to `/login`

All pages are wrapped in a `ProtectedRoute` component that redirects unauthenticated users to `/login`.

---

## 7. Multi-Company & Module Access Control

### Data model

```
users  ──── user_companies ──── companies
                │
             modules (JSONB array)
             ["purchase_orders","quotations","invoices","delivery_orders"]
```

- A user can belong to **zero, one, or many** companies
- Each `user_companies` row has a `modules` array controlling which tabs appear in the sidebar
- **Admin users bypass all module checks** — they automatically have access to all companies and all modules

### Module keys

| Key | Sidebar Section |
|-----|----------------|
| `purchase_orders` | Purchase Orders |
| `quotations` | Quotations |
| `invoices` | Invoices |
| `delivery_orders` | Delivery Orders |

### How the sidebar hides inaccessible modules

In `auth-context.tsx`, the `hasModuleAccess(module)` function checks:
```typescript
const modules = selectedCompany?.modules ?? [];
return user?.role === "admin" || modules.includes(module);
```

The sidebar checks this per item and hides nav links the user can't access.

### Document visibility (isPrivate)

Each document has `is_private` boolean. The visibility rule applied at the list/get level:
```typescript
// "external" role users only see their own documents
if (isExternal) return docs.filter(d => d.createdBy === userId);
// Regular users: private docs only visible to creator + admins
return docs.filter(d => !d.isPrivate || d.createdBy === userId || isAdmin);
```

---

## 8. Document Number (Running Number) System

**File:** `artifacts/api-server/src/lib/running-numbers.ts`

### How it works

Each company has its own counter stored in the `settings` table. Format: `{prefix}{counter}{suffix}`.

**Atomic increment (prevents race conditions):**
```sql
UPDATE settings
SET po_counter = po_counter + 1
WHERE company_id = $1
RETURNING *
```
The increment and read happen in a **single SQL statement** — if two requests arrive simultaneously, one gets counter N and the other gets N+1 automatically.

**Duplicate-skip safety:** After getting the new number, the system checks whether that number already exists in the document table. If so (e.g., a previous manual insert or data migration), it keeps incrementing until a unique number is found (max 50 attempts).

### Configurable patterns

| Setting | Default | Example result |
|---------|---------|---------------|
| `po_prefix = "PO"`, `po_counter = 1`, `po_suffix = ""` | `PO1` | PO1, PO2, PO3 ... |
| `po_prefix = "RSV-PO-"`, `po_counter = 1001`, `po_suffix = "-2026"` | `RSV-PO-1001-2026` | RSV-PO-1001-2026 |

Admins can configure prefix/counter/suffix for each document type in **Settings → Running Numbers**.

### Document types supported

`"po"` | `"inv"` | `"qt"` | `"do"` | `"grn"`

---

## 9. Module: Purchase Orders (PO)

**API file:** `artifacts/api-server/src/routes/purchase-orders.ts`  
**Frontend pages:** `artifacts/po-app/src/pages/purchase-orders/`

### What it does

A Purchase Order is sent **to a vendor** when the company wants to buy goods or services. It records vendor details, line items (qty × unit price), tax, and total.

### Business logic

| Rule | Details |
|------|---------|
| Create | Requires auth + selected company. Calls `nextDocNumber("po", companyId)`. Auto-adds vendor to `vendors` directory if not already there (case-insensitive match). |
| Status flow | `draft` → `confirmed` → `cancelled` |
| Auto-GRN | When a PO is **confirmed**, a Goods Received Note (GRN) is automatically created with the same items at `status = "draft"`. |
| Revert from confirmed | If a confirmed PO is moved back to draft/cancelled, the system checks whether any items have already been received in the GRN. If yes, the status change is **blocked** with HTTP 409. |
| Delete | Admin-only. |
| `quoteRefNo` | Optional reference to a Sales Quotation number (free text). |
| isPrivate | Hides the document from other users (except admins). |

### Amount calculation

```
subtotal    = sum(item.qty × item.unitPrice) per non-section item
taxAmount   = subtotal × (tax% / 100)
totalAmount = subtotal + taxAmount
```

Note: Per-item discount is not on PO (that's a QT/INV feature). Tax is document-level percentage.

### Auto-vendor upsert logic

On every PO create/update, the system does:
1. `SELECT id FROM vendors WHERE company_id = ? AND name ILIKE ?`
2. If not found: `INSERT INTO vendors (companyId, name, address, contactPerson, contactEmail)`

This means the vendor directory is auto-populated as users create POs.

### Visibility (excludeLinked query param)

`GET /api/purchase-orders?excludeLinked=true` — filters out POs that are already linked to a Vendor Invoice. Used in the AP module's PO picker.

---

## 10. Module: Quotations (QT)

**API file:** `artifacts/api-server/src/routes/quotations.ts`  
**Frontend pages:** `artifacts/po-app/src/pages/quotations/`

### What it does

A Quotation is sent **to a customer** with a price proposal. Unlike PO, Quotations support a **document-level discount** and per-item discount.

### Business logic

| Rule | Details |
|------|---------|
| Create | Requires auth + company. Calls `nextDocNumber("qt", companyId)`. Auto-adds customer to `customers` directory. |
| Status | `draft` → `confirmed` → `cancelled` |
| Delete | Admin-only. |
| Discount | `discountAmount` field at document level (in addition to per-item `discount` %). |

### Amount calculation

```
subtotal        = sum(item.amount) for all non-section items
taxableAmount   = subtotal - discountAmount
taxAmt          = taxableAmount × (tax / 100)
totalAmount     = taxableAmount + taxAmt
```

### Section header rows

Items array can contain rows with `type: "section"` — these are rendered as bold header rows in the PDF and form, and are excluded from all financial calculations.

---

## 11. Module: Invoices (INV)

**API file:** `artifacts/api-server/src/routes/invoices.ts`  
**Frontend pages:** `artifacts/po-app/src/pages/invoices/`

### What it does

The Tax Invoice is sent to customers as a billing document. PDFs show **"TAX INVOICE"** in the header. This module has strict rules: **invoices are never deleted** once confirmed.

### Status lifecycle

```
draft → confirmed → void (with reason)
                 → paid (knock-off)
```

| Status | Can transition to | Who can do it |
|--------|-------------------|---------------|
| draft | confirmed, void | any authenticated user |
| confirmed | void, paid | any authenticated user |
| void | — (terminal) | any authenticated user |
| paid | — (terminal) | any authenticated user |
| draft | (delete) | admin only |

### Special actions

**Void (`POST /api/invoices/:id/void`):**
- Requires `voidReason` in body (mandatory)
- Sets `status = "void"` and stores the reason
- Cannot void an already-voided invoice

**Knock-off / Mark Paid (`POST /api/invoices/:id/knock-off`):**
- Sets `status = "paid"`
- Cannot knock off a voided invoice

### Auto-creation of Delivery Order

When an invoice is **first confirmed** (status changes from anything → `"confirmed"`):
1. System checks if a DO already exists for this invoice (`deliveryOrdersTable.invId = invoice.id`)
2. If not found: auto-creates a DO with `status = "draft"` using the invoice's items and customer details
3. The DO is linked via `inv_id` and `inv_number` columns

### Stock deduction on save (non-serial items)

When a new invoice is created or updated, for each item with `isStockItem = true` but **no selected serials**:
- Look up `stock_items` by `partNumber` (code field, case-insensitive)
- Decrement `stock_qty` using `GREATEST(0, stock_qty - qty)` to avoid negative stock

### Serial number reservation on confirm

When an invoice is confirmed and items have `selectedSerials`:
- Update `stock_serials.status = "reserved"` for each serial
- Link `invoiceId` and `invoiceNumber` on each serial record

### `poRefNo` field

Free-text reference to a PO number (no foreign key). Shown on the invoice PDF and view page.

### Amount calculation (same as QT)

```
subtotal = sum(item.amount) for type="item" rows only (sections excluded)
taxable  = subtotal - discountAmount
taxAmt   = taxable × (tax / 100)
total    = taxable + taxAmt
```

---

## 12. Module: Delivery Orders (DO)

**API file:** `artifacts/api-server/src/routes/delivery-orders.ts`  
**Frontend pages:** `artifacts/po-app/src/pages/delivery-orders/`

### What it does

A Delivery Order accompanies physical shipments to customers. It lists items being delivered but **has no pricing** (unlike invoices/quotations).

### Key differences from other documents

- No `subtotal`, `tax`, `totalAmount` columns — it's quantity-only
- Items have: `description`, `partNumber`, `uom`, `qty`, `serialNumbers`, `itemImage`
- Can be linked to an invoice via `inv_id` / `inv_number`
- Can be auto-created when an invoice is confirmed

### Serial number tracking on DO confirm

When a DO is **first confirmed**:
- For each item with `serialNumbers` (newline-separated):
  1. Looks up `stock_item` by `partNumber`
  2. Updates each serial: `status = "shipped"`, `doId`, `doNumber`
  3. Decrements `stock_qty` by number of serials shipped

### Delete

Admin-only.

---

## 13. Module: Goods Received Notes (GRN)

**API file:** `artifacts/api-server/src/routes/grn.ts`  
**Frontend pages:** `artifacts/po-app/src/pages/grn/`

### What it does

Records items received from a vendor against a Purchase Order.

### Auto-creation

When a PO is confirmed, a GRN is automatically created:
```typescript
async function autoCreateGrn(po, userId) {
  const grnNumber = await nextDocNumber("grn", po.companyId);
  await db.insert(grnTable).values({
    grnNumber,
    poId: po.id,
    poNumber: po.poNumber,
    vendorName: po.vendorName,
    companyId: po.companyId,
    status: "draft",
    items: po.items.map(item => ({ ...item, receivedQty: 0 })),
    createdBy: userId,
  });
}
```

### GRN blocking logic

If you try to un-confirm a PO (revert from `confirmed`) **and the GRN already has received quantities > 0**, the system blocks the status change:
```typescript
async function autoDeleteGrnIfEmpty(poId) {
  const grn = await db.select()...where(poId = poId);
  const hasReceived = grn.items.some(item => item.receivedQty > 0);
  if (hasReceived) return { blocked: true, grnNumber: grn.grnNumber };
  // Else: delete the empty GRN
  await db.delete(grnTable).where(...);
  return { blocked: false };
}
```

### Stock increment on GRN confirm

When a GRN is confirmed, stock quantities are updated for each received item.

---

## 14. Module: Stock / Inventory

**API file:** `artifacts/api-server/src/routes/stock-items.ts` + `stock-serials.ts`  
**Frontend page:** `artifacts/po-app/src/pages/stock/list.tsx`

### Stock items (`stock_items` table)

| Field | Purpose |
|-------|---------|
| `code` | Part number / SKU (used to link invoices/DOs to stock) |
| `name` | Display name |
| `uom` | Unit of measure (default from settings) |
| `type` | `"product"` or `"service"` |
| `unit_price` | Default selling price |
| `stock_qty` | Current quantity on hand |
| `is_active` | Soft-delete flag |

### Stock serials (`stock_serials` table)

Used for serialized inventory (e.g., hardware with serial numbers). Each serial tracks:
- Status: `available` → `reserved` (on invoice confirm) → `shipped` (on DO confirm)
- Which GRN brought it in, which invoice reserved it, which DO shipped it

### Settings that affect stock behavior

| Setting | Effect |
|---------|--------|
| `allowNegativeStock` | If false, stock cannot go below 0 (enforced via `GREATEST(0, qty - delta)` in SQL) |
| `autoDeductOnDo` | If true, stock deducts when a DO is confirmed (in addition to on invoice save) |
| `lowStockWarning` | Threshold below which a visual warning is shown |

---

## 15. Module: Vendor Invoices (AP)

**API file:** `artifacts/api-server/src/routes/vendor-invoices.ts`  
**Frontend pages:** `artifacts/po-app/src/pages/vendor-invoices/`

### What it does

Tracks **Proforma Invoices (PI)** received from vendors — the Accounts Payable side. A vendor PI can cover one or multiple POs.

### Payment tracking workflow

```
Vendor PI created → status: "pending"
    ↓
Record payment (partial) → status: "partial", paidAmount updated
    ↓
All amount paid → status: "paid"
```

### `recalcPI` function

Every time a payment is added, edited, or deleted:
```typescript
async function recalcPI(piId, companyId) {
  const payments = await db.select()...where(vendorInvoiceId = piId);
  const paidAmount = payments.reduce((s, p) => s + p.amount, 0);
  const total = pi.totalAmount;
  let status = "pending";
  if (paidAmount >= total && total > 0) status = "paid";
  else if (paidAmount > 0) status = "partial";
  await db.update(vendorInvoicesTable)
    .set({ paidAmount, status, updatedAt: now() })...
}
```

### API endpoints for payments

```
GET    /api/vendor-invoices/:id/payments           list payments
POST   /api/vendor-invoices/:id/payments           add payment
PUT    /api/vendor-invoices/:id/payments/:payId    edit payment
DELETE /api/vendor-invoices/:id/payments/:payId    delete payment (admin only)
```

### `poIds` JSONB field

Stores an array of PO IDs this vendor PI is linked to: `[1, 5, 12]`. The PO list page uses `?excludeLinked=true` to hide POs already linked to a vendor PI.

---

## 16. Module: Vendors & Customers Directories

**API files:** `vendors.ts`, `customers.ts`  
**Frontend pages:** `vendors/`, `customers/`, `address-book/`

### Auto-population

Whenever a document is saved, the server auto-inserts the vendor/customer if they don't already exist in the directory:
```typescript
async function upsertVendorByName(companyId, name, address, contactPerson, contactEmail) {
  const existing = await db.select()...where(ilike(vendors.name, name));
  if (existing.length === 0) {
    await db.insert(vendorsTable).values({ companyId, name, ... });
  }
}
```

### Directory Picker

The `DirectoryPicker` component (`components/directory-picker.tsx`) is available on all 8 document forms. When a user clicks "Pick from Vendors" or "Pick from Customers":
1. Opens a searchable modal listing all active vendors/customers for the company
2. On select: auto-fills `name`, `address`, `contactEmail` on the form
3. **Auto-computes GST rate**: if the party is overseas or not GST-registered → GST = 0%. If local and GST-registered → uses the company's GST rate from settings.

### `gstRegistered` and effective GST logic

```typescript
const effectiveGst = 
  (!vendor.country || vendor.country === companyCountry) && vendor.gstRegistered
    ? companyGstRate
    : 0;
```

---

## 17. Module: Settings

**API file:** `artifacts/api-server/src/routes/settings.ts`  
**Frontend page:** `artifacts/po-app/src/pages/settings/`

### What's configurable per company

| Section | Fields |
|---------|--------|
| GST / Tax | `gstRate` (%, shown as "GST (Singapore)" or "GST (India)" based on company country) |
| SMTP Email | `smtpHost`, `smtpPort`, `smtpUser`, `smtpPass`, `smtpFrom` |
| Running Numbers | prefix + counter + suffix for PO, QT, INV, DO, GRN |
| ERP | `allowNegativeStock`, `autoDeductOnDo`, `lowStockWarning`, `defaultUom` |
| Document footer | `bankDetails`, `termsAndConditions` (appears on PDFs) |

### `ensureSettings` pattern

Before reading or writing settings, the server calls `ensureSettings(companyId)`. If no settings row exists for the company yet, it creates one with sensible defaults (GST rate based on company country).

### GST label logic

```typescript
function gstLabelForCountry(country) {
  if (country === "india") return "GST (India)";
  if (country === "singapore") return "GST (Singapore)";
  return `GST (${country})`;
}
```

### SMTP password handling

When updating settings, `smtpPass` is only written to DB if the new value is non-empty. This prevents accidentally clearing a saved password when saving other settings fields.

---

## 18. Module: Email Sending

**API file:** `artifacts/api-server/src/routes/email.ts`  
**Component:** `artifacts/po-app/src/components/email-send-dialog.tsx`

### How email sending works

1. User clicks the **Send Email** button on any document view/preview page
2. `EmailSendDialog` opens — an Outlook-style tag-input for multiple recipients
3. User enters To addresses (can type email then press Enter/comma/space to add as tag)
4. Frontend generates the PDF in-browser as **base64** using jsPDF
5. Frontend POSTs to `/api/send-email`:
   ```json
   {
     "to": "email1@example.com,email2@example.com",
     "subject": "PO-0001 from RSV Infotech",
     "body": "Please find attached...",
     "pdfBase64": "JVBERi0xLjQ...",
     "filename": "PO-0001.pdf"
   }
   ```
6. Server retrieves SMTP settings for the current company from `settings` table
7. Creates a `nodemailer` transporter and calls `sendMail()` with the PDF as a base64 attachment

### SMTP test

`POST /api/test-email` — just runs `transporter.verify()` to confirm the SMTP connection works without sending a message.

### Email contact history

After a successful send, recipient emails are stored in `email_contacts` table with `use_count` tracking. Used to provide autocomplete suggestions when typing in the To field next time.

---

## 19. Module: Admin Panel

**API file:** `artifacts/api-server/src/routes/users.ts`  
**Frontend page:** `artifacts/po-app/src/pages/admin/`

### What admins can do

- **View all users** with their company assignments and module access
- **Create user** — username, password, role (`admin`/`user`), assign to companies with specific module permissions
- **Edit user** — change username, password, role, or company/module assignments
- **Delete user** — cannot delete yourself
- All operations require the requester to have `role = "admin"`

### Company + module assignment UI

When creating or editing a user, the admin sees a nested UI:
1. Toggle company access (checkbox per company)
2. For each enabled company: checkboxes for each module (`purchase_orders`, `quotations`, `invoices`, `delivery_orders`)

This writes to `user_companies` table: one row per (userId, companyId) with a `modules` JSONB array.

### Update user flow

```typescript
// 1. Update users table (username, password, role)
await db.update(usersTable).set(updates).where(eq(usersTable.id, userId));

// 2. Replace all company assignments (delete + re-insert)
await db.delete(userCompaniesTable).where(eq(userCompaniesTable.userId, userId));
for (const { companyId, modules } of companyAccess) {
  await db.insert(userCompaniesTable).values({ userId, companyId, modules });
}
```

---

## 20. Module: Audit Logs

**API file:** `artifacts/api-server/src/routes/audit-logs.ts`  
**Library:** `artifacts/api-server/src/lib/audit.ts`  
**Frontend page:** `artifacts/po-app/src/pages/admin/audit-log.tsx`

### How audit logging works

Every write operation calls the `logAudit()` helper **fire-and-forget** (`.catch(() => {})` — audit failures never crash the main operation):

```typescript
export function logAudit({ req, action, entityType, entityId, entityLabel, details }) {
  db.insert(auditLogsTable).values({
    companyId:   req.session?.companyId,
    userId:      req.session?.userId,
    username:    req.session?.username,
    action,         // "create" | "update" | "delete" | "status:confirmed" | "void" | "knock-off" | etc.
    entityType,     // "purchase_order" | "quotation" | "invoice" | "delivery_order" | etc.
    entityId:    String(entityId),
    entityLabel,    // Document number, e.g. "PO-0001"
    details,        // Optional JSONB (e.g., { voidReason: "..." })
    ipAddress,
  }).catch(() => {});
}
```

### Audit log entries created for

| Action | When |
|--------|------|
| `create` | Any new document/user/payment |
| `update` | Any edit |
| `delete` | Any deletion |
| `status:confirmed` | PO/QT/INV/DO confirmed |
| `status:cancelled` | Document cancelled |
| `void` | Invoice voided |
| `knock-off` | Invoice marked paid |
| `payment:add` | Payment added to vendor PI |
| `payment:update` | Payment edited |
| `payment:delete` | Payment deleted |

---

## 21. PDF Generation

**File:** `artifacts/po-app/src/lib/pdf.ts`

All PDFs are generated **in the browser** using `jsPDF` + `jspdf-autotable`. They can be:
- Previewed inline via `PdfPreviewModal` (converted to a blob URL, embedded in an `<iframe>`)
- Downloaded directly
- Sent as email attachment (returned as `base64` string from the generator function)

### Four PDF generators

| Function | Document | Header |
|----------|----------|--------|
| `generatePoPdf(po, company)` | Purchase Order | "PURCHASE ORDER" |
| `generateQtPdf(qt, company)` | Quotation | "QUOTATION" |
| `generateInvPdf(inv, company)` | Tax Invoice | "TAX INVOICE" |
| `generateDoPdf(do, company)` | Delivery Order | "DELIVERY ORDER" |

Each function accepts an optional `returnBase64?: boolean` parameter. If `true`, returns a base64 string for email. If `false`/undefined, triggers a browser download.

### PDF structure

```
┌──────────────────────────────────────────┐
│  Company Logo   │  Company Name           │
│  (left)         │  Address, Phone, Email  │
│                 │  Registration No.       │
├──────────────────────────────────────────┤
│  "TAX INVOICE" (large, centered)         │
├──────────────────────────────────────────┤
│  Bill To:        │  Invoice No:  INV-001  │
│  Customer Name   │  Date:        2026-..  │
│  Address         │  PO Ref:      PO-001   │
│                  │  Payment Terms: 30 Days│
├──────────────────────────────────────────┤
│  # │ Part No │ Description │ Qty │ Price │ Amount │
│  1 │ ABC-123 │ Product...  │  5  │ 10.00 │  50.00 │
│    ← Section header rows (shaded) →      │
├──────────────────────────────────────────┤
│                    Subtotal:     50.00   │
│                    Discount:    -  5.00  │
│                    GST (9%):      4.05   │
│                    TOTAL:        49.05   │
├──────────────────────────────────────────┤
│  Bank Details     │  Terms & Conditions   │
│  (from settings)  │  (from settings)      │
├──────────────────────────────────────────┤
│  Page 1 of 2                (footer)     │
└──────────────────────────────────────────┘
```

### `autoTableRich` — rich text in table cells

A custom function that renders bold/italic HTML from the description editor into PDF table cells. It parses `<b>`, `<i>`, `<strong>`, `<em>` tags and switches font styles mid-cell.

**Signature:**
```typescript
autoTableRich(
  doc: jsPDF,
  columns: ColumnInput[],
  rows: CellDef[][],
  options: UserOptions,
  itemImages?: (string | null | undefined)[]   // base64 image per row
)
```

### Per-item images in PDF

When any line item has an `itemImage` (base64 data-URL), the PDF reserves 26mm at the right side of the description column and renders the image (max 24×18mm) after the text content is drawn.

### Conditional columns

**Part Number column:** Only shown in the PDF if at least one line item has a non-empty `partNumber`. Logic:
```typescript
const hasPartNo = items.some(item => item.type !== "section" && item.partNumber?.trim());
```

**Section rows:** Items with `type: "section"` are rendered as full-width shaded header rows spanning all columns, bold text.

### Multi-currency formatting

```typescript
function fmtMoney(currency: string, amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}
```

---

## 22. Frontend Architecture

### Routing

Uses **wouter** (lightweight React router). Routes defined in `App.tsx`.

| Route | Component | Notes |
|-------|-----------|-------|
| `/login` | `login.tsx` | Public |
| `/select-company` | `select-company/` | Shown after login if multi-company |
| `/` → `/dashboard` | `dashboard.tsx` | Redirects to dashboard |
| `/purchase-orders` | `purchase-orders/list.tsx` | |
| `/purchase-orders/new` | `purchase-orders/new.tsx` | |
| `/purchase-orders/:id/edit` | `purchase-orders/edit.tsx` | |
| `/purchase-orders/:id` | `purchase-orders/view.tsx` | |
| `/quotations` | `quotations/list.tsx` | |
| `/quotations/new` | `quotations/new.tsx` | |
| `/quotations/:id/edit` | `quotations/edit.tsx` | |
| `/quotations/:id` | `quotations/view.tsx` | |
| `/invoices` | `invoices/list.tsx` | |
| `/invoices/new` | `invoices/new.tsx` | |
| `/invoices/:id/edit` | `invoices/edit.tsx` | |
| `/invoices/:id` | `invoices/view.tsx` | |
| `/delivery-orders` | `delivery-orders/list.tsx` | |
| `/delivery-orders/new` | `delivery-orders/new.tsx` | |
| `/delivery-orders/:id/edit` | `delivery-orders/edit.tsx` | |
| `/delivery-orders/:id` | `delivery-orders/view.tsx` | |
| `/grn` | `grn/list.tsx` | |
| `/grn/:id` | `grn/view.tsx` | |
| `/stock` | `stock/list.tsx` | |
| `/vendor-invoices` | `vendor-invoices/list.tsx` | |
| `/vendor-invoices/:id` | `vendor-invoices/view.tsx` | |
| `/vendors` | `vendors/index.tsx` | |
| `/customers` | `customers/index.tsx` | |
| `/address-book` | `address-book/index.tsx` | |
| `/admin` | `admin/index.tsx` | Admin only |
| `/settings` | `settings/index.tsx` | Admin only |
| `/audit-log` | `admin/audit-log.tsx` | Admin only |

### API client code generation

API types, hooks, and Zod schemas are **generated** — never hand-written:

```
lib/api-spec/openapi.yaml
         ↓ (pnpm --filter @workspace/api-spec run codegen)
lib/api-client-react/   ← useGetPurchaseOrders(), useCreatePurchaseOrder(), etc.
lib/api-zod/            ← PurchaseOrderSchema, InvoiceSchema, etc.
```

Always re-run codegen after changing `openapi.yaml`.

### Form pattern (all 8 document forms follow this)

1. `useForm()` from `react-hook-form` with a Zod schema resolver
2. `useFieldArray()` for the `items` array
3. **Auto-append empty row**: a `useEffect` watches the items array; when the last row is non-empty, it appends a new blank row automatically
4. Two submit buttons: **Save Draft** (`openPreview = false`) and **Save & Preview** (`openPreview = true`)
5. On success with preview: saves `savedDoc` state → `PdfPreviewModal` opens automatically

### `PdfPreviewModal` component

Used on all 8 New + 8 Edit + 4 View pages. Shows an inline PDF preview with:
- **Edit** button → navigates to edit page
- **Download** button → triggers PDF download
- **Send Email** button → opens `EmailSendDialog`

### Key reusable components

| Component | Purpose |
|-----------|---------|
| `ItemImageField` | 100×80 image paste/upload zone per line item |
| `RichTextEditor` | Bold/italic HTML editor for item descriptions |
| `DirectoryPicker` | Modal to pick vendor/customer from directory |
| `PaymentTermsSelect` | Dropdown: 30-Day, 14-Day, 7-Day, COD, Advance, Custom |
| `DeliveryDateField` | Quick-pick: 1 Week / 2 Weeks / ETA / Custom date |
| `IssueDateField` | Date picker with 30-day backdating warning (GST compliance) |
| `EmailSendDialog` | Outlook-style multi-recipient email dialog |

---

## 23. API Reference

All endpoints are under `/api/`. Authentication is via session cookie (set on login).

### Auth

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | Login with `{username, password}` |
| POST | `/api/auth/logout` | Destroy session |
| GET | `/api/auth/me` | Get current user + company list |
| POST | `/api/auth/select-company` | Set active company `{companyId}` |

### Users (admin only)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/users` | List all users with company assignments |
| POST | `/api/users` | Create user |
| PUT | `/api/users/:id` | Update user (username/password/role/companies) |
| DELETE | `/api/users/:id` | Delete user |

### Purchase Orders

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/purchase-orders` | List POs for current company |
| GET | `/api/purchase-orders/stats` | Count/value breakdown by status |
| POST | `/api/purchase-orders` | Create PO |
| GET | `/api/purchase-orders/:id` | Get single PO |
| PUT | `/api/purchase-orders/:id` | Update PO |
| DELETE | `/api/purchase-orders/:id` | Delete PO (admin only) |

### Quotations

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/quotations` | List |
| GET | `/api/quotations/stats` | Stats |
| POST | `/api/quotations` | Create |
| GET | `/api/quotations/:id` | Get |
| PUT | `/api/quotations/:id` | Update |
| DELETE | `/api/quotations/:id` | Delete (admin only) |

### Invoices

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/invoices` | List |
| GET | `/api/invoices/stats` | Stats |
| POST | `/api/invoices` | Create |
| GET | `/api/invoices/:id` | Get |
| PUT | `/api/invoices/:id` | Update |
| POST | `/api/invoices/:id/void` | Void `{voidReason}` |
| POST | `/api/invoices/:id/knock-off` | Mark as paid |
| DELETE | `/api/invoices/:id` | Delete draft-only (admin only) |

### Delivery Orders

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/delivery-orders` | List |
| GET | `/api/delivery-orders/stats` | Stats |
| POST | `/api/delivery-orders` | Create |
| GET | `/api/delivery-orders/:id` | Get |
| PUT | `/api/delivery-orders/:id` | Update |
| DELETE | `/api/delivery-orders/:id` | Delete (admin only) |

### GRN

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/grn` | List |
| GET | `/api/grn/:id` | Get |
| PUT | `/api/grn/:id` | Update (mark items received) |

### Stock

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/stock-items` | List stock items |
| POST | `/api/stock-items` | Create stock item |
| PUT | `/api/stock-items/:id` | Update stock item |
| DELETE | `/api/stock-items/:id` | Delete (admin only) |
| GET | `/api/stock-serials` | List serials |
| POST | `/api/stock-serials` | Add serial |
| PUT | `/api/stock-serials/:id` | Update serial |

### Vendor Invoices (AP)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/vendor-invoices` | List |
| POST | `/api/vendor-invoices` | Create |
| GET | `/api/vendor-invoices/:id` | Get (includes payments) |
| PUT | `/api/vendor-invoices/:id` | Update |
| DELETE | `/api/vendor-invoices/:id` | Delete (admin only) |
| GET | `/api/vendor-invoices/:id/payments` | List payments |
| POST | `/api/vendor-invoices/:id/payments` | Add payment |
| PUT | `/api/vendor-invoices/:id/payments/:payId` | Edit payment |
| DELETE | `/api/vendor-invoices/:id/payments/:payId` | Delete payment (admin only) |

### Vendors & Customers

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/vendors` | List vendors for company |
| POST | `/api/vendors` | Create vendor |
| PUT | `/api/vendors/:id` | Update vendor |
| DELETE | `/api/vendors/:id` | Delete vendor |
| GET | `/api/customers` | List customers |
| POST | `/api/customers` | Create customer |
| PUT | `/api/customers/:id` | Update customer |
| DELETE | `/api/customers/:id` | Delete customer |

### Settings

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/settings` | Get current company settings |
| PUT | `/api/settings` | Update settings (admin only in UI; API checks session) |

### Email

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/send-email` | Send PDF by email |
| POST | `/api/test-email` | Test SMTP connection |

### Other

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/audit-logs` | Audit log entries |
| GET | `/api/maintenance` | Maintenance mode status |
| PUT | `/api/maintenance` | Toggle maintenance (admin) |
| GET | `/api/contacts` | Unified vendor+customer list |
| GET | `/api/email-contacts` | Email autocomplete history |
| GET | `/api/companies` | List companies |

---

## 24. Database Schema Reference

> Full CREATE TABLE scripts are in `db-scripts/schema-postgres.sql` (PostgreSQL) and `db-scripts/schema-mysql.sql` (MySQL).

### Table overview

| Table | Rows | Purpose |
|-------|------|---------|
| `companies` | 3 | Company master — RSV Infotech, Netopsys, Netopsys AI |
| `users` | ≥1 | Login accounts |
| `user_companies` | n×m | Which user → which company + which modules |
| `settings` | 1/company | GST, SMTP, running numbers, ERP config |
| `purchase_orders` | many | Purchase orders (vendor-facing) |
| `quotations` | many | Sales quotations (customer-facing) |
| `invoices` | many | Tax invoices (customer-facing, never deleted) |
| `delivery_orders` | many | Delivery/shipping orders |
| `grn` | many | Goods received notes |
| `stock_items` | many | Product/service catalogue |
| `stock_serials` | many | Individual serial numbers |
| `vendor_invoices` | many | Vendor proforma invoices (AP) |
| `vendor_payments` | many | Payment records against vendor PIs |
| `vendors` | many | Vendor directory |
| `customers` | many | Customer directory |
| `email_contacts` | many | Email autocomplete history |
| `audit_logs` | many | All write-action history |
| `maintenance` | 1 | System maintenance flag |
| `conversations` | many | AI chat threads |
| `messages` | many | AI chat messages |
| `session` | many | Express session store (auto-created) |

### Key relationships

```
companies ──< user_companies >── users
companies ──< settings
companies ──< purchase_orders
companies ──< quotations
companies ──< invoices
companies ──< delivery_orders
companies ──< vendors
companies ──< customers
companies ──< stock_items ──< stock_serials
companies ──< vendor_invoices ──< vendor_payments
companies ──< email_contacts
invoices ──── delivery_orders (inv_id)
purchase_orders ──── grn (po_id)
purchase_orders ──── vendor_invoices (via po_ids JSONB array)
```

### `session` table (auto-managed by connect-pg-simple)

```sql
CREATE TABLE session (
  sid     VARCHAR NOT NULL PRIMARY KEY,
  sess    JSON NOT NULL,
  expire  TIMESTAMP(6) NOT NULL
);
CREATE INDEX ON session (expire);
```

---

## 25. Line Item (JSONB) Structure

All document tables store items as a **JSONB array**. The structure differs slightly per document type.

### PO / QT / INV items

```json
{
  "type":         "item",          // "item" | "section"
  "description":  "Product name",  // supports HTML bold/italic
  "partNumber":   "ABC-123",       // optional part/SKU
  "uom":          "pcs",
  "qty":          5,
  "unitPrice":    100.00,
  "amount":       500.00,          // server computes: qty × unitPrice
  "tax":          9,               // tax % (for display, not used in calc — doc-level tax used)
  "discount":     0,               // per-item discount %
  "sectionLabel": "",              // used when type="section"
  "sectionAlign": "left",          // "left" | "center"
  "itemImage":    "",              // base64 data-URL or ""
  "isStockItem":  false,           // links to stock_items by partNumber
  "selectedSerials": []            // serial numbers selected for this item
}
```

### Section rows

```json
{
  "type":         "section",
  "sectionLabel": "Hardware Components",
  "sectionAlign": "center",
  "description":  "",
  "partNumber":   "",
  "uom":          "",
  "qty":          0,
  "unitPrice":    0,
  "amount":       0,
  "tax":          0,
  "discount":     0,
  "itemImage":    ""
}
```

Section rows are **excluded from subtotal calculation** on both API and frontend.

### DO items (no pricing)

```json
{
  "description":   "Product name",
  "partNumber":    "ABC-123",
  "uom":           "pcs",
  "qty":           5,
  "serialNumbers": "SN001\nSN002",  // newline-separated
  "itemImage":     ""
}
```

### GRN items

```json
{
  "description":  "Product",
  "partNumber":   "ABC-123",
  "qty":          5,
  "receivedQty":  3,                // filled in when goods arrive
  "uom":          "pcs"
}
```

---

## 26. Cross-Cutting Concerns & Patterns

### Company scoping pattern

**Every** data-access query that returns company-specific data includes a `companyId` filter:
```typescript
const docs = await db.select()
  .from(purchaseOrdersTable)
  .where(eq(purchaseOrdersTable.companyId, req.session.companyId))
  .orderBy(desc(purchaseOrdersTable.createdAt));
```

If `companyId` is somehow missing from the session, `requireCompany()` returns 400 before any DB access.

### `parsePO` / `parseDoc` pattern

Drizzle returns `DECIMAL` columns as strings from PostgreSQL. Each route file has a local parse function that converts them to JavaScript numbers and normalizes `createdAt`:
```typescript
function parsePO(po) {
  return {
    ...po,
    subtotal:    parseFloat(po.subtotal ?? "0"),
    tax:         parseFloat(po.tax ?? "0"),
    totalAmount: parseFloat(po.totalAmount ?? "0"),
    createdAt:   po.createdAt instanceof Date ? po.createdAt.toISOString() : po.createdAt,
  };
}
```

### `withUsernames` pattern

List endpoints enrich documents with `createdByUsername` for display in the "Created By" column:
```typescript
async function withUsernames(docs) {
  const userIds = [...new Set(docs.map(d => d.createdBy))];
  const users = await db.select({ id, username }).from(usersTable).where(inArray(...));
  const map = Object.fromEntries(users.map(u => [u.id, u.username]));
  return docs.map(d => ({ ...d, createdByUsername: map[d.createdBy] || null }));
}
```

### Request body size limit

Set to `10mb` to accommodate base64-encoded item images:
```typescript
app.use(express.json({ limit: "10mb" }));
```

### JSONB defaults

Drizzle/PostgreSQL stores JSONB `[]` as the default for items arrays. Any new fields added to line items (like `itemImage`) are transparently stored without DB migrations — existing rows simply won't have the field, and the frontend uses `item.itemImage ?? ""` to handle absence.

### Logging convention

Never use `console.log` in server code. Use:
- `req.log.info(...)` / `req.log.error(...)` inside route handlers (pino-http)
- `logger.info(...)` / `logger.error(...)` in non-request code (from `lib/logger.ts`)

---

## 27. How to Add a New Module

Follow these steps to add, for example, a "Service Agreements" module:

### Step 1 — Database schema (`lib/db/src/schema/`)

Create `service-agreements.ts`:
```typescript
export const serviceAgreementsTable = pgTable("service_agreements", {
  id:         serial("id").primaryKey(),
  saNumber:   text("sa_number").notNull().unique(),
  companyId:  integer("company_id").notNull().default(1),
  // ... your fields
  items:      jsonb("items").notNull().default([]),
  status:     text("status").notNull().default("draft"),
  createdBy:  integer("created_by").notNull(),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

Export it from `lib/db/src/schema/index.ts`.

Push the schema:
```bash
pnpm --filter @workspace/db run push
```

### Step 2 — Running number support (`lib/running-numbers.ts`)

Add `"sa"` to the `DocType` union and `TABLE_MAP`.

### Step 3 — Settings table counter (optional)

If you need auto-numbering, add `sa_prefix`, `sa_counter`, `sa_suffix` columns to `settings` table via a migration, then add them to `running-numbers.ts`.

### Step 4 — OpenAPI spec (`lib/api-spec/openapi.yaml`)

Add a `ServiceAgreement` schema and paths (`GET /service-agreements`, `POST /service-agreements`, etc.). Run codegen:
```bash
pnpm --filter @workspace/api-spec run codegen
```

### Step 5 — API route (`artifacts/api-server/src/routes/`)

Create `service-agreements.ts` following the existing pattern:
- `requireAuth()` + `requireCompany()` guards
- `nextDocNumber("sa", companyId)` on create
- `parseSA()` to normalize DECIMAL columns
- `visibilityFilter()` for private documents
- `withUsernames()` for created-by display
- `logAudit()` on every write

Register the router in `routes/index.ts`.

### Step 6 — Frontend pages (`artifacts/po-app/src/pages/`)

Create `service-agreements/list.tsx`, `new.tsx`, `edit.tsx`, `view.tsx` using the existing PO/QT pages as templates.

### Step 7 — Add route to `App.tsx`

```tsx
<Route path="/service-agreements" component={ServiceAgreementsList} />
<Route path="/service-agreements/new" component={ServiceAgreementsNew} />
<Route path="/service-agreements/:id/edit" component={ServiceAgreementsEdit} />
<Route path="/service-agreements/:id" component={ServiceAgreementsView} />
```

### Step 8 — Add sidebar nav item

In the sidebar component, add the nav link gated by `hasModuleAccess("service_agreements")`.

### Step 9 — Add PDF generator to `lib/pdf.ts`

Follow the `generatePoPdf()` function signature and structure.

---

## 28. Common Pitfalls & Gotchas

### 1. DECIMAL columns come back as strings

PostgreSQL returns `NUMERIC`/`DECIMAL` as strings via the `pg` driver. Always call `parseFloat()` on `subtotal`, `tax`, `totalAmount`, etc. before doing arithmetic. The `parseDoc()` functions in each route handle this — don't skip them.

### 2. Session must have companyId before creating documents

All `POST`/`PUT` document routes fail with HTTP 400 if `req.session.companyId` is not set. If you're testing with a REST client, first call `POST /api/auth/login`, then `POST /api/auth/select-company`, then your document endpoint.

### 3. JSONB items absorb new fields without migrations

If you add new fields to line items (like `itemImage` was added), existing rows won't have the field. Always use `item.newField ?? ""` or `item.newField ?? defaultValue` when reading from JSONB — never assume the field exists.

### 4. Running number counter is per-company

`nextDocNumber("po", companyId)` uses a different counter row for each company. Never call it without `companyId` unless you deliberately want a global counter.

### 5. Invoice delete is restricted

Only **draft** invoices can be deleted, and only by admins. The delete route checks `status !== "draft"` and returns HTTP 400 if confirmed/void/paid. Design your integration tests accordingly.

### 6. Auto-DO creation side effect on invoice confirm

Confirming an invoice auto-creates a Delivery Order. In tests or integrations, be aware that confirming an invoice has this side effect. Check `delivery_orders` table after confirming.

### 7. GRN blocks PO revert

If a PO has been confirmed and goods have been received in its GRN, the PO **cannot** be moved back to draft or cancelled. The API returns HTTP 409. Users must void the GRN first.

### 8. bcrypt hash regenerated each time

The admin password hash in the seed script (`seed.ts`) is generated at runtime using `bcrypt.hash("admin123", 10)`. Every fresh install creates a different hash — this is correct behaviour. For SQL scripts, you must generate the hash manually using the Node command provided in the SQL files.

### 9. Session cookie is not secure in development

`cookie.secure = false` in `app.ts` — this is intentional for HTTP development. Set it to `true` in production behind HTTPS.

### 10. SMTP password is never returned in API responses

The `GET /api/settings` response omits `smtpPass`. The `PUT /api/settings` only updates it if the new value is non-empty. This prevents accidentally clearing saved credentials.

### 11. Request body size limit is 10MB

Set for base64 item images. If you're adding large file uploads, consider using object storage instead of base64-in-JSON.

### 12. `autoTableRich` fifth parameter for item images

If you call `autoTableRich` without the fifth `itemImages` parameter, no images are rendered — the parameter is optional and defaults to no images. Pass `items.map(i => i.itemImage || null)` to enable image rendering.

---

*End of Knowledge Transfer Kit — RSV Infotech Document Management System*
