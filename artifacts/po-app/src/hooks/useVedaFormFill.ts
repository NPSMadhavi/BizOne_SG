import { useEffect } from "react";
import type { UseFormReturn } from "react-hook-form";
import { parseSingaporePhoneDigits } from "@/lib/singapore-phone";
import { normalizeCurrency } from "@/lib/currencies";

const PENDING_KEY = "__vedaPendingFormFill";

/** Common aliases the model may send instead of RHF field names. */
const FIELD_ALIASES: Record<string, string> = {
  customer: "customerName",
  client: "customerName",
  client_name: "customerName",
  clientName: "customerName",
  customer_name: "customerName",
  vendor: "vendorName",
  supplier: "vendorName",
  supplier_name: "vendorName",
  supplierName: "vendorName",
  vendor_name: "vendorName",
  contact: "contactPerson",
  contact_person: "contactPerson",
  contact_email: "contactEmail",
  customer_address: "customerAddress",
  customer_contact: "customerContact",
  customer_contact_email: "customerContactEmail",
  payment_terms: "paymentTerms",
  payment_term: "paymentTerms",
  paymentTerm: "paymentTerms",
  terms: "paymentTerms",
  delivery_date: "deliveryDate",
  delivery_address: "deliveryAddress",
  deliveryAddress: "deliveryAddress",
  ship_to_address: "shipToAddress",
  shipping_address: "shipToAddress",
  shippingAddress: "shipToAddress",
  shipTo: "shipToAddress",
  ship_to: "shipToAddress",
  po_ref_no: "poRefNo",
  po_number: "poRefNo",
  poNumber: "poRefNo",
  po_no: "poRefNo",
  poNo: "poRefNo",
  poRef: "poRefNo",
  reference: "poRefNo",
  refNo: "poRefNo",
  invoice_date: "issueDate",
  invoiceDate: "issueDate",
  order_date: "issueDate",
  orderDate: "issueDate",
  date: "issueDate",
  note: "notes",
  customer_note: "customerNote",
  customer_notes: "customerNote",
  customerNote: "customerNote",
  delivery_instructions: "deliveryInstructions",
  deliveryInstructions: "deliveryInstructions",
  terms_and_conditions: "termsAndConditions",
  termsAndConditions: "termsAndConditions",
  quotation_terms: "quotationTerms",
  unit_price: "unitPrice",
  postal_code: "postalCode",
  gst_registered: "gstRegistered",
  gst_no: "gstNo",
  is_active: "isActive",

  // Employee fields
  employee_id: "employeeId",
  employee_code: "employeeId",
  empId: "employeeId",
  emp_id: "employeeId",
  fullName: "name",
  full_name: "name",
  employeeName: "name",
  employee_name: "name",
  dept: "department",
  jobTitle: "designation",
  job_title: "designation",
  title: "designation",
  joiningDate: "joinDate",
  joining_date: "joinDate",
  date_of_joining: "joinDate",
  dob: "dateOfBirth",
  date_of_birth: "dateOfBirth",
  mobile: "phone",
  mobileNumber: "phone",
  phoneNumber: "phone",
  phone_number: "phone",
  mail: "email",
  emailAddress: "email",
  email_address: "email",
  pr_status: "prStatus",
  visa_type: "visaType",
  passport_number: "passportNumber",
  visa_number: "visaNumber",
  visaPermitNumber: "visaNumber",
  visa_permit_number: "visaNumber",
  nric_number: "nricNumber",
  passport_expiry: "passportExpiry",
  visa_expiry: "visaExpiry",
  nric_expiry: "nricExpiry",
  annual_salary: "annualSalary",
  monthlySalary: "salary",
  monthly_salary: "salary",
};

const DATE_KEYS = new Set([
  "joinDate",
  "dateOfBirth",
  "passportExpiry",
  "visaExpiry",
  "nricExpiry",
  "deliveryDate",
  "issueDate",
  "purchaseDate",
  "warrantyExpiry",
  "expiryDate",
]);

