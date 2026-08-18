# BizOne Report Designer

The Report Designer lets each company customize how invoices look without duplicating live business data.

**Templates store the design. Settings → Companies stores company data. Invoice tables store invoice data. The report engine combines all three at print time.**

## What was inspected

This module is built into the existing BizOne app (`artifacts/po-app` + `artifacts/api-server` + `lib/db`). It does **not** create a separate demo app, auth system, or company table.

| Area | Existing source of truth |
| --- | --- |
| Company name, address, phone, email, tax no, registration, logo | `companies` (`name`, `address`, `phone`, `email`, `gst_reg_no`, `registration_no`, `logo_url`, `domain`, `country`) |
| Terms & bank details | `settings` (`terms_and_conditions`, `bank_details`, `gst_rate`) |
| Invoice + items | `invoices` (`inv_number`, `issue_date`, `items` JSONB, totals, …) |
| Customer extras | `customers` (matched by name within the same company) |
| PDF | Existing Puppeteer (payslips) for template PDF; jsPDF remains a fallback |
| Permissions | `module:action` (`report_templates:view/create/edit/delete`) |
| Audit | Existing `audit_logs` |

City / state / postal code are **not** stored on `companies`, so they are not invented as template fields.

## User flow

1. Open **System → Report Templates**.
2. The **Default Invoice Template** already exists (system seed). Users never start from a blank canvas.
3. **Create Template** copies that default, then opens the designer.
4. Customize layout. Company/invoice values stay as field references such as `company.name`.
5. **Save** writes a company template. **Set Active** makes it the default for future invoices.
6. On an invoice, **Preview / PDF / Print** uses:
   1. the optional template dropdown (this run only), else
   2. the company’s active invoice template, else
   3. the system Default Invoice Template.

If Settings → Companies changes the name or logo, the next generated invoice shows the new values automatically. The template is not edited.

## Default vs Active

| | System Default | Company Active |
| --- | --- | --- |
| Owner | Application (`company_id` is null) | One company |
| Editable | View / Save As / Duplicate only | Edit, Save, Save As |
| Deletable | No | Only when inactive |
| Purpose | Starting layout for every company | Layout used for that company’s invoices |

There is at most one active company template per company + report type (enforced in a transaction and with a unique index).

## Permissions

Follows BizOne `module:action` naming:

- `report_templates:view` — list / open designer / preview in designer
- `report_templates:create` — create, save as, duplicate
- `report_templates:edit` — save, set active
- `report_templates:delete` — delete inactive company templates

Invoice **Preview / PDF / Print** is allowed with `invoices:view` so sales users can print without designer access.

Grant **Report Templates** in User Management (same as other modules). Administrators see it automatically.

## APIs

All routes use the authenticated session company. `companyId` from the client is ignored.

```
GET    /api/report-definitions
GET    /api/report-definitions/:id
GET    /api/report-templates
GET    /api/report-templates/active?reportType=invoice
GET    /api/report-templates/:id
POST   /api/report-templates
PUT    /api/report-templates/:id
POST   /api/report-templates/:id/duplicate
POST   /api/report-templates/:id/set-active
DELETE /api/report-templates/:id
GET    /api/reports/invoice-templates
GET    /api/reports/company-data
GET    /api/reports/invoice-data/:invoiceId
POST   /api/reports/preview
POST   /api/reports/generate
```

## Database

Created on startup (idempotent):

- `report_definitions`
- `report_fields`
- `report_templates`

Seeded once:

- Invoice definition + allowed fields
- **Default Invoice Template** (`is_system_template = true`, `company_id` null)

## Designer

- Left: elements (text, field, image, table, line, rectangle, date, page number) and field catalogue
- Center: A4 (or Letter) canvas — move / resize
- Right: properties
- **Save** / **Save As** / **Preview** (live company + latest invoice) / **Reset to Default**
- Unsaved navigation is confirmed
- Design mode shows `{{ Company Name }}`; preview/print shows live values

## Files

Backend: `artifacts/api-server/src/lib/reports/*`, `artifacts/api-server/src/routes/reports.ts`  
Frontend: `artifacts/po-app/src/pages/report-templates/*`, `artifacts/po-app/src/components/report-designer/*`, `artifacts/po-app/src/lib/report-designer/*`  
Schema: `lib/db/src/schema/report-*.ts`
