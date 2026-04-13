# RSV Infotech PO Generator

## Overview

A full-stack Purchase Order management application for RSV Infotech Pte. Ltd. Built on a pnpm workspace monorepo with TypeScript.

## Features

- Login system with admin and user roles
- Create professional Purchase Orders with line items (Part Number, Description, QTY, Unit Price, Amount auto-calculated)
- PDF generation using jsPDF with RSV Infotech logo
- PO list with search, filtering, and status badges
- Admin panel to manage users (create, edit, delete)
- Dashboard with PO stats

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
