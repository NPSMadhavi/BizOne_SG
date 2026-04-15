# RSV Infotech Document Management System

## Overview

A full-stack document management application for three companies: RSV Infotech Pte. Ltd. (Singapore), Netopsys Pte. Ltd. (Singapore), and Netopsys AI Pvt. Ltd. (India). Built on a pnpm workspace monorepo with TypeScript. Supports Purchase Orders, Quotations, Invoices, and Delivery Orders with professional PDF generation, GST management, and multi-company access control.

## Features

- Login system with admin and user roles; company selector at login for multi-company users
- **Multi-company support** — 3 seeded companies; users are assigned to one or more companies; all documents are scoped per company
- **Module access control** — per-company, per-user module permissions; admins see all modules; users only see modules they're granted
- **Purchase Orders** — create, edit, view, delete; PDF generation; item table with "Item / Part Number" column; status tracking; Sales Quote Ref No field
- **Quotations** — full CRUD (admin-only delete); configurable running number; GST pre-filled from settings; PDF generation with rich text bold/italic
- **Invoices** — Void (with reason dialog) + Knock-Off (mark paid) instead of delete; no deletion ever; configurable running number; GST; PDF header shows "TAX INVOICE"; rich text bold/italic in item descriptions
- **Delivery Orders** — full CRUD (admin-only delete); configurable running number; rich text bold/italic in item descriptions; **Item No. (Part Number)** column; **Payment Terms** dropdown; PDF auto-shows Part Number column when any item has one
- **Settings** — centralized GST rate (admin-only edit); SMTP email config; **Running Numbers** card (per-doc-type prefix/counter/suffix with live preview)
- **Email sending** — multi-recipient tag-input dialog (Outlook-style); send PO/Quotation/Invoice as PDF attachment via SMTP; reusable EmailSendDialog component
- **PdfPreviewModal** — inline PDF preview (iframe) with Edit / Download / Send Email actions; used on all New, Edit, and View pages
- **PaymentTermsSelect** — dropdown with 30-Day, 14-Day, 7-Day, COD, Advance, and custom options on all PO/Quotation/Invoice/DO forms
- **DeliveryDateField** — quick-pick options (1 Week / 2 Weeks / ETA / Custom) on PO and Delivery Order forms
- **isPrivate** — per-document visibility toggle; private docs visible only to creator + admins; Lock icon badge on view pages
- **Draft / Preview workflow** — all New and Edit forms have "Save Draft" and "Save & Preview" buttons
- **Multi-currency** — SGD, USD, EUR, GBP, MYR, INR; `fmtMoney(currency, amount)` helper using Intl.NumberFormat in PDFs
- **Split contact fields** — separate "Contact Person" (name) and "Contact Email" fields on all forms
- **Admin Panel** — manage users (create, edit, delete); nested company + module assignment UI
- **Delete restrictions** — PO/QT/DO: delete button hidden for non-admin users; Invoice: no delete at all; void/knock-off workflow instead
- **Void Invoice** — dialog prompts for reason; sets status to "void" with stored reason; displayed as banner on invoice view
- **Invoice Knock-Off** — marks invoice as "paid"; confirmation dialog; both status values shown in list with blue/gray badges
- **"Created By" column** — all 4 list pages show username of the person who created each document
- **Rich text in PDFs** — bold/italic HTML formatting from the description editor is rendered in PDF item tables (autoTableRich helper)
- Dashboard with stats
- PDF generation using jsPDF + jspdf-autotable (consistent header/footer with selected company info)
- Sidebar shows current company with a switch button for multi-company users; hides inaccessible module nav items

## Companies (seeded on startup)

1. RSV Infotech Pte. Ltd. — Singapore (id=1)
2. Netopsys Pte. Ltd. — Singapore (id=2)
3. Netopsys AI Pvt. Ltd. — India (id=3)

Admin users have access to all companies automatically.

## Document Numbering

- PO: `PO-YYYYMM-XXXX`
- Quotation: `QT-YYYYMM-XXXX`
- Invoice: `INV-YYYYMM-XXXX`
- Delivery Order: `DO-YYYYMM-XXXX`

Where XXXX is a 4-digit random number.

## GST

- Stored in `settingsTable` (singleton row, id=1)
- Default 9% (Singapore standard rate)
- Exposed via `GET /api/settings` / `PUT /api/settings`
- Auto-populated on new Quotation / Invoice / PO forms via `useGetSettings` hook
- Admin-only write access

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite + Tailwind CSS
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Authentication**: express-session + bcryptjs
- **PDF generation**: jsPDF + jspdf-autotable (supports base64 return for email attachment)
- **Email**: nodemailer (SMTP configured via settings table)
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)

## Default Admin Credentials

- **Username**: `admin`
- **Password**: `admin123`

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Architecture

- `artifacts/po-app/` — React + Vite frontend
- `artifacts/api-server/` — Express API server
- `lib/db/` — Drizzle ORM schema and client
- `lib/api-spec/` — OpenAPI specification
- `lib/api-client-react/` — Generated React Query hooks
- `lib/api-zod/` — Generated Zod validation schemas

## Database Tables

- `users` — user accounts (id, username, passwordHash, role)
- `companies` — company records (id, name, country, address, registrationNo, email, phone)
- `user_companies` — many-to-many join table (userId, companyId)
- `purchaseOrders` — PO records with JSONB items; scoped by companyId
- `quotations` — quotation records with JSONB items; scoped by companyId
- `invoices` — invoice records with JSONB items; scoped by companyId
- `deliveryOrders` — DO records with JSONB items (description, qty only — no pricing); scoped by companyId
- `settings` — singleton row for GST rate and SMTP config (smtpHost, smtpPort, smtpUser, smtpPass, smtpFrom)

## Session

- `express-session` stores `userId` and `companyId`
- `POST /api/auth/select-company` sets the active company for the session
- `GET /api/auth/me` returns the user with their companies list and selectedCompanyId
