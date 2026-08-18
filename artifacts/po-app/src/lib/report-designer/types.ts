export type ReportElementType =
  | "text"
  | "field"
  | "image"
  | "table"
  | "line"
  | "rectangle"
  | "date"
  | "page_number";

export interface ReportPageMargin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ReportPage {
  size: "A4" | "Letter";
  orientation: "portrait" | "landscape";
  margin: ReportPageMargin;
}

export interface ReportTableColumn {
  header: string;
  field: string;
  width: number;
  align?: "left" | "center" | "right";
}

export interface ReportElement {
  id: string;
  type: ReportElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  field?: string;
  src?: string;
  fontSize?: number;
  fontWeight?: "normal" | "bold";
  fontStyle?: "normal" | "italic";
  color?: string;
  backgroundColor?: string;
  textAlign?: "left" | "center" | "right";
  borderWidth?: number;
  borderColor?: string;
  borderStyle?: "solid" | "dashed" | "none";
  visible?: boolean;
  zIndex?: number;
  source?: string;
  columns?: ReportTableColumn[];
  dateFormat?: string;
  headerBackground?: string;
  headerColor?: string;
}

export interface ReportTemplateJson {
  version: number;
  reportType: string;
  page: ReportPage;
  elements: ReportElement[];
}

export interface ReportFieldDef {
  id: number;
  fieldKey: string;
  fieldLabel: string;
  fieldGroup: string;
  dataType: string;
  isRepeatable: boolean;
}

export interface ReportDefinition {
  id: number;
  module: string;
  reportType: string;
  name: string;
  description?: string | null;
  fields?: ReportFieldDef[];
}

export interface ReportTemplate {
  id: number;
  companyId: number | null;
  reportDefinitionId: number;
  name: string;
  description?: string | null;
  templateJson: ReportTemplateJson;
  isSystemTemplate: boolean;
  isActive: boolean;
  reportType?: string;
  reportTypeName?: string;
  status?: "ACTIVE" | "INACTIVE" | "SYSTEM DEFAULT";
  createdAt?: string;
  updatedAt?: string;
}

export const PAGE_MM: Record<string, { width: number; height: number }> = {
  A4: { width: 210, height: 297 },
  Letter: { width: 215.9, height: 279.4 },
};

export function pageSizeMm(page: ReportPage): { width: number; height: number } {
  const base = PAGE_MM[page?.size || "A4"] || PAGE_MM.A4;
  if (page?.orientation === "landscape") return { width: base.height, height: base.width };
  return base;
}

export function newElementId(): string {
  return `el-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export interface CompanyLiveData {
  name: string;
  logo: string;
  address: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  phone: string;
  email: string;
  website: string;
  taxNumber: string;
  registrationNumber: string;
  bankDetails: string;
  terms: string;
  gstRate: string;
}

const COMPANY_FIELD_MAP: Record<string, keyof CompanyLiveData> = {
  "company.name": "name",
  "company.logo": "logo",
  "company.address": "address",
  "company.country": "country",
  "company.phone": "phone",
  "company.email": "email",
  "company.website": "website",
  "company.tax_number": "taxNumber",
  "company.registration_number": "registrationNumber",
  "company.bank_details": "bankDetails",
  "company.terms": "terms",
  "company.gst_rate": "gstRate",
};

export function isCompanyField(field?: string) {
  return !!field && field.startsWith("company.");
}

export function liveCompanyValue(field: string | undefined, company?: CompanyLiveData | null): string {
  if (!field || !company) return "";
  const key = COMPANY_FIELD_MAP[field];
  if (!key) return "";
  return String(company[key] || "").trim();
}

export const ELEMENT_DEFAULTS: Record<ReportElementType, Partial<ReportElement>> = {
  text: { width: 50, height: 8, text: "Text", fontSize: 10 },
  field: { width: 50, height: 6, field: "company.name", fontSize: 9 },
  image: { width: 36, height: 18, field: "company.logo" },
  table: {
    width: 186,
    height: 70,
    source: "items",
    columns: [
      { header: "Product", field: "item.product_name", width: 40, align: "left" },
      { header: "Qty", field: "item.quantity", width: 20, align: "right" },
      { header: "Price", field: "item.unit_price", width: 30, align: "right" },
      { header: "Amount", field: "item.amount", width: 30, align: "right" },
    ],
  },
  line: { width: 186, height: 0.4, backgroundColor: "#1D4ED8" },
  rectangle: { width: 50, height: 20, borderWidth: 0.3, borderColor: "#D1D5DB", borderStyle: "solid" },
  date: { width: 40, height: 6, fontSize: 9 },
  page_number: { width: 40, height: 5, fontSize: 8, textAlign: "center" },
};
