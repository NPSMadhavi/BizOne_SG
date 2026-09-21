import { useState, useEffect } from "react";

export type SalesPerson = {
  id: string;
  name: string;
  employmentCode: string;
  /** POS Employee Login password */
  password: string;
  department: string;
  phone: string;
  country: string;
  address: string;
  createdAt: string;
};

const STORAGE_KEY = "bizone_sales_persons_v1";

export function getSalesPersons(): SalesPerson[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data !== null) {
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        return parsed.map((p: any) => ({
          ...p,
          password: typeof p.password === "string" ? p.password : "",
        }));
      }
    }
  } catch {}
  return [];
}

export function findSalesPersonByLogin(employeeId: string, password: string): SalesPerson | null {
  const id = employeeId.trim().toLowerCase();
  const pass = password.trim();
  if (!id || !pass) return null;
  return (
    getSalesPersons().find(
      (p) =>
        p.employmentCode.trim().toLowerCase() === id &&
        (p.password || "").trim() === pass,
    ) || null
  );
}

export function findSalesPersonByCode(employeeId: string): SalesPerson | null {
  const id = employeeId.trim().toLowerCase();
  if (!id) return null;
  return getSalesPersons().find((p) => p.employmentCode.trim().toLowerCase() === id) || null;
}

/** Login with Employee ID + password. If ID does not exist yet, create and log in. */
export function loginOrCreateSalesPerson(
  employeeId: string,
  password: string,
): { ok: true; person: SalesPerson; created: boolean } | { ok: false; error: string } {
  const code = employeeId.trim();
  const pass = password.trim();
  if (!code || !pass) {
    return { ok: false, error: "Employee ID and password are required." };
  }

  const existing = findSalesPersonByCode(code);
  if (existing) {
    if ((existing.password || "").trim() !== pass) {
      // First-time records may have empty password — set it on first successful login attempt
      if (!(existing.password || "").trim()) {
        const updated = saveSalesPerson({
          ...existing,
          id: existing.id,
          password: pass,
        });
        const person = updated.find((p) => p.id === existing.id) || { ...existing, password: pass };
        return { ok: true, person, created: false };
      }
      return { ok: false, error: "Invalid Employee ID or password." };
    }
    return { ok: true, person: existing, created: false };
  }

  const list = saveSalesPerson({
    name: code,
    employmentCode: code,
    password: pass,
    department: "POS",
    phone: "",
    country: "Singapore",
    address: "",
  });
  const person = list.find((p) => p.employmentCode.trim().toLowerCase() === code.toLowerCase());
  if (!person) {
    return { ok: false, error: "Could not create employee. Try again." };
  }
  return { ok: true, person, created: true };
}

/** Browser-tab session for POS employee (clears when app/tab closes). */
export type PosEmployeeSession = {
  id: string;
  name: string;
  employmentCode: string;
};

const POS_EMP_SESSION_KEY = "bizone_pos_employee_session";

export function loadPosEmployeeSession(): PosEmployeeSession | null {
  try {
    const raw = sessionStorage.getItem(POS_EMP_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.id && parsed?.name && parsed?.employmentCode) return parsed as PosEmployeeSession;
  } catch {}
  return null;
}

export function savePosEmployeeSession(session: PosEmployeeSession): void {
  try {
    sessionStorage.setItem(POS_EMP_SESSION_KEY, JSON.stringify(session));
  } catch {}
  window.dispatchEvent(new Event("pos-employee-session-updated"));
}

export function clearPosEmployeeSession(): void {
  try {
    sessionStorage.removeItem(POS_EMP_SESSION_KEY);
  } catch {}
  window.dispatchEvent(new Event("pos-employee-session-updated"));
}

export function saveSalesPerson(person: Omit<SalesPerson, "id" | "createdAt"> & { id?: string; password?: string }): SalesPerson[] {
  const current = getSalesPersons();
  let updated: SalesPerson[];
  if (person.id) {
    updated = current.map((p) => {
      if (p.id !== person.id) return p;
      const nextPassword =
        person.password != null && String(person.password).trim() !== ""
          ? String(person.password).trim()
          : p.password || "";
      return { ...p, ...person, password: nextPassword };
    });
  } else {
    const newPerson: SalesPerson = {
      name: person.name,
      employmentCode: person.employmentCode,
      password: (person.password || "").trim(),
      department: person.department,
      phone: person.phone,
      country: person.country,
      address: person.address,
      id: `sp-${Date.now()}`,
      createdAt: new Date().toISOString().split("T")[0],
    };
    updated = [newPerson, ...current];
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {}
  window.dispatchEvent(new Event("sales-persons-updated"));
  return updated;
}

export function deleteSalesPerson(id: string): SalesPerson[] {
  const current = getSalesPersons();
  const updated = current.filter((p) => p.id !== id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {}
  window.dispatchEvent(new Event("sales-persons-updated"));
  return updated;
}

export function useSalesPersons() {
  const [salesPersons, setSalesPersons] = useState<SalesPerson[]>(getSalesPersons);

  useEffect(() => {
    const handleUpdate = () => {
      setSalesPersons(getSalesPersons());
    };
    window.addEventListener("sales-persons-updated", handleUpdate);
    window.addEventListener("storage", handleUpdate);
    return () => {
      window.removeEventListener("sales-persons-updated", handleUpdate);
      window.removeEventListener("storage", handleUpdate);
    };
  }, []);

  return {
    salesPersons,
    saveSalesPerson,
    deleteSalesPerson,
  };
}
