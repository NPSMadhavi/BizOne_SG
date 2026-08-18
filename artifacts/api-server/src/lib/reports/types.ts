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

export interface CompanyReportData {
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

export interface InvoiceReportData {
  invoice_number: string;
  invoice_date: string;
  delivery_date: string;
  payment_terms: string;
  po_ref: string;
  notes: string;
  subtotal: string;
  discount: string;
  tax: string;
  tax_label: string;
  total: string;
  currency: string;
  currency_symbol: string;
  status: string;
}

export interface CustomerReportData {
  name: string;
  address: string;
  email: string;
  phone: string;
  tax_number: string;
  contact_person: string;
  postal_code: string;
  country: string;
  ship_to_address: string;
}

export interface ItemReportData {
  index: string;
  product_name: string;
  description: string;
  quantity: string;
  uom: string;
  unit_price: string;
  discount: string;
  tax: string;
  amount: string;
}

export interface InvoiceReportPayload {
  company: CompanyReportData;
  invoice: InvoiceReportData;
  customer: CustomerReportData;
  items: ItemReportData[];
  recordId?: number;
}

export const EMPTY_COMPANY: CompanyReportData = {
  name: "",
  logo: "",
  address: "",
  city: "",
  state: "",
  country: "",
  postalCode: "",
  phone: "",
  email: "",
  website: "",
  taxNumber: "",
  registrationNumber: "",
  bankDetails: "",
  terms: "",
  gstRate: "",
};

export const EMPTY_INVOICE: InvoiceReportData = {
  invoice_number: "",
  invoice_date: "",
  delivery_date: "",
  payment_terms: "",
  po_ref: "",
  notes: "",
  subtotal: "",
  discount: "",
  tax: "",
  tax_label: "GST",
  total: "",
  currency: "",
  currency_symbol: "",
  status: "",
};

export const EMPTY_CUSTOMER: CustomerReportData = {
  name: "",
  address: "",
  email: "",
  phone: "",
  tax_number: "",
  contact_person: "",
  postal_code: "",
  country: "",
  ship_to_address: "",
};
