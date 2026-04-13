# RSV Infotech Document Management System

## Overview

A full-stack document management application for RSV Infotech Pte. Ltd. (Singapore). Built on a pnpm workspace monorepo with TypeScript. Supports Purchase Orders, Quotations, Invoices, and Delivery Orders with professional PDF generation and GST management.

## Features

- Login system with admin and user roles
- **Purchase Orders** — create, edit, view, delete; PDF generation; item table with "Item / Part Number" column; status tracking
- **Quotations** — full CRUD; auto-numbered QT-YYYYMM-XXXX; GST pre-filled from settings; PDF generation
- **Invoices** — full CRUD; auto-numbered INV-YYYYMM-XXXX; GST pre-filled from settings; PDF generation
- **Delivery Orders** — full CRUD; auto-numbered DO-YYYYMM-XXXX; no pricing columns; PDF generation
- **Settings** — centralized GST rate (admin-only edit); currently 9%
- **Admin Panel** — manage users (create, edit, delete)
- Dashboard with stats
- PDF generation using jsPDF + jspdf-autotable (consistent header/footer with RSV Infotech branding)

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
- **PDF generation**: jsPDF + jspdf-autotable
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
- `purchaseOrders` — PO records with JSONB items
- `quotations` — quotation records with JSONB items
- `invoices` — invoice records with JSONB items
- `deliveryOrders` — DO records with JSONB items (description, qty only — no pricing)
- `settings` — singleton row for GST rate and other config
