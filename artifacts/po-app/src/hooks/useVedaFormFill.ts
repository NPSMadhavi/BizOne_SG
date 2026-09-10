import { useEffect } from "react";
import type { UseFormReturn } from "react-hook-form";

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
  nric_number: "nricNumber",
  passport_expiry: "passportExpiry",
  visa_expiry: "visaExpiry",
  nric_expiry: "nricExpiry",
  annual_salary: "annualSalary",
  customer_name: "name",
  vendor_name: "name",
  contact: "contactPerson",
  contact_person: "contactPerson",
  contact_email: "contactEmail",
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
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? value : d;
    }
  }
  if (key === "salary" || key === "annualSalary") {
    return String(value);
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
  return out;
}

export function useVedaFormFill(form: UseFormReturn<any>) {
  useEffect(() => {
    const handler = (e: Event) => {
      const fields = (e as CustomEvent<Record<string, unknown>>).detail;
      if (!fields || typeof fields !== "object") return;
      const normalized = normalizeFields(fields);
      Object.entries(normalized).forEach(([key, value]) => {
        form.setValue(key as any, value as any, {
          shouldDirty: true,
          shouldTouch: true,
          shouldValidate: true,
        });
      });
    };
    window.addEventListener("veda:fill-form", handler);
    return () => window.removeEventListener("veda:fill-form", handler);
  }, [form]);
}
