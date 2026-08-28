import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "lib", "db", "package.json"));
const pg = require("pg");
const envPath = path.join(root, "artifacts", "api-server", "src", ".env");

function loadEnv(filePath) {
  const env = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const env = loadEnv(envPath);
const client = new pg.Client({ connectionString: env.DATABASE_URL });
await client.connect();

const NAVY = "#18212F";
const GREY = "#646464";
const LINE = "#C8C8C8";

function el(partial) {
  return {
    fontSize: 9.5,
    fontWeight: "normal",
    color: "#111827",
    textAlign: "left",
    borderWidth: 0,
    borderStyle: "none",
    visible: true,
    ...partial,
  };
}

function buildDefaultDocumentTemplate(opts) {
  return {
    version: 1,
    reportType: opts.reportType,
    page: {
      size: "A4",
      orientation: "portrait",
      margin: { top: 10, right: 14, bottom: 12, left: 14 },
    },
    elements: [
      el({
        id: "company-logo",
        type: "image",
        field: "company.logo",
        x: 14, y: 10, width: 62, height: 16,
      }),
      el({
        id: "company-name",
        type: "field",
        field: "company.name",
        x: 14, y: 28, width: 100, height: 6,
        fontSize: 11, fontWeight: "bold",
      }),
      el({
        id: "company-address",
        type: "field",
        field: "company.address",
        x: 14, y: 35, width: 108, height: 10,
        fontSize: 9, color: GREY,
      }),
      el({
        id: "reg-label",
        type: "text",
        text: "Co. Reg. No.:",
        x: 14, y: 46, width: 26, height: 4,
        fontSize: 8, color: GREY,
      }),
      el({
        id: "company-reg",
        type: "field",
        field: "company.registration_number",
        x: 40, y: 46, width: 82, height: 4,
        fontSize: 8, color: GREY,
      }),
      el({
        id: "gst-reg-label",
        type: "text",
        text: "GST Reg. No.:",
        x: 14, y: 50.5, width: 26, height: 4,
        fontSize: 8, color: GREY,
      }),
      el({
        id: "company-tax",
        type: "field",
        field: "company.tax_number",
        x: 40, y: 50.5, width: 82, height: 4,
        fontSize: 8, color: GREY,
      }),
      el({
        id: "doc-title",
        type: "text",
        text: opts.title,
        x: 118, y: 10, width: 78, height: 8,
        fontSize: 18, fontWeight: "bold", textAlign: "right", color: NAVY,
      }),
      el({
        id: "doc-number-label",
        type: "text",
        text: "Number:",
        x: 118, y: 20, width: 38, height: 5,
        fontSize: 9.5, textAlign: "right", color: GREY,
      }),
      el({
        id: "doc-number",
        type: "field",
        field: opts.reportType === "invoice" ? "invoice.invoice_number" : "proforma-invoice.invoice_number",
        x: 157, y: 20, width: 39, height: 5,
        fontSize: 9.5, textAlign: "right", color: GREY,
      }),
      el({
        id: "doc-date-label",
        type: "text",
        text: "Date:",
        x: 118, y: 28, width: 38, height: 5,
        fontSize: 9.5, textAlign: "right", color: GREY,
      }),
      el({
        id: "doc-date",
        type: "field",
        field: opts.reportType === "invoice" ? "invoice.invoice_date" : "proforma-invoice.invoice_date",
        x: 157, y: 28, width: 39, height: 5,
        fontSize: 9.5, textAlign: "right", color: GREY,
      }),
      el({
        id: "terms-meta-label",
        type: "text",
        text: "Payment Terms:",
        x: 118, y: 36, width: 38, height: 5,
        fontSize: 9.5, textAlign: "right", color: GREY,
      }),
      el({
        id: "payment-terms",
        type: "field",
        field: opts.reportType === "invoice" ? "invoice.payment_terms" : "proforma-invoice.payment_terms",
        x: 157, y: 36, width: 39, height: 5,
        fontSize: 9.5, textAlign: "right", color: GREY,
      }),
      el({
        id: "header-line",
        type: "line",
        x: 14, y: 57, width: 182, height: 0.35,
        backgroundColor: LINE,
      }),
      el({
        id: "bill-to-label",
        type: "text",
        text: opts.partyLabel,
        x: 14, y: 61, width: 80, height: 5,
        fontSize: 10, fontWeight: "bold",
      }),
      el({
        id: "customer-name",
        type: "field",
        field: "customer.name",
        x: 14, y: 68, width: 120, height: 5,
        fontSize: 9.5, fontWeight: "bold", color: "#3C3C3C",
      }),
      el({
        id: "customer-address",
        type: "field",
        field: "customer.address",
        x: 14, y: 74, width: 130, height: 10,
        fontSize: 9.5, color: "#3C3C3C",
      }),
      el({
        id: "customer-attn",
        type: "field",
        field: "customer.contact_person",
        x: 14, y: 85, width: 120, height: 5,
        fontSize: 9.5, color: "#3C3C3C",
      }),
      el({
        id: "items-table",
        type: "table",
        source: "items",
        x: 14, y: 94, width: 182, height: 88,
        fontSize: 8,
        headerBackground: NAVY,
        headerColor: "#FFFFFF",
        columns: [
          { header: "#", field: "item.index", width: 10, align: "left" },
          { header: "Item / Part Number", field: "item.product_name", width: 32, align: "left" },
          { header: "Description", field: "item.description", width: 48, align: "left" },
          { header: "Qty", field: "item.quantity", width: 16, align: "right" },
          { header: "UOM", field: "item.uom", width: 16, align: "center" },
          { header: "Unit Price", field: "item.unit_price", width: 30, align: "right" },
          { header: "Amount", field: "item.amount", width: 30, align: "right" },
        ],
      }),
      el({
        id: "totals-box",
        type: "rectangle",
        x: 118, y: 188, width: 78, height: 28,
        backgroundColor: "#F3F4F6",
        borderWidth: 0,
      }),
      el({
        id: "subtotal-label",
        type: "text",
        text: "Subtotal",
        x: 122, y: 191, width: 32, height: 5,
        fontSize: 9.5, color: GREY,
      }),
      el({
        id: "subtotal",
        type: "field",
        field: opts.reportType === "invoice" ? "invoice.subtotal" : "proforma-invoice.subtotal",
        x: 154, y: 191, width: 38, height: 5,
        fontSize: 9.5, textAlign: "right",
      }),
      el({
        id: "tax-label",
        type: "field",
        field: opts.reportType === "invoice" ? "invoice.tax_label" : "proforma-invoice.tax_label",
        x: 122, y: 198, width: 32, height: 5,
        fontSize: 9.5, color: GREY,
      }),
      el({
        id: "tax",
        type: "field",
        field: opts.reportType === "invoice" ? "invoice.tax" : "proforma-invoice.tax",
        x: 154, y: 198, width: 38, height: 5,
        fontSize: 9.5, textAlign: "right",
      }),
      el({
        id: "total-line",
        type: "line",
        x: 122, y: 205, width: 70, height: 0.25,
        backgroundColor: "#D1D5DB",
      }),
      el({
        id: "total-label",
        type: "text",
        text: "Total Amount",
        x: 122, y: 208, width: 32, height: 6,
        fontSize: 10.5, fontWeight: "bold",
      }),
      el({
        id: "total",
        type: "field",
        field: opts.reportType === "invoice" ? "invoice.total" : "proforma-invoice.total",
        x: 154, y: 208, width: 38, height: 6,
        fontSize: 10.5, fontWeight: "bold", textAlign: "right",
      }),
      el({
        id: "cust-note-label",
        type: "text",
        text: "Customer Note:",
        x: 14, y: 220, width: 90, height: 4,
        fontSize: 7.5, fontWeight: "bold", color: GREY,
      }),
      el({
        id: "cust-note-field",
        type: "field",
        field: opts.reportType === "invoice" ? "invoice.customer_note" : "proforma-invoice.customer_note",
        x: 14, y: 224, width: 90, height: 10,
        fontSize: 8, color: "#111827",
      }),
      el({
        id: "deliv-inst-label",
        type: "text",
        text: "Delivery Instructions:",
        x: 14, y: 236, width: 90, height: 4,
        fontSize: 7.5, fontWeight: "bold", color: GREY,
      }),
      el({
        id: "deliv-inst-field",
        type: "field",
        field: opts.reportType === "invoice" ? "invoice.delivery_instructions" : "proforma-invoice.delivery_instructions",
        x: 14, y: 240, width: 90, height: 10,
        fontSize: 8, color: "#111827",
      }),
      el({
        id: "terms-label",
        type: "text",
        text: "Terms & Conditions:",
        x: 14, y: 252, width: 90, height: 4,
        fontSize: 7.5, fontWeight: "bold", color: GREY,
      }),
      el({
        id: "terms-field",
        type: "field",
        field: opts.reportType === "invoice" ? "invoice.terms_and_conditions" : "proforma-invoice.terms_and_conditions",
        x: 14, y: 256, width: 90, height: 18,
        fontSize: 8, color: "#111827",
      }),
      el({
        id: "authorised-sig-img",
        type: "image",
        field: opts.reportType === "invoice" ? "invoice.authorised_signature" : "proforma-invoice.authorised_signature",
        x: 136, y: 224, width: 45, height: 15,
      }),
      el({
        id: "authorised-sig-line",
        type: "line",
        x: 136, y: 240, width: 45, height: 0.25,
        backgroundColor: "#D1D5DB",
      }),
      el({
        id: "authorised-sig-label",
        type: "text",
        text: "Authorised Signature",
        x: 136, y: 241, width: 45, height: 4,
        fontSize: 8, fontWeight: "bold", textAlign: "center", color: GREY,
      }),
      el({
        id: "footer-line",
        type: "line",
        x: 14, y: 278, width: 182, height: 0.25,
        backgroundColor: "#D2D2D2",
      }),
      el({
        id: "footer-note",
        type: "text",
        text: `This is a computer-generated ${opts.footerDocName} document and does not require a physical signature.`,
        x: 14, y: 281, width: 140, height: 5,
        fontSize: 6.5, fontStyle: "italic", color: "#AFAFAF",
      }),
      el({
        id: "page-number",
        type: "page_number",
        x: 154, y: 281, width: 42, height: 5,
        fontSize: 6.5, textAlign: "right", color: "#AFAFAF",
      }),
    ],
  };
}

try {
  console.log("Fetching all templates...");
  const res = await client.query(`
    SELECT rt.id, rt.name, rd.report_type 
    FROM report_templates rt
    JOIN report_definitions rd ON rt.report_definition_id = rd.id
  `);
  
  for (const row of res.rows) {
    if (row.report_type === "invoice" || row.report_type === "proforma-invoice") {
      console.log(`Updating template layout for template ID ${row.id} ("${row.name}") [${row.report_type}]...`);
      
      const newJson = buildDefaultDocumentTemplate({
        reportType: row.report_type,
        title: row.report_type === "invoice" ? "TAX INVOICE" : "PROFORMA INVOICE",
        partyLabel: "Bill To:",
        footerDocName: row.report_type === "invoice" ? "Tax Invoice" : "Proforma Invoice",
      });
      
      await client.query(
        "UPDATE report_templates SET template_json = $1, updated_at = NOW() WHERE id = $2",
        [JSON.stringify(newJson), row.id]
      );
    }
  }
  
  console.log("Successfully updated all database templates!");
} catch (err) {
  console.error("Error updating templates:", err);
} finally {
  await client.end();
}
