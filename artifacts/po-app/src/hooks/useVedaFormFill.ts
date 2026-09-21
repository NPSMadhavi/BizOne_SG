import { useEffect } from "react";
import type { UseFormReturn } from "react-hook-form";
import { parseSingaporePhoneDigits } from "@/lib/singapore-phone";

const PENDING_KEY = "__vedaPendingFormFill";

/** Common aliases the model may send instead of RHF field names. */
const FIELD_ALIASES: Record<string, string> = {
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
  customer_name: "customerName",
  vendor_name: "vendorName",
  contact: "contactPerson",
  contact_person: "contactPerson",
  contact_email: "contactEmail",
  customer_address: "customerAddress",
  customer_contact: "customerContact",
  customer_contact_email: "customerContactEmail",
  payment_terms: "paymentTerms",
  delivery_date: "deliveryDate",
  unit_price: "unitPrice",
  postal_code: "postalCode",
  gst_registered: "gstRegistered",
  gst_no: "gstNo",
  ship_to_address: "shipToAddress",
  quotation_terms: "quotationTerms",
  is_active: "isActive",
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
      // Keep ISO date strings for native date / delivery fields (not Date objects)
      if (/^\d{4}-\d{2}-\d{2}/.test(value.trim())) return value.trim().slice(0, 10);
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return value;
      // Employee form date pickers expect Date; document forms prefer ISO string
      if (key === "deliveryDate" || key === "issueDate" || key === "validUntil") {
        return d.toISOString().slice(0, 10);
      }
      return d;
    }
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
  Object.entries(normalized).forEach(([key, value]) => {
    form.setValue(key as any, value as any, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: false,
    });
  });
  // Keep a sticky merge so React Strict Mode remount / late form mount can re-apply
  queuePending(normalized);
}

function queuePending(fields: Record<string, unknown>) {
  const prev = ((window as any)[PENDING_KEY] as Record<string, unknown> | undefined) || {};
  (window as any)[PENDING_KEY] = { ...prev, ...fields };
}

function takePending(): Record<string, unknown> | null {
  const pending = (window as any)[PENDING_KEY] as Record<string, unknown> | undefined;
  if (!pending || typeof pending !== "object") return null;
  // Do not clear — remounts (Strict Mode) need the same snapshot
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
    // Retry shortly — form reset / Strict Mode remount often races the first fill
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
