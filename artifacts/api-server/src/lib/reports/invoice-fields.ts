import type { DocumentReportType } from "./document-types.js";

export const INVOICE_REPORT_FIELDS = [
  { fieldKey: "company.name", fieldLabel: "Company Name", fieldGroup: "Company", dataType: "string", isRepeatable: false },
  { fieldKey: "company.logo", fieldLabel: "Company Logo", fieldGroup: "Company", dataType: "image", isRepeatable: false },
  { fieldKey: "company.address", fieldLabel: "Company Address", fieldGroup: "Company", dataType: "string", isRepeatable: false },
  { fieldKey: "company.country", fieldLabel: "Company Country", fieldGroup: "Company", dataType: "string", isRepeatable: false },
  { fieldKey: "company.phone", fieldLabel: "Company Phone", fieldGroup: "Company", dataType: "string", isRepeatable: false },
  { fieldKey: "company.email", fieldLabel: "Company Email", fieldGroup: "Company", dataType: "string", isRepeatable: false },
  { fieldKey: "company.website", fieldLabel: "Company Website", fieldGroup: "Company", dataType: "string", isRepeatable: false },
  { fieldKey: "company.tax_number", fieldLabel: "Company Tax Number", fieldGroup: "Company", dataType: "string", isRepeatable: false },
  { fieldKey: "company.registration_number", fieldLabel: "Registration Number", fieldGroup: "Company", dataType: "string", isRepeatable: false },
  { fieldKey: "company.bank_details", fieldLabel: "Bank Details", fieldGroup: "Company", dataType: "string", isRepeatable: false },
  { fieldKey: "company.terms", fieldLabel: "Terms & Conditions", fieldGroup: "Company", dataType: "string", isRepeatable: false },
  { fieldKey: "company.gst_rate", fieldLabel: "GST Rate", fieldGroup: "Company", dataType: "string", isRepeatable: false },

  { fieldKey: "invoice.invoice_number", fieldLabel: "Invoice Number", fieldGroup: "Invoice", dataType: "string", isRepeatable: false },
  { fieldKey: "invoice.invoice_date", fieldLabel: "Invoice Date", fieldGroup: "Invoice", dataType: "date", isRepeatable: false },
  { fieldKey: "invoice.delivery_date", fieldLabel: "Delivery Date", fieldGroup: "Invoice", dataType: "date", isRepeatable: false },
  { fieldKey: "invoice.payment_terms", fieldLabel: "Payment Terms", fieldGroup: "Invoice", dataType: "string", isRepeatable: false },
  { fieldKey: "invoice.po_ref", fieldLabel: "PO Reference", fieldGroup: "Invoice", dataType: "string", isRepeatable: false },
  { fieldKey: "invoice.notes", fieldLabel: "Notes", fieldGroup: "Invoice", dataType: "string", isRepeatable: false },
  { fieldKey: "invoice.subtotal", fieldLabel: "Subtotal", fieldGroup: "Invoice", dataType: "currency", isRepeatable: false },
  { fieldKey: "invoice.discount", fieldLabel: "Discount", fieldGroup: "Invoice", dataType: "currency", isRepeatable: false },
  { fieldKey: "invoice.tax", fieldLabel: "Tax", fieldGroup: "Invoice", dataType: "currency", isRepeatable: false },
  { fieldKey: "invoice.tax_label", fieldLabel: "GST Label", fieldGroup: "Invoice", dataType: "string", isRepeatable: false },
  { fieldKey: "invoice.total", fieldLabel: "Total", fieldGroup: "Invoice", dataType: "currency", isRepeatable: false },
  { fieldKey: "invoice.currency", fieldLabel: "Currency", fieldGroup: "Invoice", dataType: "string", isRepeatable: false },
  { fieldKey: "invoice.status", fieldLabel: "Status", fieldGroup: "Invoice", dataType: "string", isRepeatable: false },

  { fieldKey: "customer.name", fieldLabel: "Customer Name", fieldGroup: "Customer", dataType: "string", isRepeatable: false },
  { fieldKey: "customer.address", fieldLabel: "Customer Address", fieldGroup: "Customer", dataType: "string", isRepeatable: false },
  { fieldKey: "customer.email", fieldLabel: "Customer Email", fieldGroup: "Customer", dataType: "string", isRepeatable: false },
  { fieldKey: "customer.phone", fieldLabel: "Customer Phone", fieldGroup: "Customer", dataType: "string", isRepeatable: false },
  { fieldKey: "customer.tax_number", fieldLabel: "Customer Tax Number", fieldGroup: "Customer", dataType: "string", isRepeatable: false },
  { fieldKey: "customer.contact_person", fieldLabel: "Contact Person", fieldGroup: "Customer", dataType: "string", isRepeatable: false },
  { fieldKey: "customer.postal_code", fieldLabel: "Postal Code", fieldGroup: "Customer", dataType: "string", isRepeatable: false },
  { fieldKey: "customer.country", fieldLabel: "Customer Country", fieldGroup: "Customer", dataType: "string", isRepeatable: false },
  { fieldKey: "customer.ship_to_address", fieldLabel: "Ship To Address", fieldGroup: "Customer", dataType: "string", isRepeatable: false },

  { fieldKey: "item.index", fieldLabel: "#", fieldGroup: "Items", dataType: "number", isRepeatable: true },
  { fieldKey: "item.product_name", fieldLabel: "Product", fieldGroup: "Items", dataType: "string", isRepeatable: true },
  { fieldKey: "item.description", fieldLabel: "Description", fieldGroup: "Items", dataType: "string", isRepeatable: true },
  { fieldKey: "item.quantity", fieldLabel: "Quantity", fieldGroup: "Items", dataType: "number", isRepeatable: true },
  { fieldKey: "item.uom", fieldLabel: "UOM", fieldGroup: "Items", dataType: "string", isRepeatable: true },
  { fieldKey: "item.unit_price", fieldLabel: "Unit Price", fieldGroup: "Items", dataType: "currency", isRepeatable: true },
  { fieldKey: "item.discount", fieldLabel: "Item Discount", fieldGroup: "Items", dataType: "number", isRepeatable: true },
  { fieldKey: "item.tax", fieldLabel: "Item Tax", fieldGroup: "Items", dataType: "number", isRepeatable: true },
  { fieldKey: "item.amount", fieldLabel: "Amount", fieldGroup: "Items", dataType: "currency", isRepeatable: true },
] as const;

export type ReportFieldSeed = {
  fieldKey: string;
  fieldLabel: string;
  fieldGroup: string;
  dataType: string;
  isRepeatable: boolean;
};

/** Same field keys as invoice so the default layout still binds; labels match the document type. */
export function fieldsForDocumentType(cfg: DocumentReportType): ReportFieldSeed[] {
  const partyGroup = cfg.partyKind === "vendor" ? "Vendor" : "Customer";
  const partyPrefix = cfg.partyKind === "vendor" ? "Vendor" : "Customer";
  return INVOICE_REPORT_FIELDS.map((field) => {
    if (field.fieldGroup === "Invoice") {
      let fieldLabel = field.fieldLabel
        .replace("Invoice Number", `${cfg.shortName} Number`)
        .replace("Invoice Date", `${cfg.shortName} Date`);
      return { ...field, fieldGroup: cfg.name, fieldLabel };
    }
    if (field.fieldGroup === "Customer") {
      return {
        ...field,
        fieldGroup: partyGroup,
        fieldLabel: field.fieldLabel.replace("Customer", partyPrefix),
      };
    }
    return { ...field };
  });
}
