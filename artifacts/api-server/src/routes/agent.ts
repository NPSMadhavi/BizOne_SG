import { Router, type IRouter } from "express";
import express from "express";
import {
  db, invoicesTable, quotationsTable, customersTable, stockItemsTable,
  settingsTable, purchaseOrdersTable, vendorsTable, deliveryOrdersTable,
  vendorInvoicesTable, grnTable, pool,
} from "@workspace/db";
import { eq, and, ilike, or, desc, SQL, gte } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { speechToText, ensureCompatibleFormat } from "@workspace/integrations-openai-ai-server/audio";
import { nextDocNumber } from "../lib/running-numbers.js";
import {
  loadAgentAuthContext,
  resolveAgentCompanyId,
  authorizeTool,
  filterTools,
  permissionContextBlock,
  type AgentAuthContext,
} from "../lib/agent-rbac.js";

const router: IRouter = Router();
router.use(express.json({ limit: "50mb" }));

function requireAuth(req: any, res: any): boolean {
  if (!req.session.userId) { res.status(401).json({ error: "Not authenticated" }); return false; }
  return true;
}
function requireCompany(req: any, res: any): boolean {
  if (!req.session.companyId) { res.status(400).json({ error: "No company selected." }); return false; }
  return true;
}

const AGENT_TOOLS = [
  {
    type: "function",
    function: {
      name: "searchCustomers",
      description: "Search the customer directory by name (partial or full — pass all words the user says). Returns address and contact details.",
      parameters: { type: "object", properties: { query: { type: "string", description: "Name or partial name. Pass the FULL name as spoken, including spaces." } }, required: ["query"] },
    },
  },
  {
    type: "function",
    function: {
      name: "searchVendors",
      description: "Search the vendor/supplier directory by name (partial or full). Returns address, contact, GST info.",
      parameters: { type: "object", properties: { query: { type: "string", description: "Name or partial name. Pass the FULL name as spoken." } }, required: ["query"] },
    },
  },
  {
    type: "function",
    function: {
      name: "searchQuotations",
      description: "Search or list quotations by QT number, customer name, and/or status. For 'show confirmed quotations' use status=confirmed and omit query. Do NOT put status words in query.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Optional QT number or customer name. Omit when listing by status only." },
          status: {
            type: "string",
            enum: ["draft", "confirmed", "sent", "cancelled", "converted_to_so"],
            description: "Optional status filter",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getQuotation",
      description: "Get full details of a specific quotation including all line items, pricing, and terms.",
      parameters: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "searchStockItems",
      description: "Search the product/service catalogue by name or part code.",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    },
  },
  {
    type: "function",
    function: {
      name: "searchPurchaseOrders",
      description: "Search or list purchase orders. Filter by PO number, vendor name, and/or status. For 'show confirmed POs' / 'all confirmed' / 'latest confirmed PO', pass status=confirmed and omit query (or leave query empty). Do NOT put the word confirmed/draft/sent into query — use the status parameter.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Optional PO number or vendor name. Omit when listing by status only." },
          status: {
            type: "string",
            enum: ["draft", "confirmed", "sent", "cancelled"],
            description: "Optional status filter. Use for requests like 'confirmed POs' or 'draft purchase orders'.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getPurchaseOrder",
      description: "Get full details of a specific purchase order. Use after searchPurchaseOrders.",
      parameters: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "searchInvoices",
      description: "Search or list invoices by invoice number, customer name, and/or status. For 'show confirmed/paid invoices' use the status parameter — do not put status words in query.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Optional invoice number or customer name" },
          status: {
            type: "string",
            enum: ["draft", "confirmed", "sent", "paid", "partial", "void", "cancelled"],
            description: "Optional status filter",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getInvoice",
      description: "Get full details of a specific invoice including all line items, pricing, and status.",
      parameters: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "searchDeliveryOrders",
      description: "Search or list delivery orders by DO number, customer name, and/or status. For 'show confirmed DOs' use status=confirmed and omit query.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Optional DO number or customer name. Omit when listing by status only." },
          status: {
            type: "string",
            enum: ["draft", "confirmed", "sent", "cancelled"],
            description: "Optional status filter",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getDeliveryOrder",
      description: "Get full details of a specific delivery order.",
      parameters: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "searchVendorInvoices",
      description: "Search vendor/supplier invoices (AP) by PI number or vendor name (partial ok).",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    },
  },
  {
    type: "function",
    function: {
      name: "searchGRN",
      description: "Search Goods Received Notes by GRN number, PO number, or vendor name.",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    },
  },
  {
    type: "function",
    function: {
      name: "getCompanySettings",
      description: "Get the current company GST/tax rate.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "getFinancialStats",
      description: "Get financial analytics for a period: invoice totals, paid/pending amounts, PO count, top customers by revenue. Always call this immediately when user asks about stats, revenue, figures, or performance.",
      parameters: {
        type: "object",
        properties: {
          period: {
            type: "string",
            enum: ["this-week", "this-month", "last-month", "this-quarter", "last-quarter", "this-year", "all-time"],
          },
        },
        required: ["period"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fillCurrentForm",
      description: "Update specific fields on the form currently open (document, employee, customer, or vendor). Use when the user asks to change/set fields, or during guided create after each answer. Do NOT use navigateTo — instantly patches the visible form.",
      parameters: {
        type: "object",
        properties: {
          fields: {
            type: "object",
            description: "Fields to update. Document keys: customerName, customerAddress, customerContact, customerContactEmail, paymentTerms, deliveryDate (YYYY-MM-DD), currency, notes, shipToAddress, tax, poRefNo, discountAmount; PO: vendorName, vendorAddress, vendorContact, vendorContactEmail, deliveryAddress. Employee keys: name, email, phone, address, department, designation, joinDate (YYYY-MM-DD), dateOfBirth, status (active/resigned/on_hold/terminated), salary, annualSalary, nationality (Singapore/PR/Foreigner), prStatus, passportNumber, passportExpiry, visaNumber, visaExpiry, visaType, nricNumber, nricExpiry, employeeId. Customer/vendor keys: name, address, postalCode, country, contactPerson, contactEmail, phone, currency, gstRegistered, gstNo, shipToAddress, quotationTerms, isActive.",
            additionalProperties: true,
          },
          summary: { type: "string", description: "One-line summary of what changed, e.g. 'Set employee name to Priya'" },
        },
        required: ["fields", "summary"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "submitCurrentForm",
      description: "Save/submit the form currently open (invoice/quotation/PO/DO/employee, or customer/vendor dialog). Use when the user asks to save or submit. Call fillCurrentForm first if fields still need changing. Clicks Save on the open form.",
      parameters: {
        type: "object",
        properties: {
          summary: { type: "string", description: "One-line summary, e.g. 'Saving employee Priya'" },
        },
        required: ["summary"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "previewCurrentDocument",
      description: "Open the PDF preview for the invoice/document currently on screen (edit, new, or view page). On edit/new forms this saves first then opens preview. Use when the user asks to preview, show PDF, or open preview.",
      parameters: {
        type: "object",
        properties: {
          summary: { type: "string", description: "One-line summary, e.g. 'Opening invoice PDF preview'" },
        },
        required: ["summary"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "downloadCurrentDocument",
      description: "Download the PDF for the invoice/document currently on screen. On a view page this downloads immediately. On edit/new it saves then opens the preview so the user can download. Use when the user asks to download, export PDF, or get the PDF file.",
      parameters: {
        type: "object",
        properties: {
          summary: { type: "string", description: "One-line summary, e.g. 'Downloading invoice PDF'" },
        },
        required: ["summary"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "updateDocumentFields",
      description: "Update and SAVE header fields on an existing document in the database (invoice, quotation, purchase order, or delivery order). Use when the user asks to change vendor/customer name (or other header fields) and save — especially from a list or view page. Do NOT refuse just because searchVendors/searchCustomers returned no directory match — free-text party names on documents are allowed. After success, navigateTo the document view path, then downloadCurrentDocument or previewCurrentDocument if the user asked.",
      parameters: {
        type: "object",
        properties: {
          docType: { type: "string", enum: ["inv", "qt", "po", "do"], description: "Document type" },
          id: { type: "integer", description: "Document database ID" },
          fields: {
            type: "object",
            description: "Fields to update. Allowed keys depend on doc type. PO: vendorName, vendorAddress, vendorContact, vendorContactEmail, paymentTerms, deliveryDate, currency, notes, deliveryAddress, quoteRefNo. Invoice/QT/DO: customerName, customerAddress, customerContact, customerContactEmail, paymentTerms, deliveryDate, currency, notes.",
            additionalProperties: true,
          },
          summary: { type: "string", description: "One-line summary of the change" },
        },
        required: ["docType", "id", "fields", "summary"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "navigateTo",
      description: "Navigate the application to any page, module, document, or form. Use for 'open', 'show', 'go to', 'edit', 'preview', or 'take me to'. Also use to open edit forms for specific documents.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "App route. Pages: /dashboard, /settings, /customers, /customers?vedaNew=1, /vendors, /vendors?vedaNew=1, /employees, /employees/new, /employees/:id/edit, /stock, /grn, /vendor-invoices, /accounting, /expenses. Document lists: /invoices, /quotations, /purchase-orders, /delivery-orders. New forms: /invoices/new, /quotations/new, /purchase-orders/new, /delivery-orders/new. View/edit: /invoices/:id, /invoices/:id/edit, etc. Admin: /admin/users.",
          },
          prefill: {
            type: "object",
            description: "Form pre-fill for /new pages. Documents: { customerName, ... }. Employees: { name, email, phone, department, designation, ... }.",
          },
          reason: { type: "string", description: "Brief description, e.g. 'Opening new employee form for Priya'" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "openDirectoryForm",
      description: "Open the New/Edit Customer or Vendor dialog. Prefer navigateTo /customers?vedaNew=1 or /vendors?vedaNew=1 first. For employees use navigateTo /employees/new.",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["customer", "vendor"] },
          mode: { type: "string", enum: ["new", "edit"] },
          id: { type: "integer", description: "Required when mode=edit" },
          reason: { type: "string" },
        },
        required: ["type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "searchEmployees",
      description: "Search employees by name, employee ID, email, or department.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Name, EMP code, email, or department — pass FULL name as spoken" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "createEmployee",
      description: "Create an employee via API (fast path). Prefer guided form on /employees/new with fillCurrentForm + submitCurrentForm when collecting fields with the user.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          email: { type: "string" },
          phone: { type: "string" },
          address: { type: "string" },
          department: { type: "string" },
          designation: { type: "string" },
          joinDate: { type: "string", description: "YYYY-MM-DD" },
          dateOfBirth: { type: "string" },
          status: { type: "string", enum: ["active", "resigned", "on_hold", "terminated"] },
          salary: { type: "string" },
          annualSalary: { type: "string" },
          nationality: { type: "string", enum: ["Singapore", "PR", "Foreigner"] },
          prStatus: { type: "string" },
          employeeId: { type: "string" },
          passportNumber: { type: "string" },
          visaNumber: { type: "string" },
          nricNumber: { type: "string" },
          visaType: { type: "string" },
        },
        required: ["name", "email", "phone", "address", "department", "designation", "salary", "nationality"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "updateEmployee",
      description: "Update an existing employee by database id. Prefer /employees/:id/edit + fillCurrentForm + submitCurrentForm for guided edits.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "integer" },
          fields: { type: "object", additionalProperties: true },
          summary: { type: "string" },
        },
        required: ["id", "fields"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "createCustomer",
      description: "Create a customer via API. Prefer guided dialog: navigateTo /customers?vedaNew=1 → fillCurrentForm → submitCurrentForm.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          address: { type: "string" },
          postalCode: { type: "string" },
          country: { type: "string" },
          contactPerson: { type: "string" },
          contactEmail: { type: "string" },
          phone: { type: "string" },
          currency: { type: "string" },
          gstRegistered: { type: "boolean" },
          gstNo: { type: "string" },
          shipToAddress: { type: "string" },
          quotationTerms: { type: "string" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "updateCustomer",
      description: "Update an existing customer by id.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "integer" },
          fields: { type: "object", additionalProperties: true },
          summary: { type: "string" },
        },
        required: ["id", "fields"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "createVendor",
      description: "Create a vendor via API. Prefer guided dialog on /vendors?vedaNew=1 when collecting fields with the user.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          address: { type: "string" },
          postalCode: { type: "string" },
          country: { type: "string" },
          contactPerson: { type: "string" },
          contactEmail: { type: "string" },
          phone: { type: "string" },
          currency: { type: "string" },
          gstRegistered: { type: "boolean" },
          gstNo: { type: "string" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "updateVendor",
      description: "Update an existing vendor by id.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "integer" },
          fields: { type: "object", additionalProperties: true },
          summary: { type: "string" },
        },
        required: ["id", "fields"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "createInvoice",
      description: "Create a new invoice draft via API. Fast path — use when user confirms. Prefer navigateTo for complex invoices with serials.",
      parameters: {
        type: "object",
        properties: {
          customerName: { type: "string" },
          customerAddress: { type: "string" },
          customerContact: { type: "string" },
          customerContactEmail: { type: "string" },
          currency: { type: "string", enum: ["SGD", "USD", "EUR", "GBP", "MYR", "INR"] },
          paymentTerms: { type: "string" },
          deliveryDate: { type: "string" },
          issueDate: { type: "string" },
          notes: { type: "string" },
          discountAmount: { type: "number" },
          gstRate: { type: "number" },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                description: { type: "string" },
                partNumber: { type: "string", description: "Item / Part Number (stock code). Always include when known." },
                qty: { type: "number" },
                unitPrice: { type: "number" },
                amount: { type: "number" },
              },
              required: ["description", "qty", "unitPrice", "amount"],
            },
          },
          fromQuotationId: { type: "integer" },
        },
        required: ["customerName", "items", "currency"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "confirmDocument",
      description: "Confirm a document — changes its status from draft to confirmed. Works for invoices (inv), quotations (qt), purchase orders (po), and delivery orders (do). Always confirm with the user before calling.",
      parameters: {
        type: "object",
        properties: {
          docType: { type: "string", enum: ["inv", "qt", "po", "do"], description: "Document type" },
          id: { type: "integer", description: "Document ID (from a prior search)" },
          docNumber: { type: "string", description: "Document number for confirmation message, e.g. INV-0042" },
        },
        required: ["docType", "id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "voidInvoice",
      description: "Void an invoice with a reason. The invoice must be in draft or confirmed status. Always confirm the reason with the user before calling.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "integer" },
          invNumber: { type: "string", description: "Invoice number for confirmation message" },
          reason: { type: "string", description: "Reason for voiding" },
        },
        required: ["id", "reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "knockOffInvoice",
      description: "Mark an invoice as paid (knock-off / collect payment). Only call after the user confirms payment has been received.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "integer" },
          invNumber: { type: "string", description: "Invoice number for confirmation message" },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "createPurchaseOrder",
      description: "Create a new purchase order draft via API. Fast path — use when user confirms. Ask for vendor name and items before creating.",
      parameters: {
        type: "object",
        properties: {
          vendorName: { type: "string" },
          vendorAddress: { type: "string" },
          vendorContact: { type: "string" },
          vendorContactEmail: { type: "string" },
          currency: { type: "string", enum: ["SGD", "USD", "EUR", "GBP", "MYR", "INR"] },
          paymentTerms: { type: "string" },
          deliveryDate: { type: "string" },
          deliveryAddress: { type: "string" },
          issueDate: { type: "string" },
          notes: { type: "string" },
          discountAmount: { type: "number" },
          gstRate: { type: "number" },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                description: { type: "string" },
                partNumber: { type: "string" },
                qty: { type: "number" },
                unitPrice: { type: "number" },
                amount: { type: "number" },
              },
              required: ["description", "qty", "unitPrice", "amount"],
            },
          },
        },
        required: ["vendorName", "items", "currency"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "createDeliveryOrder",
      description: "Create a new delivery order draft via API. Items have description and qty only — no pricing on DOs.",
      parameters: {
        type: "object",
        properties: {
          customerName: { type: "string" },
          customerAddress: { type: "string" },
          customerContact: { type: "string" },
          customerContactEmail: { type: "string" },
          currency: { type: "string", enum: ["SGD", "USD", "EUR", "GBP", "MYR", "INR"] },
          deliveryDate: { type: "string" },
          issueDate: { type: "string" },
          notes: { type: "string" },
          invNumber: { type: "string", description: "Linked invoice number if this DO is for an invoice" },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                description: { type: "string" },
                partNumber: { type: "string" },
                qty: { type: "number" },
              },
              required: ["description", "qty"],
            },
          },
        },
        required: ["customerName", "items"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "sendDocumentEmail",
      description: "Email a document PDF (invoice, quotation, PO, or DO) to one or more addresses. This triggers a real browser-side PDF generate + SMTP send, then marks the document as sent. Recipients are required. After calling, tell the user you are sending the email now and they should see Sent / Sent To update shortly. Do NOT claim delivery succeeded unless the tool result includes triggered:true — and even then say you have started sending, not that the inbox already received it.",
      parameters: {
        type: "object",
        properties: {
          docType: { type: "string", enum: ["inv", "qt", "po", "do"], description: "Document type" },
          id: { type: "integer", description: "Document ID" },
          docNumber: { type: "string", description: "Document number e.g. PO26 or INV-0042" },
          recipients: { type: "array", items: { type: "string" }, description: "Email addresses to send to" },
        },
        required: ["docType", "id", "recipients"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "createQuotation",
      description: "Create a new quotation draft via API. Fast path — use when user confirms.",
      parameters: {
        type: "object",
        properties: {
          customerName: { type: "string" },
          customerAddress: { type: "string" },
          customerContact: { type: "string" },
          customerContactEmail: { type: "string" },
          currency: { type: "string", enum: ["SGD", "USD", "EUR", "GBP", "MYR", "INR"] },
          paymentTerms: { type: "string" },
          deliveryDate: { type: "string" },
          issueDate: { type: "string" },
          notes: { type: "string" },
          discountAmount: { type: "number" },
          gstRate: { type: "number" },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                description: { type: "string" },
                partNumber: { type: "string" },
                qty: { type: "number" },
                unitPrice: { type: "number" },
                amount: { type: "number" },
              },
              required: ["description", "qty", "unitPrice", "amount"],
            },
          },
        },
        required: ["customerName", "items", "currency"],
      },
    },
  },
] as const;

function queryTokens(raw: string): string[] {
  const full = raw.trim();
  const words = full.replace(/[^a-zA-Z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  return [...new Set([full, ...words])].filter(s => s.length > 0);
}

function tokenOr(col: any, raw: string): SQL {
  const tokens = queryTokens(raw);
  const conds = tokens.map(t => ilike(col, `%${t}%`));
  return conds.length === 1 ? conds[0] : or(...conds) as SQL;
}

function periodStartDate(period: string): Date {
  const now = new Date();
  switch (period) {
    case "this-week": { const d = new Date(now); d.setDate(now.getDate() - now.getDay()); d.setHours(0,0,0,0); return d; }
    case "this-month": return new Date(now.getFullYear(), now.getMonth(), 1);
    case "last-month": return new Date(now.getFullYear(), now.getMonth() - 1, 1);
    case "this-quarter": { const q = Math.floor(now.getMonth() / 3); return new Date(now.getFullYear(), q * 3, 1); }
    case "last-quarter": { const q = Math.floor(now.getMonth() / 3) - 1; const y = q < 0 ? now.getFullYear() - 1 : now.getFullYear(); return new Date(y, ((q + 4) % 4) * 3, 1); }
    case "this-year": return new Date(now.getFullYear(), 0, 1);
    default: return new Date(0);
  }
}

async function executeTool(
  name: string,
  args: any,
  companyId: number,
  userId: number,
  auth: AgentAuthContext,
  currentPath?: string,
): Promise<any> {
  const denied = authorizeTool(auth, name, args || {}, currentPath);
  if (denied) return denied;

  switch (name) {

    case "searchCustomers": {
      const rows = await db.select({
        id: customersTable.id, name: customersTable.name, address: customersTable.address,
        contactPerson: customersTable.contactPerson, contactEmail: customersTable.contactEmail,
        country: customersTable.country, gstRegistered: customersTable.gstRegistered, isActive: customersTable.isActive,
      }).from(customersTable).where(and(
        eq(customersTable.companyId, companyId),
        tokenOr(customersTable.name, args.query),
      )).limit(8);
      return rows.length > 0 ? rows : { message: "No customers found matching that name. You may still set customerName on the open form with fillCurrentForm." };
    }

    case "searchVendors": {
      const rows = await db.select({
        id: vendorsTable.id, name: vendorsTable.name, address: vendorsTable.address,
        contactPerson: vendorsTable.contactPerson, contactEmail: vendorsTable.contactEmail,
        country: vendorsTable.country, gstRegistered: vendorsTable.gstRegistered, gstNo: vendorsTable.gstNo,
        phone: vendorsTable.phone, currency: vendorsTable.currency, isActive: vendorsTable.isActive,
      }).from(vendorsTable).where(and(
        eq(vendorsTable.companyId, companyId),
        tokenOr(vendorsTable.name, args.query),
      )).limit(8);
      // Also accept names that only appear on documents (free-text party names).
      if (rows.length === 0) {
        const fromPos = await db.select({
          vendorName: purchaseOrdersTable.vendorName,
        }).from(purchaseOrdersTable).where(and(
          eq(purchaseOrdersTable.companyId, companyId),
          tokenOr(purchaseOrdersTable.vendorName, args.query),
        )).orderBy(desc(purchaseOrdersTable.createdAt)).limit(5);
        if (fromPos.length > 0) {
          const names = [...new Set(fromPos.map(r => r.vendorName).filter(Boolean))];
          return {
            message: "No active vendor directory match, but this name appears on purchase orders.",
            knownNames: names,
            hint: "You can still set vendorName with fillCurrentForm or updateDocumentFields using this exact name.",
          };
        }
      }
      return rows.length > 0 ? rows : { message: "No vendors found matching that name. You may still set vendorName on the document with fillCurrentForm or updateDocumentFields." };
    }

    case "searchDeliveryOrders": {
      const query = String(args.query || "").trim();
      const status = String(args.status || "").trim();
      const conditions: SQL[] = [eq(deliveryOrdersTable.companyId, companyId)];
      if (status) conditions.push(eq(deliveryOrdersTable.status, status));
      if (query) {
        conditions.push(
          or(tokenOr(deliveryOrdersTable.doNumber, query), tokenOr(deliveryOrdersTable.customerName, query)) as SQL,
        );
      }
      if (!query && !status) {
        return { error: "Provide a DO number/customer query and/or a status filter (draft, confirmed, sent, cancelled)." };
      }
      const rows = await db.select({
        id: deliveryOrdersTable.id, doNumber: deliveryOrdersTable.doNumber,
        customerName: deliveryOrdersTable.customerName, status: deliveryOrdersTable.status,
        deliveryDate: deliveryOrdersTable.deliveryDate, createdAt: deliveryOrdersTable.createdAt,
        invNumber: deliveryOrdersTable.invNumber,
      }).from(deliveryOrdersTable)
        .where(and(...conditions))
        .orderBy(desc(deliveryOrdersTable.createdAt))
        .limit(status && !query ? 30 : 8);
      if (rows.length === 0) {
        return {
          message: status
            ? `No delivery orders found with status "${status}"${query ? ` matching "${query}"` : ""}.`
            : "No delivery orders found.",
          listPath: status ? `/delivery-orders?status=${encodeURIComponent(status)}` : "/delivery-orders",
        };
      }
      return {
        count: rows.length,
        deliveryOrders: rows,
        latestId: rows[0].id,
        listPath: status ? `/delivery-orders?status=${encodeURIComponent(status)}` : "/delivery-orders",
        hint: status
          ? `To show these in the table, navigateTo /delivery-orders?status=${status}. For the latest one only, navigateTo /delivery-orders/${rows[0].id}.`
          : undefined,
      };
    }

    case "getDeliveryOrder": {
      const [doc] = await db.select().from(deliveryOrdersTable)
        .where(and(eq(deliveryOrdersTable.companyId, companyId), eq(deliveryOrdersTable.id, args.id)));
      return doc ?? { error: "Delivery order not found" };
    }

    case "searchVendorInvoices": {
      const rows = await db.select({
        id: vendorInvoicesTable.id, piNumber: vendorInvoicesTable.piNumber,
        vendorName: vendorInvoicesTable.vendorName, status: vendorInvoicesTable.status,
        poNumbers: vendorInvoicesTable.poNumbers, currency: vendorInvoicesTable.currency,
        createdAt: vendorInvoicesTable.createdAt,
      }).from(vendorInvoicesTable).where(and(
        eq(vendorInvoicesTable.companyId, companyId),
        or(tokenOr(vendorInvoicesTable.piNumber, args.query), tokenOr(vendorInvoicesTable.vendorName, args.query)),
      )).orderBy(desc(vendorInvoicesTable.createdAt)).limit(8);
      return rows.length > 0 ? rows : { message: "No vendor invoices found." };
    }

    case "searchGRN": {
      const rows = await db.select({
        id: grnTable.id, grnNumber: grnTable.grnNumber,
        poNumber: grnTable.poNumber, vendorName: grnTable.vendorName,
        status: grnTable.status, createdAt: grnTable.createdAt,
      }).from(grnTable).where(and(
        eq(grnTable.companyId, companyId),
        or(
          tokenOr(grnTable.grnNumber, args.query),
          tokenOr(grnTable.poNumber, args.query),
          tokenOr(grnTable.vendorName, args.query),
        ),
      )).orderBy(desc(grnTable.createdAt)).limit(8);
      return rows.length > 0 ? rows : { message: "No GRN records found." };
    }

    case "searchQuotations": {
      const query = String(args.query || "").trim();
      const status = String(args.status || "").trim();
      const conditions: SQL[] = [eq(quotationsTable.companyId, companyId)];
      if (status) conditions.push(eq(quotationsTable.status, status));
      if (query) {
        conditions.push(
          or(tokenOr(quotationsTable.qtNumber, query), tokenOr(quotationsTable.customerName, query)) as SQL,
        );
      }
      if (!query && !status) {
        return { error: "Provide a QT number/customer query and/or a status filter." };
      }
      const rows = await db.select({
        id: quotationsTable.id, qtNumber: quotationsTable.qtNumber,
        customerName: quotationsTable.customerName, status: quotationsTable.status,
        totalAmount: quotationsTable.totalAmount, currency: quotationsTable.currency,
        createdAt: quotationsTable.createdAt, subtotal: quotationsTable.subtotal,
        discountAmount: quotationsTable.discountAmount, tax: quotationsTable.tax,
        paymentTerms: quotationsTable.paymentTerms,
      }).from(quotationsTable)
        .where(and(...conditions))
        .orderBy(desc(quotationsTable.createdAt))
        .limit(status && !query ? 30 : 8);
      if (rows.length === 0) {
        return {
          message: status
            ? `No quotations found with status "${status}"${query ? ` matching "${query}"` : ""}.`
            : "No quotations found matching that search.",
          listPath: status ? `/quotations?status=${encodeURIComponent(status)}` : "/quotations",
        };
      }
      return {
        count: rows.length,
        quotations: rows,
        latestId: rows[0].id,
        listPath: status ? `/quotations?status=${encodeURIComponent(status)}` : "/quotations",
        hint: status
          ? `To show these in the table, navigateTo /quotations?status=${status}. For the latest one only, navigateTo /quotations/${rows[0].id}.`
          : undefined,
      };
    }

    case "getQuotation": {
      const [qt] = await db.select().from(quotationsTable)
        .where(and(eq(quotationsTable.companyId, companyId), eq(quotationsTable.id, args.id)));
      return qt ?? { error: "Quotation not found" };
    }

    case "searchStockItems": {
      const rows = await db.select({
        id: stockItemsTable.id, code: stockItemsTable.code, name: stockItemsTable.name,
        description: stockItemsTable.description, unitPrice: stockItemsTable.unitPrice,
        uom: stockItemsTable.uom, type: stockItemsTable.type, stockQty: stockItemsTable.stockQty,
      }).from(stockItemsTable).where(and(
        eq(stockItemsTable.companyId, companyId),
        eq(stockItemsTable.isActive, true),
        or(tokenOr(stockItemsTable.name, args.query), tokenOr(stockItemsTable.code, args.query)),
      )).limit(10);
      return rows.length > 0 ? rows : { message: "No stock items found matching that search." };
    }

    case "searchPurchaseOrders": {
      const query = String(args.query || "").trim();
      const status = String(args.status || "").trim();
      const conditions: SQL[] = [eq(purchaseOrdersTable.companyId, companyId)];
      if (status) conditions.push(eq(purchaseOrdersTable.status, status));
      if (query) {
        conditions.push(
          or(tokenOr(purchaseOrdersTable.poNumber, query), tokenOr(purchaseOrdersTable.vendorName, query)) as SQL,
        );
      }
      if (!query && !status) {
        return { error: "Provide a PO number/vendor query and/or a status filter (draft, confirmed, sent, cancelled)." };
      }
      const rows = await db.select({
        id: purchaseOrdersTable.id, poNumber: purchaseOrdersTable.poNumber,
        vendorName: purchaseOrdersTable.vendorName, status: purchaseOrdersTable.status,
        totalAmount: purchaseOrdersTable.totalAmount, currency: purchaseOrdersTable.currency,
        createdAt: purchaseOrdersTable.createdAt,
      }).from(purchaseOrdersTable)
        .where(and(...conditions))
        .orderBy(desc(purchaseOrdersTable.createdAt))
        .limit(status && !query ? 30 : 8);
      if (rows.length === 0) {
        return {
          message: status
            ? `No purchase orders found with status "${status}"${query ? ` matching "${query}"` : ""}.`
            : "No purchase orders found.",
          listPath: status ? `/purchase-orders?status=${encodeURIComponent(status)}` : "/purchase-orders",
        };
      }
      return {
        count: rows.length,
        purchaseOrders: rows,
        latestId: rows[0].id,
        listPath: status ? `/purchase-orders?status=${encodeURIComponent(status)}` : "/purchase-orders",
        hint: status
          ? `To show these in the table, navigateTo ${status ? `/purchase-orders?status=${status}` : "/purchase-orders"}. For the latest one only, navigateTo /purchase-orders/${rows[0].id}.`
          : undefined,
      };
    }

    case "getPurchaseOrder": {
      const [po] = await db.select().from(purchaseOrdersTable)
        .where(and(eq(purchaseOrdersTable.companyId, companyId), eq(purchaseOrdersTable.id, args.id)));
      return po ?? { error: "Purchase order not found" };
    }

    case "searchInvoices": {
      const query = String(args.query || "").trim();
      const status = String(args.status || "").trim();
      const conditions: SQL[] = [eq(invoicesTable.companyId, companyId)];
      if (status) conditions.push(eq(invoicesTable.status, status));
      if (query) {
        conditions.push(
          or(tokenOr(invoicesTable.invNumber, query), tokenOr(invoicesTable.customerName, query)) as SQL,
        );
      }
      if (!query && !status) {
        return { error: "Provide an invoice/customer query and/or a status filter." };
      }
      const rows = await db.select({
        id: invoicesTable.id, invNumber: invoicesTable.invNumber,
        customerName: invoicesTable.customerName, status: invoicesTable.status,
        totalAmount: invoicesTable.totalAmount, currency: invoicesTable.currency,
        createdAt: invoicesTable.createdAt,
      }).from(invoicesTable)
        .where(and(...conditions))
        .orderBy(desc(invoicesTable.createdAt))
        .limit(status && !query ? 30 : 8);
      if (rows.length === 0) {
        return {
          message: status
            ? `No invoices found with status "${status}"${query ? ` matching "${query}"` : ""}.`
            : "No invoices found matching that search.",
          listPath: status ? `/invoices?status=${encodeURIComponent(status)}` : "/invoices",
        };
      }
      return {
        count: rows.length,
        invoices: rows,
        latestId: rows[0].id,
        listPath: status ? `/invoices?status=${encodeURIComponent(status)}` : "/invoices",
        hint: status
          ? `To show these in the table, navigateTo /invoices?status=${status}. For the latest one only, navigateTo /invoices/${rows[0].id}.`
          : undefined,
      };
    }

    case "getInvoice": {
      const [inv] = await db.select().from(invoicesTable)
        .where(and(eq(invoicesTable.companyId, companyId), eq(invoicesTable.id, args.id)));
      return inv ?? { error: "Invoice not found" };
    }

    case "getCompanySettings": {
      const [s] = await db.select({ gstRate: settingsTable.gstRate })
        .from(settingsTable).where(eq(settingsTable.companyId, companyId));
      return { gstRate: parseFloat(s?.gstRate ?? "9") };
    }

    case "getFinancialStats": {
      const start = periodStartDate(args.period || "this-month");
      const [invs, pos, qts] = await Promise.all([
        db.select().from(invoicesTable).where(and(eq(invoicesTable.companyId, companyId), gte(invoicesTable.createdAt, start))),
        db.select().from(purchaseOrdersTable).where(and(eq(purchaseOrdersTable.companyId, companyId), gte(purchaseOrdersTable.createdAt, start))),
        db.select().from(quotationsTable).where(and(eq(quotationsTable.companyId, companyId), gte(quotationsTable.createdAt, start))),
      ]);

      const nonVoid = invs.filter(i => i.status !== "void");
      const totalInvValue = nonVoid.reduce((s, i) => s + parseFloat(i.totalAmount), 0);
      const paidValue = invs.filter(i => i.status === "paid").reduce((s, i) => s + parseFloat(i.totalAmount), 0);
      const pendingValue = invs.filter(i => i.status === "confirmed").reduce((s, i) => s + parseFloat(i.totalAmount), 0);

      const custMap: Record<string, number> = {};
      for (const inv of nonVoid) {
        custMap[inv.customerName] = (custMap[inv.customerName] || 0) + parseFloat(inv.totalAmount);
      }
      const topCustomers = Object.entries(custMap).sort((a, b) => b[1] - a[1]).slice(0, 5)
        .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }));

      return {
        period: args.period,
        invoices: {
          total: invs.length, totalValue: Math.round(totalInvValue * 100) / 100,
          paid: invs.filter(i => i.status === "paid").length,
          confirmed: invs.filter(i => i.status === "confirmed").length,
          draft: invs.filter(i => i.status === "draft").length,
          void: invs.filter(i => i.status === "void").length,
          paidValue: Math.round(paidValue * 100) / 100,
          pendingValue: Math.round(pendingValue * 100) / 100,
        },
        purchaseOrders: {
          total: pos.length,
          totalValue: Math.round(pos.reduce((s, p) => s + parseFloat(p.totalAmount), 0) * 100) / 100,
          confirmed: pos.filter(p => p.status === "confirmed").length,
          draft: pos.filter(p => p.status === "draft").length,
        },
        quotations: {
          total: qts.length,
          confirmed: qts.filter(q => q.status === "confirmed").length,
          draft: qts.filter(q => q.status === "draft").length,
        },
        topCustomers,
      };
    }

    case "fillCurrentForm": {
      return { _fillForm: true, fields: args.fields, summary: args.summary };
    }

    case "submitCurrentForm": {
      return { _formAction: true, action: "save", summary: args.summary };
    }

    case "previewCurrentDocument": {
      return { _formAction: true, action: "preview", summary: args.summary };
    }

    case "downloadCurrentDocument": {
      return { _formAction: true, action: "download", summary: args.summary };
    }

    case "updateDocumentFields": {
      const { docType, id } = args;
      let fields = args.fields;
      if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
        return { error: "fields must be an object of values to update." };
      }

      // Normalize common aliases the model may send instead of schema keys.
      const ALIASES: Record<string, string> = {
        vendor: "vendorName",
        vendor_name: "vendorName",
        supplier: "vendorName",
        supplierName: "vendorName",
        supplier_name: "vendorName",
        customer: "customerName",
        customer_name: "customerName",
        buyer: "customerName",
        address: docType === "po" ? "vendorAddress" : "customerAddress",
        vendor_address: "vendorAddress",
        customer_address: "customerAddress",
        contact: docType === "po" ? "vendorContact" : "customerContact",
        email: docType === "po" ? "vendorContactEmail" : "customerContactEmail",
        payment_terms: "paymentTerms",
        delivery_date: "deliveryDate",
        delivery_address: "deliveryAddress",
        shipToAddress: "deliveryAddress",
        quote_ref: "quoteRefNo",
        po_ref: "poRefNo",
      };
      const normalized: Record<string, any> = {};
      for (const [key, value] of Object.entries(fields as Record<string, any>)) {
        const mapped = ALIASES[key] || key;
        normalized[mapped] = value;
      }
      fields = normalized;

      const tableMap: Record<string, any> = {
        inv: invoicesTable, qt: quotationsTable, po: purchaseOrdersTable, do: deliveryOrdersTable,
      };
      const pathMap: Record<string, string> = {
        inv: "invoices", qt: "quotations", po: "purchase-orders", do: "delivery-orders",
      };
      const allowedByType: Record<string, string[]> = {
        inv: ["customerName", "customerAddress", "customerContact", "customerContactEmail", "paymentTerms", "deliveryDate", "currency", "notes", "poRefNo", "deliveryAddress", "items", "tax", "discountAmount"],
        qt: ["customerName", "customerAddress", "customerContact", "customerContactEmail", "paymentTerms", "deliveryDate", "currency", "notes", "deliveryAddress", "items", "tax", "discountAmount"],
        po: ["vendorName", "vendorAddress", "vendorContact", "vendorContactEmail", "paymentTerms", "deliveryDate", "currency", "notes", "deliveryAddress", "quoteRefNo", "items", "tax"],
        do: ["customerName", "customerAddress", "customerContact", "customerContactEmail", "deliveryDate", "notes", "deliveryAddress", "items"],
      };
      const tbl = tableMap[docType];
      if (!tbl) return { error: `Unknown docType: ${docType}` };
      const allowed = new Set(allowedByType[docType] || []);
      const patch: Record<string, any> = {};
      for (const [key, value] of Object.entries(fields)) {
        if (!allowed.has(key)) continue;
        if (value === undefined) continue;
        patch[key] = typeof value === "string" ? value.trim() : value;
      }
      if (Object.keys(patch).length === 0) {
        return {
          error: "No allowed fields to update. Use vendorName for POs, customerName for invoices/quotations/DOs. Line totals require an items array with qty/unitPrice.",
          allowedFields: allowedByType[docType],
        };
      }

      const [existing] = await db.select().from(tbl).where(and(eq(tbl.id, id), eq(tbl.companyId, companyId)));
      if (!existing) return { error: "Document not found or does not belong to this company." };

      // Recalculate money fields when line items are provided.
      if (Array.isArray(patch.items)) {
        const itemsWithAmount = patch.items.map((item: any) => {
          if (item?.type === "section") return item;
          const qty = Number(item.qty) || 0;
          const unitPrice = Number(item.unitPrice) || 0;
          const discount = Number(item.discount) || 0;
          const amount = docType === "po" || docType === "do"
            ? qty * unitPrice
            : qty * unitPrice * (1 - discount / 100);
          return { ...item, qty, unitPrice, amount: Number(amount.toFixed(2)) };
        });
        patch.items = itemsWithAmount;
        const subtotal = itemsWithAmount
          .filter((i: any) => i?.type !== "section")
          .reduce((s: number, i: any) => s + Number(i.amount || 0), 0);
        const discAmt = Number(patch.discountAmount ?? (existing as any).discountAmount ?? 0) || 0;
        const gstRate = Number(patch.tax ?? 0);
        // For PO, `tax` in forms is a percent; stored tax column is amount.
        if (docType === "po") {
          const taxPct = Number.isFinite(gstRate) && gstRate > 0
            ? gstRate
            : (Number((existing as any).subtotal) > 0
              ? (Number((existing as any).tax) / Number((existing as any).subtotal)) * 100
              : 0);
          const taxAmount = (subtotal * taxPct) / 100;
          patch.subtotal = subtotal.toFixed(2);
          patch.tax = taxAmount.toFixed(2);
          patch.totalAmount = (subtotal + taxAmount).toFixed(2);
        } else if (docType === "inv" || docType === "qt") {
          // Prefer explicit percent in patch.tax when it looks like a rate (<= 100), else keep existing rate.
          const existingSub = Number((existing as any).subtotal) || 0;
          const existingTax = Number((existing as any).tax) || 0;
          const rate = gstRate > 0 && gstRate <= 100
            ? gstRate
            : (existingSub > 0 ? (existingTax / Math.max(existingSub - discAmt, 0.0001)) * 100 : 0);
          const taxAmount = (subtotal - discAmt) * (rate / 100);
          patch.subtotal = subtotal.toFixed(2);
          if (patch.discountAmount !== undefined) patch.discountAmount = Number(discAmt).toFixed(2);
          patch.tax = taxAmount.toFixed(2);
          patch.totalAmount = ((subtotal - discAmt) + taxAmount).toFixed(2);
        }
      }

      const [updated] = await db.update(tbl).set(patch)
        .where(and(eq(tbl.id, id), eq(tbl.companyId, companyId))).returning();
      if (!updated) return { error: "Update failed." };

      // Keep vendor directory in sync when PO vendor name changes.
      if (docType === "po" && typeof patch.vendorName === "string" && patch.vendorName) {
        try {
          const existingVendor = await db.select({ id: vendorsTable.id }).from(vendorsTable)
            .where(and(eq(vendorsTable.companyId, companyId), ilike(vendorsTable.name, patch.vendorName)))
            .limit(1);
          if (existingVendor.length === 0) {
            await db.insert(vendorsTable).values({
              companyId,
              name: patch.vendorName,
              address: patch.vendorAddress ?? (updated as any).vendorAddress ?? null,
              contactPerson: patch.vendorContact ?? (updated as any).vendorContact ?? null,
              contactEmail: patch.vendorContactEmail ?? (updated as any).vendorContactEmail ?? null,
              isActive: true,
            } as any);
          }
        } catch { /* non-fatal */ }
      }

      const path = `/${pathMap[docType]}/${id}`;
      const parsedDoc = {
        ...updated,
        subtotal: parseFloat((updated as any).subtotal ?? "0"),
        tax: parseFloat((updated as any).tax ?? "0"),
        totalAmount: parseFloat((updated as any).totalAmount ?? "0"),
        discountAmount: (updated as any).discountAmount != null
          ? parseFloat((updated as any).discountAmount)
          : undefined,
        createdAt: (updated as any).createdAt instanceof Date
          ? (updated as any).createdAt.toISOString()
          : (updated as any).createdAt,
      };
      return {
        success: true,
        summary: args.summary,
        updatedFields: Object.keys(patch),
        document: parsedDoc,
        _documentUpdated: true,
        docType,
        id,
        fields: patch,
        _navigate: true,
        path,
        prefill: null,
        reason: args.summary || "Opening updated document",
      };
    }

    case "navigateTo": {
      return { _navigate: true, path: args.path, prefill: args.prefill || null, reason: args.reason || "" };
    }

    case "openDirectoryForm": {
      return {
        _openDirectoryForm: true,
        type: args.type,
        mode: args.mode || "new",
        id: args.id ?? null,
        reason: args.reason || "",
      };
    }

    case "searchEmployees": {
      const q = `%${String(args.query || "").trim()}%`;
      const result = await pool.query(
        `SELECT id, employee_id, name, email, phone, department, designation, status, join_date, nationality, salary
         FROM employees
         WHERE company_id = $1
           AND (name ILIKE $2 OR email ILIKE $2 OR COALESCE(employee_id,'') ILIKE $2 OR COALESCE(department,'') ILIKE $2 OR COALESCE(phone,'') ILIKE $2)
         ORDER BY name
         LIMIT 10`,
        [companyId, q],
      );
      if (!result.rows.length) return { message: "No employees found matching that search." };
      return result.rows.map((r: any) => ({
        id: r.id,
        employeeId: r.employee_id,
        name: r.name,
        email: r.email,
        phone: r.phone,
        department: r.department,
        designation: r.designation,
        status: r.status,
        joinDate: r.join_date,
        nationality: r.nationality,
        salary: r.salary,
        editPath: `/employees/${r.id}/edit`,
      }));
    }

    case "createEmployee": {
      const body = { ...args };
      delete body.dependents;
      for (const k of Object.keys(body)) {
        if (body[k] === "") body[k] = null;
      }
      if (!body.employeeId) {
        const last = await pool.query(
          `SELECT employee_id FROM employees WHERE company_id = $1 ORDER BY id DESC LIMIT 1`,
          [companyId],
        );
        const prev = last.rows[0]?.employee_id as string | undefined;
        const match = prev?.match(/(\d+)$/);
        const next = match ? parseInt(match[1], 10) + 1 : 1;
        body.employeeId = `EMP-${String(next).padStart(4, "0")}`;
      }
      if (!body.joinDate) body.joinDate = new Date().toISOString();
      if (!body.status) body.status = "active";

      const colMap: Record<string, string> = {
        employeeId: "employee_id", name: "name", email: "email", phone: "phone", address: "address",
        department: "department", designation: "designation", joinDate: "join_date", status: "status",
        salary: "salary", annualSalary: "annual_salary", nationality: "nationality", prStatus: "pr_status",
        dateOfBirth: "date_of_birth", passportNumber: "passport_number", passportExpiry: "passport_expiry",
        visaNumber: "visa_number", visaExpiry: "visa_expiry", visaType: "visa_type", visaRemarks: "visa_remarks",
        nricNumber: "nric_number", nricExpiry: "nric_expiry",
      };
      const cols: string[] = ["company_id"];
      const vals: any[] = [companyId];
      const ph: string[] = ["$1"];
      let i = 2;
      for (const [camel, snake] of Object.entries(colMap)) {
        if (body[camel] === undefined || body[camel] === null) continue;
        cols.push(snake);
        vals.push(body[camel]);
        ph.push(`$${i++}`);
      }
      const result = await pool.query(
        `INSERT INTO employees (${cols.join(", ")}) VALUES (${ph.join(", ")}) RETURNING *`,
        vals,
      );
      const row = result.rows[0];
      return {
        success: true,
        employee: {
          id: row.id,
          employeeId: row.employee_id,
          name: row.name,
          email: row.email,
          department: row.department,
          designation: row.designation,
          status: row.status,
        },
        _navigate: true,
        path: `/employees/${row.id}/edit`,
        prefill: null,
        reason: `Created employee ${row.name}`,
      };
    }

    case "updateEmployee": {
      const id = Number(args.id);
      const fields = args.fields || {};
      if (!id || typeof fields !== "object") return { error: "id and fields are required" };
      const colMap: Record<string, string> = {
        employeeId: "employee_id", name: "name", email: "email", phone: "phone", address: "address",
        department: "department", designation: "designation", joinDate: "join_date", status: "status",
        salary: "salary", annualSalary: "annual_salary", nationality: "nationality", prStatus: "pr_status",
        dateOfBirth: "date_of_birth", passportNumber: "passport_number", passportExpiry: "passport_expiry",
        visaNumber: "visa_number", visaExpiry: "visa_expiry", visaType: "visa_type", visaRemarks: "visa_remarks",
        nricNumber: "nric_number", nricExpiry: "nric_expiry",
      };
      const sets: string[] = [];
      const vals: any[] = [];
      let i = 1;
      for (const [camel, snake] of Object.entries(colMap)) {
        if (fields[camel] === undefined) continue;
        sets.push(`${snake} = $${i++}`);
        vals.push(fields[camel] === "" ? null : fields[camel]);
      }
      if (!sets.length) return { error: "No valid fields to update" };
      vals.push(id, companyId);
      const result = await pool.query(
        `UPDATE employees SET ${sets.join(", ")} WHERE id = $${i++} AND company_id = $${i} RETURNING *`,
        vals,
      );
      if (!result.rows[0]) return { error: "Employee not found" };
      const row = result.rows[0];
      return {
        success: true,
        employee: { id: row.id, employeeId: row.employee_id, name: row.name },
        summary: args.summary || "Employee updated",
        _navigate: true,
        path: `/employees/${row.id}/edit`,
        prefill: null,
        reason: args.summary || `Updated employee ${row.name}`,
      };
    }

    case "createCustomer": {
      const [customer] = await db.insert(customersTable).values({
        companyId,
        name: args.name,
        address: args.address || null,
        postalCode: args.postalCode || null,
        country: args.country || "Singapore",
        contactPerson: args.contactPerson || null,
        contactEmail: args.contactEmail || null,
        phone: args.phone || null,
        currency: args.currency || null,
        gstRegistered: Boolean(args.gstRegistered),
        gstNo: args.gstRegistered && args.gstNo ? args.gstNo : null,
        shipToAddress: args.shipToAddress || null,
        quotationTerms: args.quotationTerms || null,
      }).returning();
      return {
        success: true,
        customer: { id: customer.id, name: customer.name },
        _navigate: true,
        path: "/customers",
        prefill: null,
        reason: `Created customer ${customer.name}`,
      };
    }

    case "updateCustomer": {
      const id = Number(args.id);
      const fields = args.fields || {};
      if (!id) return { error: "id is required" };
      const allowed = ["name", "address", "postalCode", "country", "contactPerson", "contactEmail", "phone", "currency", "gstRegistered", "gstNo", "shipToAddress", "quotationTerms", "isActive"] as const;
      const patch: Record<string, any> = {};
      for (const k of allowed) {
        if (fields[k] !== undefined) patch[k] = fields[k];
      }
      if (!Object.keys(patch).length) return { error: "No valid fields to update" };
      const [customer] = await db.update(customersTable)
        .set(patch)
        .where(and(eq(customersTable.id, id), eq(customersTable.companyId, companyId)))
        .returning();
      if (!customer) return { error: "Customer not found" };
      return { success: true, customer: { id: customer.id, name: customer.name }, summary: args.summary || "Customer updated" };
    }

    case "createVendor": {
      const [vendor] = await db.insert(vendorsTable).values({
        companyId,
        name: args.name,
        address: args.address || null,
        postalCode: args.postalCode || null,
        country: args.country || "Singapore",
        contactPerson: args.contactPerson || null,
        contactEmail: args.contactEmail || null,
        phone: args.phone || null,
        currency: args.currency || null,
        gstRegistered: Boolean(args.gstRegistered),
        gstNo: args.gstRegistered && args.gstNo ? args.gstNo : null,
      }).returning();
      return {
        success: true,
        vendor: { id: vendor.id, name: vendor.name },
        _navigate: true,
        path: "/vendors",
        prefill: null,
        reason: `Created vendor ${vendor.name}`,
      };
    }

    case "updateVendor": {
      const id = Number(args.id);
      const fields = args.fields || {};
      if (!id) return { error: "id is required" };
      const allowed = ["name", "address", "postalCode", "country", "contactPerson", "contactEmail", "phone", "currency", "gstRegistered", "gstNo", "isActive"] as const;
      const patch: Record<string, any> = {};
      for (const k of allowed) {
        if (fields[k] !== undefined) patch[k] = fields[k];
      }
      if (!Object.keys(patch).length) return { error: "No valid fields to update" };
      const [vendor] = await db.update(vendorsTable)
        .set(patch)
        .where(and(eq(vendorsTable.id, id), eq(vendorsTable.companyId, companyId)))
        .returning();
      if (!vendor) return { error: "Vendor not found" };
      return { success: true, vendor: { id: vendor.id, name: vendor.name }, summary: args.summary || "Vendor updated" };
    }

    case "createInvoice": {
      const { items, gstRate = 0, discountAmount = 0, fromQuotationId, issueDate, ...rest } = args;
      const subtotal = items.reduce((s: number, i: any) => s + Number(i.amount), 0);
      const discAmt = Number(discountAmount);
      const taxAmount = (subtotal - discAmt) * (Number(gstRate) / 100);
      const totalAmount = (subtotal - discAmt) + taxAmount;
      const today = new Date().toISOString().split("T")[0];
      const invNumber = await nextDocNumber("inv", companyId);
      const [inv] = await db.insert(invoicesTable).values({
        companyId, invNumber, status: "draft", createdBy: userId,
        items: items as any,
        subtotal: subtotal.toFixed(2), discountAmount: discAmt.toFixed(2),
        tax: taxAmount.toFixed(2), totalAmount: totalAmount.toFixed(2),
        issueDate: issueDate ?? today,
        ...(fromQuotationId ? { salesQuoteRefNo: String(fromQuotationId) } : {}),
        ...rest,
      }).returning();
      return { success: true, invoice: { id: inv.id, invNumber: inv.invNumber, customerName: inv.customerName, totalAmount: inv.totalAmount, currency: inv.currency, status: inv.status } };
    }

    case "createQuotation": {
      const { items, gstRate = 0, discountAmount = 0, issueDate, ...rest } = args;
      const subtotal = items.reduce((s: number, i: any) => s + Number(i.amount), 0);
      const discAmt = Number(discountAmount);
      const taxAmount = (subtotal - discAmt) * (Number(gstRate) / 100);
      const totalAmount = (subtotal - discAmt) + taxAmount;
      const today = new Date().toISOString().split("T")[0];
      const qtNumber = await nextDocNumber("qt", companyId);
      const [qt] = await db.insert(quotationsTable).values({
        companyId, qtNumber, status: "draft", createdBy: userId,
        items: items as any,
        subtotal: subtotal.toFixed(2), discountAmount: discAmt.toFixed(2),
        tax: taxAmount.toFixed(2), totalAmount: totalAmount.toFixed(2),
        issueDate: issueDate ?? today,
        ...rest,
      }).returning();
      return { success: true, quotation: { id: qt.id, qtNumber: qt.qtNumber, customerName: qt.customerName, totalAmount: qt.totalAmount, currency: qt.currency, status: qt.status } };
    }

    case "confirmDocument": {
      const { docType, id } = args;
      const tableMap: Record<string, any> = {
        inv: invoicesTable, qt: quotationsTable, po: purchaseOrdersTable, do: deliveryOrdersTable,
      };
      const tbl = tableMap[docType];
      if (!tbl) return { error: `Unknown docType: ${docType}` };
      const [existing] = await db.select({ id: tbl.id, status: tbl.status, companyId: tbl.companyId })
        .from(tbl).where(and(eq(tbl.id, id), eq(tbl.companyId, companyId)));
      if (!existing) return { error: "Document not found or does not belong to this company." };
      if (existing.status === "confirmed") return { alreadyConfirmed: true, message: "Already confirmed." };
      if (existing.status === "void" || existing.status === "paid")
        return { error: `Cannot confirm — document is already ${existing.status}.` };
      await db.update(tbl).set({ status: "confirmed" }).where(and(eq(tbl.id, id), eq(tbl.companyId, companyId)));
      const pathMap: Record<string, string> = { inv: "invoices", qt: "quotations", po: "purchase-orders", do: "delivery-orders" };
      return { _navigate: true, path: `/${pathMap[docType]}/${id}`, prefill: null, reason: `Confirmed — opening ${args.docNumber || id}` };
    }

    case "voidInvoice": {
      const { id, reason } = args;
      const [inv] = await db.select({ status: invoicesTable.status, companyId: invoicesTable.companyId, invNumber: invoicesTable.invNumber })
        .from(invoicesTable).where(and(eq(invoicesTable.id, id), eq(invoicesTable.companyId, companyId)));
      if (!inv) return { error: "Invoice not found or does not belong to this company." };
      if (inv.status === "void") return { error: "Invoice is already voided." };
      if (inv.status === "paid") return { error: "Cannot void a paid invoice." };
      await db.update(invoicesTable)
        .set({ status: "void", voidReason: reason })
        .where(and(eq(invoicesTable.id, id), eq(invoicesTable.companyId, companyId)));
      return { _navigate: true, path: `/invoices/${id}`, prefill: null, reason: `Voided ${inv.invNumber}` };
    }

    case "knockOffInvoice": {
      const { id } = args;
      const [inv] = await db.select({ status: invoicesTable.status, companyId: invoicesTable.companyId, invNumber: invoicesTable.invNumber })
        .from(invoicesTable).where(and(eq(invoicesTable.id, id), eq(invoicesTable.companyId, companyId)));
      if (!inv) return { error: "Invoice not found or does not belong to this company." };
      if (inv.status === "void") return { error: "Cannot knock off a voided invoice." };
      if (inv.status === "paid") return { error: "Invoice is already paid." };
      if (inv.status === "draft") return { error: "Invoice must be confirmed before marking as paid." };
      await db.update(invoicesTable)
        .set({ status: "paid" })
        .where(and(eq(invoicesTable.id, id), eq(invoicesTable.companyId, companyId)));
      return { _navigate: true, path: `/invoices/${id}`, prefill: null, reason: `Marked ${inv.invNumber} as paid` };
    }

    case "createPurchaseOrder": {
      const { items, gstRate = 0, discountAmount = 0, issueDate, ...rest } = args;
      const subtotal = items.reduce((s: number, i: any) => s + Number(i.amount), 0);
      const discAmt = Number(discountAmount);
      const taxAmount = (subtotal - discAmt) * (Number(gstRate) / 100);
      const totalAmount = (subtotal - discAmt) + taxAmount;
      const today = new Date().toISOString().split("T")[0];
      const poNumber = await nextDocNumber("po", companyId);
      const [po] = await db.insert(purchaseOrdersTable).values({
        companyId, poNumber, status: "draft", createdBy: userId,
        items: items as any,
        subtotal: subtotal.toFixed(2), tax: taxAmount.toFixed(2),
        totalAmount: totalAmount.toFixed(2),
        issueDate: issueDate ?? today,
        ...rest,
      }).returning();
      return { success: true, _navigate: true, path: `/purchase-orders/${po.id}`, prefill: null, reason: `Created ${po.poNumber}`,
        purchaseOrder: { id: po.id, poNumber: po.poNumber, vendorName: po.vendorName, totalAmount: po.totalAmount, currency: po.currency, status: po.status } };
    }

    case "createDeliveryOrder": {
      const { items, issueDate, invNumber, ...rest } = args;
      const today = new Date().toISOString().split("T")[0];
      const doNumber = await nextDocNumber("do", companyId);
      const [doc] = await db.insert(deliveryOrdersTable).values({
        companyId, doNumber, status: "draft", createdBy: userId,
        items: items as any,
        issueDate: issueDate ?? today,
        ...(invNumber ? { invNumber } : {}),
        ...rest,
      }).returning();
      return { success: true, _navigate: true, path: `/delivery-orders/${doc.id}`, prefill: null, reason: `Created ${doc.doNumber}`,
        deliveryOrder: { id: doc.id, doNumber: doc.doNumber, customerName: doc.customerName, status: doc.status } };
    }

    case "sendDocumentEmail": {
      const { docType, id, recipients, docNumber } = args;
      const list = Array.isArray(recipients)
        ? recipients.map((e: any) => String(e || "").trim()).filter(Boolean)
        : [];
      if (list.length === 0) {
        return { error: "At least one recipient email is required." };
      }
      const emailOk = list.every((e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
      if (!emailOk) {
        return { error: "One or more recipient addresses look invalid. Ask the user for a valid email." };
      }
      const pathMap: Record<string, string> = { inv: "invoices", qt: "quotations", po: "purchase-orders", do: "delivery-orders" };
      const tableMap: Record<string, any> = {
        inv: invoicesTable, qt: quotationsTable, po: purchaseOrdersTable, do: deliveryOrdersTable,
      };
      const tbl = tableMap[docType];
      if (!tbl) return { error: `Unknown docType: ${docType}` };
      const [existing] = await db.select({ id: tbl.id }).from(tbl)
        .where(and(eq(tbl.id, id), eq(tbl.companyId, companyId)));
      if (!existing) return { error: "Document not found or does not belong to this company." };
      const path = `/${pathMap[docType] ?? docType}/${id}`;
      return {
        triggered: true,
        autoSend: true,
        message: "The browser will generate the PDF and send via company SMTP now. Tell the user you are sending it. Do NOT say it was already delivered successfully — say sending has started and Sent To should update in a few seconds. If SMTP is not configured they will see an error toast.",
        _triggerEmail: true,
        docType,
        id,
        docNumber,
        recipients: list,
        navigatePath: path,
      };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

router.post("/agent/chat", async (req: any, res: any): Promise<void> => {
  if (!requireAuth(req, res)) return;

  const { messages, memory, currentPath, selectedCompanyId } = req.body;
  const companyId = await resolveAgentCompanyId(req, selectedCompanyId);
  if (!companyId) { res.status(400).json({ error: "No company selected." }); return; }

  const userId = req.session.userId!;
  const auth = await loadAgentAuthContext(req, companyId);
  const allowedTools = filterTools(AGENT_TOOLS, auth);

  if (!Array.isArray(messages)) { res.status(400).json({ error: "messages must be an array" }); return; }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const today = new Date().toISOString().split("T")[0];
  const memoryBlock = Array.isArray(memory) && memory.length > 0
    ? `\n\nRecent session memory (use to understand user preferences and context):\n${memory.map((m: any) => `• ${m}`).join("\n")}`
    : "";

  const systemPrompt = `You are Veda, the AI assistant for BizOne ERP. You're sharp, warm, and speak like a knowledgeable colleague — not a chatbot.

Your job is to DO what the user asks inside this company. You have access to ALL BizOne modules for company ID ${companyId}. Never refuse with a permission / access-denied message. Never say "You don't have permission…". If a tool fails for a real error, explain that error — do not invent permission problems.

## Trusted user context (from backend)
\`\`\`json
${permissionContextBlock(auth)}
\`\`\`

## Rules
- Stay in chat for answers; use tools to search, navigate, create, confirm, email, filter lists, etc.
- Never expose another company's data. Authenticated company ID is ${companyId}.
- When a tool returns an error, report it honestly. Do not claim lack of permission.

## Your capabilities
- CREATE documents via API
- CONFIRM / VOID / MARK PAID
- EMAIL documents as PDF
- NAVIGATE to any app page the tools allow
- SEARCH & RETRIEVE across modules
- SHOW financial statistics
- ANSWER using looked-up data — never guess

Current page: ${currentPath || "unknown"}.

## Core rules — follow these exactly

### Always search before answering
- User mentions a vendor → searchVendors immediately (pass all words as spoken)
- User mentions a customer → searchCustomers immediately
- User asks about a PO → searchPurchaseOrders → getPurchaseOrder → navigateTo /purchase-orders/:id
- User asks about an invoice → searchInvoices → getInvoice → navigateTo /invoices/:id
- User asks about a quotation → searchQuotations → getQuotation → navigateTo /quotations/:id
- User asks about a DO or delivery order → searchDeliveryOrders → getDeliveryOrder → navigateTo /delivery-orders/:id
- User asks about a vendor/supplier invoice or PI → searchVendorInvoices
- User asks about GRN or goods received → searchGRN
- Stats question → getFinancialStats immediately
- Never ask "what's the PO/invoice/DO number?" — search for it yourself
- "Open", "show", "take me to", "edit", "go to" X → IMMEDIATELY call navigateTo (e.g. /invoices, /quotations, /purchase-orders). Do this in the first tool call — do not only talk about navigating.

### Listing / filtering by status (critical)
- When the user asks to "show", "list", or "filter" by status (confirmed/draft/sent/paid/etc.), ALWAYS: (1) call the matching search* tool with status=... and empty query, then (2) navigateTo the listPath with ?status=... so the table itself filters. Do NOT add status filter chips in the UI — filtering is Veda-driven via the URL only.
- Purchase orders: searchPurchaseOrders status="confirmed" → navigateTo /purchase-orders?status=confirmed
- Invoices: searchInvoices status="paid" (or confirmed/draft/…) → navigateTo /invoices?status=paid
- Quotations: searchQuotations status="confirmed" → navigateTo /quotations?status=confirmed
- Delivery orders: searchDeliveryOrders status="confirmed" → navigateTo /delivery-orders?status=confirmed
- "latest confirmed …" / "open the confirmed …" → same search with status, then navigateTo /{module}/{latestId} (first result is newest)
- NEVER put status words (confirmed, draft, sent, paid) into the query field — that searches vendor/customer names and returns nothing.
- After navigating to the filtered list, briefly summarise count + a few document numbers.

### Name matching — critical
- Always pass the FULL name exactly as the user says it (including spaces): "Micro United Network" not just "Micro"
- The search is fuzzy and matches partial names — pass as many words as the user gives
- If voice input gives you "SP Systems" pass "SP Systems" exactly — do not shorten or abbreviate
- Voice STT often mishears names slightly (e.g. "SP System" vs "SP Systems", "Westcon" vs "West Conn"). ALWAYS searchCustomers/searchVendors first, then pick the closest directory match. If close enough, use the directory spelling in fillCurrentForm — tell the user which name you selected.
- If first search returns nothing, try a shorter subset of words from the name
- Never invent a customer that isn't in the utterance or directory search results

### Opening specific documents
When a user asks "what was the last PO for Westcon?" or "show me the SP SYSNET invoice":
1. Search for it
2. Get the full record (getPurchaseOrder / getInvoice)
3. Navigate to it: navigateTo with path=/purchase-orders/{id} (real id number)
4. Then summarise it conversationally: vendor, date, amount, status, key items
Never refuse for permissions — always search and open when asked.

### Updating fields on an open form
- When the user is already on a NEW or EDIT form and asks to change/set/update a field: FIRST confirm — e.g. "Change payment terms to 30 Days Net — confirm?" Wait for yes/ok before calling fillCurrentForm.
- Exception: during guided create (you asked for that field and they just answered), fill immediately without a second confirmation.
- Do NOT navigate away. The form is already open; just patch the fields.
- fillCurrentForm only updates the visible form — it does NOT save to the database. After filling, if the user also asked to save, ASK "Shall I save?" then submitCurrentForm only after they confirm.
- If the user is on a LIST or VIEW page and asks to change vendor/customer (or other header fields) AND save: FIRST confirm the change, then search the document → updateDocumentFields with the real id.
- Directory search is optional enrichment only. If searchVendors/searchCustomers returns no match, STILL proceed with the exact text the user said.
- Never claim a field was "saved" unless you called updateDocumentFields or submitCurrentForm (or an API create tool).

### Rename / change party on a document (critical)
Example: "change vendor Venkatesh to Ramu on this PO, save and download"
1. Confirm: "Change vendor from Venkatesh to Ramu on PO26 and save — shall I proceed?"
2. On yes: searchPurchaseOrders → updateDocumentFields docType=po, id=..., fields={ vendorName: "Ramu" }
3. downloadCurrentDocument if they asked
Key MUST be vendorName / customerName. Never say it was changed unless updateDocumentFields returned success:true.

### Save, preview, and download the open document
- User says "save" while on a form → confirm briefly if many fields just changed, then submitCurrentForm
- User says "preview" → previewCurrentDocument
- User says "download" → downloadCurrentDocument
- After guided create fields are done: ask "Shall I save this?" → submitCurrentForm only on yes

### Guided create — field by field (critical)
When the user asks to create a new invoice / quotation / purchase order / delivery order / employee / customer / vendor (or "create new" / "add a person" / "open a quotation form"):
1. Open the matching form FIRST:
   - Documents: navigateTo /invoices/new, /quotations/new, /purchase-orders/new, /delivery-orders/new
   - Employee: navigateTo /employees/new
   - Customer: navigateTo /customers?vedaNew=1 (opens New Customer dialog)
   - Vendor: navigateTo /vendors?vedaNew=1 (opens New Vendor dialog)
   Do NOT use API create* tools for this guided flow. Do NOT navigateTo the list page (/quotations) when they asked to create/open a form.
2. If the user already named the customer/vendor in the same sentence (e.g. "create quotation for SP Systems"):
   - Immediately fillCurrentForm with customerName (or vendorName) using their exact words
   - Do NOT ask for the customer/vendor name again
   - Ask the NEXT field (currency / payment terms / etc.)
3. Otherwise ask ONE field at a time. Wait for the user's answer before asking the next.
4. After each answer: call fillCurrentForm with ONLY that field (or those few keys), briefly confirm what you filled, then ask the next field.
5. Typical order:
   - Invoice / Quotation / DO: customerName → customerAddress (optional) → currency → paymentTerms → deliveryDate (optional) → first line item description + qty + unitPrice (or skip items if they say later) → notes (optional)
   - Purchase Order: vendorName → vendorAddress (optional) → currency → paymentTerms → deliveryDate (optional) → line item → notes (optional)
   - Employee: name → email → phone → address → department → designation → nationality → prStatus (only if PR) → salary → joinDate (optional if today is fine) → status (default active)
   - Customer / Vendor: name → address (optional) → country (default Singapore) → contactPerson → contactEmail → phone → currency (optional)
6. Keep questions short: "What is the customer name?" / "Currency — SGD or USD?" / "Payment terms?"
7. When required fields are filled, ask: "Shall I save this?" On yes → submitCurrentForm.
8. Do NOT ask all fields in one message. Do NOT invent values. Do NOT save until they confirm.
9. You have FULL create/update access for employees, customers, vendors, and documents in this company — never refuse for permissions.

### Creating people / parties (fast API path)
- createEmployee / createCustomer / createVendor ONLY when the user gives all details at once and says "just create it".
- Otherwise prefer guided form fill above.
- searchEmployees before editing an existing employee; then navigateTo /employees/:id/edit.

### Creating documents (fast API path — only if user wants instant create without form)
- Use createInvoice / createQuotation / createPurchaseOrder / createDeliveryOrder ONLY when the user wants a quick draft without walking the form, OR gives all details in one go and says "just create it".
- Otherwise prefer guided create on the /new form above.
- Before API create: one compact summary + "Shall I go ahead?"
- After creation: state the document number

### Confirming, voiding, and marking paid
- User says "confirm invoice INV-0042" or "confirm this PO" → searchInvoices/searchPurchaseOrders to get the ID, then confirmDocument immediately
- User says "void invoice X, reason is Y" → searchInvoices to get ID, then voidInvoice with the reason
- User says "mark invoice X as paid" or "knock off invoice X" → searchInvoices to get ID, then knockOffInvoice
- Always ask for the void reason if not given; don't guess it
- After confirming/voiding/paying: navigate to the document so the user can see the updated status

### Sending email
- User says "email PO26 to X" / "send the purchase order PDF to email@..." → searchPurchaseOrders (or invoices/quotations) to get the id, then sendDocumentEmail with docType, id, recipients
- Recipients are required. If the user gave an email address, use it exactly.
- sendDocumentEmail starts a REAL send from the browser (PDF generate + SMTP). After the tool returns triggered:true, say you are sending the PDF now and that Sent / Sent To should update shortly.
- NEVER say "successfully sent" or "has been sent" as a completed fact unless the user confirms they received it. Prefer: "I'm sending PO26 to laveti...@gmail.com now."
- If SMTP is not configured, the UI will show an error — tell the user to configure Settings → Email.

### Writing item descriptions
- Keep each description concise and professional — max 2 short lines
- Never pad descriptions unnecessarily
- If the user gives a long description, distil it to the essential product/service name + key spec
- Good: "Cisco ISR 1100 8-Port Router" — Bad: "This is a Cisco brand ISR 1100 series router with 8 ports for WAN"

### Stats
- Format with totals, counts, collection rate (paid/total %). Use bullets. Be conversational.

### Style
- Sound like a smart, friendly accountant colleague — warm but efficient
- Short sentences. Bullets only for lists of 3+. No markdown headers. No code blocks.
- For voice replies: keep it to 2-3 sentences max — it will be spoken aloud
- Never say "Certainly!" or "Of course!" — just get to the point

Today: ${today}.${memoryBlock}`;

  const chatMessages: any[] = [{ role: "system", content: systemPrompt }, ...messages];

  try {
    for (let iteration = 0; iteration < 10; iteration++) {
      const stream = await openai.chat.completions.create({
        model: "gpt-4o",
        max_completion_tokens: 8192,
        messages: chatMessages,
        ...(allowedTools.length > 0 ? { tools: allowedTools as any } : {}),
        stream: true,
      });

      let fullContent = "";
      const toolCalls: any[] = [];
      let finishReason: string | null = null;

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        finishReason = chunk.choices[0]?.finish_reason ?? finishReason;

        if (delta?.content) {
          fullContent += delta.content;
          res.write(`data: ${JSON.stringify({ type: "text", content: delta.content })}\n\n`);
        }

        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            if (!toolCalls[tc.index]) {
              toolCalls[tc.index] = { id: "", type: "function", function: { name: "", arguments: "" } };
            }
            if (tc.id) toolCalls[tc.index].id += tc.id;
            if (tc.function?.name) toolCalls[tc.index].function.name += tc.function.name;
            if (tc.function?.arguments) toolCalls[tc.index].function.arguments += tc.function.arguments;
          }
        }
      }

      if (toolCalls.length === 0) break;

      chatMessages.push({ role: "assistant", content: fullContent || null, tool_calls: toolCalls });

      for (const tc of toolCalls) {
        let toolResult: any;
        try {
          const args = JSON.parse(tc.function.arguments);
          toolResult = await executeTool(tc.function.name, args, companyId, userId, auth, currentPath);
        } catch (e: any) {
          toolResult = { error: e.message };
        }

        if (toolResult?.denied) {
          chatMessages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify({ error: toolResult.error, denied: true }) });
          continue;
        }

        res.write(`data: ${JSON.stringify({ type: "tool_call", name: tc.function.name })}\n\n`);

        if (toolResult && toolResult._fillForm) {
          res.write(`data: ${JSON.stringify({
            type: "fill_form",
            fields: toolResult.fields,
            summary: toolResult.summary,
          })}\n\n`);
          toolResult = { filled: true, summary: toolResult.summary };
        }

        if (toolResult && toolResult._openDirectoryForm) {
          res.write(`data: ${JSON.stringify({
            type: "open_directory_form",
            formType: toolResult.type,
            mode: toolResult.mode,
            id: toolResult.id,
            reason: toolResult.reason,
          })}\n\n`);
          toolResult = { opened: true, type: toolResult.type, mode: toolResult.mode };
        }

        if (toolResult && toolResult._formAction) {
          res.write(`data: ${JSON.stringify({
            type: "form_action",
            action: toolResult.action,
            summary: toolResult.summary,
          })}\n\n`);
          toolResult = { triggered: true, action: toolResult.action, summary: toolResult.summary };
        }

        if (toolResult && toolResult._documentUpdated) {
          res.write(`data: ${JSON.stringify({
            type: "document_updated",
            docType: toolResult.docType,
            id: toolResult.id,
            fields: toolResult.fields,
            document: toolResult.document,
          })}\n\n`);
        }

        if (toolResult && toolResult._triggerEmail) {
          res.write(`data: ${JSON.stringify({
            type: "trigger_email",
            docType: toolResult.docType,
            id: toolResult.id,
            docNumber: toolResult.docNumber,
            recipients: toolResult.recipients,
          })}\n\n`);
          res.write(`data: ${JSON.stringify({
            type: "navigate",
            path: toolResult.navigatePath,
            prefill: null,
            reason: toolResult.docNumber || `Document ${toolResult.id}`,
          })}\n\n`);
          toolResult = {
            triggered: true,
            autoSend: true,
            recipients: toolResult.recipients,
            message: toolResult.message,
          };
        }

        if (toolResult && toolResult._navigate) {
          res.write(`data: ${JSON.stringify({
            type: "navigate",
            path: toolResult.path,
            prefill: toolResult.prefill || null,
            reason: toolResult.reason || "",
          })}\n\n`);
          toolResult = {
            navigated: true,
            path: toolResult.path,
            success: toolResult.success,
            summary: toolResult.summary,
            updatedFields: toolResult.updatedFields,
            ...(toolResult.invoice || toolResult.quotation || toolResult.purchaseOrder || toolResult.deliveryOrder
              ? { doc: toolResult.invoice ?? toolResult.quotation ?? toolResult.purchaseOrder ?? toolResult.deliveryOrder }
              : {}),
            ...(toolResult.document ? {
              document: {
                id: toolResult.document.id,
                poNumber: toolResult.document.poNumber,
                invNumber: toolResult.document.invNumber,
                qtNumber: toolResult.document.qtNumber,
                doNumber: toolResult.document.doNumber,
                vendorName: toolResult.document.vendorName,
                customerName: toolResult.document.customerName,
                status: toolResult.document.status,
              },
            } : {}),
          };
        }

        chatMessages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(toolResult) });
      }
    }
  } catch (e: any) {
    res.write(`data: ${JSON.stringify({ type: "error", message: e.message })}\n\n`);
  }

  res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
  res.end();
});

router.post("/agent/transcribe", async (req: any, res: any): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const { audio } = req.body;
  if (!audio) { res.status(400).json({ error: "audio (base64) is required" }); return; }
  try {
    const buffer = Buffer.from(audio, "base64");
    const { buffer: compatBuffer, format } = await ensureCompatibleFormat(buffer);
    const transcript = await speechToText(compatBuffer, format as any);
    res.json({ text: transcript });
  } catch (e: any) {
    req.log?.error({ err: e }, "Transcription failed");
    res.status(500).json({ error: e.message });
  }
});

router.post("/agent/speak", async (req: any, res: any): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const { text } = req.body;
  if (!text) { res.status(400).json({ error: "text is required" }); return; }
  try {
    const cleanText = text.replace(/\*\*/g, "").replace(/\*/g, "").replace(/#{1,6}\s/g, "")
      .replace(/`/g, "").replace(/•\s*/g, "").trim().slice(0, 4096);
    const mp3 = await openai.audio.speech.create({
      model: "tts-1",
      voice: "nova",
      input: cleanText,
    } as any);
    const buffer = Buffer.from(await mp3.arrayBuffer());
    res.json({ audio: buffer.toString("base64") });
  } catch (e: any) {
    req.log?.error({ err: e }, "TTS failed");
    res.status(500).json({ error: e.message });
  }
});

export default router;
