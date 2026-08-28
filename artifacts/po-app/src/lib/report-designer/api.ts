import type { ReportDefinition, ReportTemplate, ReportTemplateJson } from "./types";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) {
    throw new Error("Empty response from server — template may not have been saved");
  }
  return JSON.parse(text) as T;
}

export function listReportDefinitions() {
  return api<ReportDefinition[]>("/api/report-definitions");
}

export function getReportDefinition(id: number) {
  return api<ReportDefinition>(`/api/report-definitions/${id}`);
}

export function listReportTemplates(reportType?: string) {
  const q = reportType ? `?reportType=${encodeURIComponent(reportType)}` : "";
  return api<ReportTemplate[]>(`/api/report-templates${q}`);
}

export function getReportTemplate(id: number) {
  return api<ReportTemplate>(`/api/report-templates/${id}`);
}

export function getActiveReportTemplate(reportType = "invoice") {
  return api<ReportTemplate>(`/api/report-templates/active?reportType=${encodeURIComponent(reportType)}`);
}

export function createReportTemplate(body: {
  name: string;
  reportType: string;
  description?: string;
  templateJson?: ReportTemplateJson;
  pageSize?: "A4" | "Letter";
  orientation?: "portrait" | "landscape";
  isActive?: boolean;
}) {
  return api<ReportTemplate>("/api/report-templates", { method: "POST", body: JSON.stringify(body) });
}

export function updateReportTemplate(id: number, body: Partial<{ name: string; description: string; templateJson: ReportTemplateJson; isActive: boolean }>) {
  return api<ReportTemplate>(`/api/report-templates/${id}`, { method: "PUT", body: JSON.stringify(body) });
}

export function duplicateReportTemplate(id: number) {
  return api<ReportTemplate>(`/api/report-templates/${id}/duplicate`, { method: "POST", body: "{}" });
}

export function setActiveReportTemplate(id: number) {
  return api<ReportTemplate>(`/api/report-templates/${id}/set-active`, { method: "POST", body: "{}" });
}

export function deleteReportTemplate(id: number) {
  return api<{ success: boolean }>(`/api/report-templates/${id}`, { method: "DELETE" });
}

export function previewReport(body: {
  reportType?: string;
  templateId?: number;
  templateJson?: ReportTemplateJson;
  documentId?: number;
  designMode?: boolean;
}) {
  return api<{ html: string; data: any }>("/api/reports/preview", { method: "POST", body: JSON.stringify(body) });
}

export function listInvoiceReportTemplates() {
  return api<Array<{ id: number; name: string; isActive: boolean; isSystemTemplate: boolean }>>("/api/reports/invoice-templates");
}

export function getReportCompanyData() {
  return api<{
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
  }>("/api/reports/company-data");
}

export async function generateInvoiceReportPdf(
  invoiceId: number,
  opts?: { returnBase64?: boolean; templateId?: number | null; templateJson?: ReportTemplateJson; filename?: string },
): Promise<string | void> {
  const res = await fetch("/api/reports/generate", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      reportType: "invoice",
      documentId: invoiceId,
      recordId: invoiceId,
      templateId: opts?.templateId || undefined,
      templateJson: opts?.templateJson || undefined,
    }),
  });
  if (!res.ok) {
    let message = "Failed to generate report PDF";
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const base64 = btoa(binary);
  if (opts?.returnBase64) return base64;

  const blob = new Blob([buf], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = opts?.filename || "invoice.pdf";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function generateInvoicePdfSmart(
  invoiceId: number | undefined,
  fallback: () => Promise<string | void>,
  opts?: { returnBase64?: boolean; templateId?: number | null; filename?: string },
): Promise<string | void> {
  if (invoiceId) {
    try {
      return await generateInvoiceReportPdf(invoiceId, opts);
    } catch (err) {
      console.warn("Active report template PDF failed; using built-in invoice layout", err);
    }
  }
  return fallback();
}