function coerceValue(key: string, value: unknown): unknown {
  if (value == null || value === "") return value;
  if (DATE_KEYS.has(key) || /(?:Date|Expiry)$/.test(key)) {
    if (value instanceof Date) return value;
    if (typeof value === "string") {
      if (/^\d{4}-\d{2}-\d{2}/.test(value.trim())) return value.trim().slice(0, 10);
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return value;
      if (key === "deliveryDate" || key === "issueDate" || key === "validUntil") {
        return d.toISOString().slice(0, 10);
      }
      return d;
    }
  }
  if (key === "currency") {
    return normalizeCurrency(value);
  }
  if (key === "phone" && typeof value === "string") {
    return parseSingaporePhoneDigits(value);
  }
  if (key === "salary" || key === "annualSalary") {
    if (typeof value === "number") return String(value);
    if (typeof value === "string") return value.replace(/[^\d.]/g, "") || value;
    return String(value);
  }
  if (key === "status" && typeof value === "string") {
    const t = value.trim().toLowerCase().replace(/\s+/g, "_");
    if (t.startsWith("active")) return "active";
    if (t.includes("resign")) return "resigned";
    if (t.includes("hold")) return "on_hold";
    if (t.includes("termin")) return "terminated";
    return t;
  }
  if (key === "nationality" && typeof value === "string") {
    const t = value.trim().toLowerCase();
    if (/^pr\b|permanent\s*resident/.test(t)) return "PR";
    if (/foreign|work\s*pass/.test(t)) return "Foreigner";
    if (/singapore|citizen|^sg$/.test(t)) return "Singapore";
    return value.trim();
  }
  if (key === "tax" && typeof value === "string") {
    const num = parseFloat(value.replace(/[^\d.]/g, ""));
    return Number.isFinite(num) ? num : value;
  }
  if (key === "discountAmount" && typeof value === "string") {
    const num = parseFloat(value.replace(/[^\d.]/g, ""));
    return Number.isFinite(num) ? num : value;
  }
  if (key === "gstRegistered" || key === "isActive") {
    if (typeof value === "string") {
      const t = value.toLowerCase();
      if (["true", "yes", "1", "y"].includes(t)) return true;
      if (["false", "no", "0", "n"].includes(t)) return false;
    }
  }
  return value;
}

function normalizeFields(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [rawKey, rawVal] of Object.entries(fields)) {
    const key = FIELD_ALIASES[rawKey] || FIELD_ALIASES[rawKey.replace(/([A-Z])/g, "_$1").toLowerCase()] || rawKey;
    out[key] = coerceValue(key, rawVal);
  }
  if (out.salary != null && out.salary !== "" && (out.annualSalary == null || out.annualSalary === "")) {
    const n = parseFloat(String(out.salary));
    if (Number.isFinite(n)) out.annualSalary = (n * 12).toFixed(2);
  }
  return out;
}

function applyFields(form: UseFormReturn<any>, fields: Record<string, unknown>) {
  const normalized = normalizeFields(fields);

  // 1. Direct form fields
  Object.entries(normalized).forEach(([key, value]) => {
    if (key === "items" || key === "item" || key === "lineItem" || key === "lineItems") return;
    try {
      form.setValue(key as any, value as any, {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
    } catch {
      // ignore
    }
  });

  // 2. Line item handling for document forms (invoices, sales orders, purchase orders, quotations, etc.)
  const currentItems = form.getValues("items");
  if (Array.isArray(currentItems)) {
    // If incoming payload has an items array
    if (Array.isArray(normalized.items)) {
      const updated = normalized.items.map((it: any, idx: number) => {
        const base = currentItems[idx] || currentItems[0] || {};
        return {
          ...base,
          type: it.type || base.type || "item",
          description: String(it.description || it.name || it.item || base.description || ""),
          qty: Number(it.qty ?? it.quantity ?? base.qty ?? 1),
          unitPrice: Number(it.unitPrice ?? it.price ?? it.rate ?? base.unitPrice ?? 0),
          discount: Number(it.discount ?? base.discount ?? 0),
          uom: String(it.uom || base.uom || "Pcs"),
        };
      });
      form.setValue("items" as any, updated as any, {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
    } else if (normalized.description || normalized.item || normalized.itemName) {
      // Single line item provided directly as top-level fields
      const desc = String(normalized.description || normalized.item || normalized.itemName || "");
      const qty = Number(normalized.qty ?? normalized.quantity ?? 1);
      const price = Number(normalized.unitPrice ?? normalized.price ?? normalized.rate ?? 0);
      const itemsCopy = [...currentItems];

      // If first row is blank, replace it; otherwise append
      const firstRow = itemsCopy[0];
      const isFirstBlank = firstRow && !firstRow.description?.trim() && (!firstRow.unitPrice || firstRow.unitPrice === 0);

      if (isFirstBlank) {
        itemsCopy[0] = {
          ...firstRow,
          description: desc,
          qty: qty || firstRow.qty || 1,
          unitPrice: price || firstRow.unitPrice || 0,
        };
      } else {
        itemsCopy.push({
          ...(firstRow || {}),
          type: "item",
          sectionLabel: "",
          partNumber: "",
          description: desc,
          qty: qty || 1,
          uom: "Pcs",
          unitPrice: price || 0,
          discount: 0,
          isFoc: false,
          isStockItem: false,
          selectedSerials: [],
          selectedSerialIds: [],
          itemImage: "",
        });
      }
      form.setValue("items" as any, itemsCopy as any, {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
    }
  }

  // 3. Auto-enrich directory contact details if customerName or vendorName was filled
  const targetPartyName = normalized.customerName || normalized.vendorName;
  const partyType = normalized.customerName ? "customer" : normalized.vendorName ? "vendor" : null;
  if (typeof targetPartyName === "string" && targetPartyName.trim() && partyType) {
    void fetch(`/api/contacts?type=${partyType}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then((contacts: any[]) => {
        const query = targetPartyName.trim().toLowerCase();
        const match = contacts.find((c: any) =>
          c.name?.toLowerCase() === query || c.name?.toLowerCase().includes(query)
        );
        if (match) {
          window.dispatchEvent(new CustomEvent("veda:select-contact", {
            detail: { type: partyType, contact: match },
          }));
          if (partyType === "customer") {
            if (match.address && !form.getValues("customerAddress")) form.setValue("customerAddress" as any, match.address, { shouldDirty: true });
            if (match.contact && !form.getValues("customerContact")) form.setValue("customerContact" as any, match.contact, { shouldDirty: true });
            if (match.email && !form.getValues("customerContactEmail")) form.setValue("customerContactEmail" as any, match.email, { shouldDirty: true });
          } else {
            if (match.address && !form.getValues("vendorAddress")) form.setValue("vendorAddress" as any, match.address, { shouldDirty: true });
            if (match.contact && !form.getValues("vendorContact")) form.setValue("vendorContact" as any, match.contact, { shouldDirty: true });
            if (match.email && !form.getValues("vendorContactEmail")) form.setValue("vendorContactEmail" as any, match.email, { shouldDirty: true });
          }
        }
      })
      .catch(() => {});
  }

  queuePending(normalized);
}

function queuePending(fields: Record<string, unknown>) {
  const prev = ((window as any)[PENDING_KEY] as Record<string, unknown> | undefined) || {};
  (window as any)[PENDING_KEY] = { ...prev, ...fields };
}

function takePending(): Record<string, unknown> | null {
  const pending = (window as any)[PENDING_KEY] as Record<string, unknown> | undefined;
  if (!pending || typeof pending !== "object") return null;
  return { ...pending };
}

export function useVedaFormFill(form: UseFormReturn<any>) {
  useEffect(() => {
    const apply = (fields: Record<string, unknown>) => {
      if (!fields || typeof fields !== "object") return;
      try {
        applyFields(form, fields);
      } catch {
        queuePending(fields);
      }
    };

    const handler = (e: Event) => {
      const fields = (e as CustomEvent<Record<string, unknown>>).detail;
      apply(fields);
    };

    const flush = () => {
      const pending = takePending();
      if (pending) apply(pending);
    };

    window.addEventListener("veda:fill-form", handler);
    window.addEventListener("veda:fill-form-flush", flush);

    // Flush anything that arrived before this form mounted (navigate race)
    flush();
    const t1 = window.setTimeout(flush, 100);
    const t2 = window.setTimeout(flush, 400);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.removeEventListener("veda:fill-form", handler);
      window.removeEventListener("veda:fill-form-flush", flush);
    };
  }, [form]);
}

/** Call from agent panel when no form listener is ready yet. */
export function queueVedaFormFill(fields: Record<string, unknown>) {
  queuePending(fields);
  window.dispatchEvent(new CustomEvent("veda:fill-form", { detail: fields }));
}

export function clearVedaFormFillQueue() {
  (window as any)[PENDING_KEY] = null;
}
