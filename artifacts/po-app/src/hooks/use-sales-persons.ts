import { useState, useEffect, useCallback } from "react";

export type SalesPerson = {
  id: string;
  name: string;
  employmentCode: string;
  /** Present only for records still stored in this browser before they are imported. */
  password?: string;
  hasPassword?: boolean;
  department: string;
  phone: string;
  country: string;
  address: string;
  createdAt: string;
};

const STORAGE_KEY = "bizone_sales_persons_v1";
const IMPORTED_KEY = "bizone_sales_persons_imported_v1";

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

async function readJson(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || data.message || "Request failed");
  }
  return data;
}

export async function fetchSalesPersons(): Promise<SalesPerson[]> {
  const local = getSalesPersons();
  if (local.length && localStorage.getItem(IMPORTED_KEY) !== "1") {
    const imported = await fetch("/api/sales-persons/import", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ persons: local }),
    });
    if (imported.ok) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.setItem(IMPORTED_KEY, "1");
      return readJson(imported);
    }
  }
  const res = await fetch("/api/sales-persons", { credentials: "include" });
  return readJson(res);
}

export async function loginSalesPerson(
  salesPersonId: string,
  password: string,
): Promise<{ ok: true; person: SalesPerson } | { ok: false; error: string }> {
  const code = salesPersonId.trim();
  const pass = password.trim();
  if (!code || !pass) {
    return { ok: false, error: "Sales Person ID and password are required." };
  }
  const res = await fetch("/api/sales-persons/login", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ salesPersonId: code, password: pass }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data.error || "Invalid Sales Person ID or password." };
  return { ok: true, person: data as SalesPerson };
}

export async function createSalesPersonAccount(
  salesPersonId: string,
  password: string,
  confirmPassword: string,
): Promise<{ ok: true; person: SalesPerson } | { ok: false; error: string }> {
  return setSalesPersonPassword(salesPersonId, password, confirmPassword);
}

export async function updateSalesPersonAccount(
  salesPersonId: string,
  password: string,
  confirmPassword: string,
): Promise<{ ok: true; person: SalesPerson } | { ok: false; error: string }> {
  return setSalesPersonPassword(salesPersonId, password, confirmPassword);
}

async function setSalesPersonPassword(
  salesPersonId: string,
  password: string,
  confirmPassword: string,
): Promise<{ ok: true; person: SalesPerson } | { ok: false; error: string }> {
  const id = salesPersonId.trim();
  if (!id || !password.trim() || !confirmPassword.trim()) {
    return { ok: false, error: "Sales person, password, and confirm password are required." };
  }
  const res = await fetch(`/api/sales-persons/${encodeURIComponent(id)}/password`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password, confirmPassword }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data.error || "Could not save the password." };
  return { ok: true, person: data as SalesPerson };
}

/** Browser-tab session for POS employee (clears when app/tab closes). */
export type PosEmployeeSession = {
  id: string;
  name: string;
  employmentCode: string;
};

export const POS_CHANNELS = ["retail", "supermarket", "restaurants", "pharmacy", "electronics"] as const;
export type PosChannel = (typeof POS_CHANNELS)[number];

export const POS_CHANNEL_LABELS: Record<PosChannel, string> = {
  retail: "Retail",
  supermarket: "Supermarket",
  restaurants: "Restaurants",
  pharmacy: "Pharmacy",
  electronics: "Electronics",
};

export function posChannelFromLocation(location: string): PosChannel | null {
  const kind = location.split("?")[0].split("/").filter(Boolean)[1];
  if (location.startsWith("/point-of-sale/") && (POS_CHANNELS as readonly string[]).includes(kind)) {
    return kind as PosChannel;
  }
  return null;
}

const LEGACY_POS_SESSION_KEY = "bizone_pos_employee_session";

function posEmployeeSessionKey(channel: PosChannel) {
  return `${LEGACY_POS_SESSION_KEY}:${channel}`;
}

function parsePosEmployeeSession(raw: string | null): PosEmployeeSession | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.id && parsed?.name && parsed?.employmentCode) return parsed as PosEmployeeSession;
  } catch {}
  return null;
}

/** Older builds stored one login for every POS page. Keep that person on Retail only. */
function claimLegacyRetailSession() {
  const legacy = parsePosEmployeeSession(sessionStorage.getItem(LEGACY_POS_SESSION_KEY));
  if (!legacy) return;
  const retailKey = posEmployeeSessionKey("retail");
  if (!sessionStorage.getItem(retailKey)) {
    sessionStorage.setItem(retailKey, JSON.stringify(legacy));
  }
  sessionStorage.removeItem(LEGACY_POS_SESSION_KEY);
}

export function loadPosEmployeeSession(channel: PosChannel): PosEmployeeSession | null {
  try {
    claimLegacyRetailSession();
    return parsePosEmployeeSession(sessionStorage.getItem(posEmployeeSessionKey(channel)));
  } catch {
    return null;
  }
}

export function savePosEmployeeSession(channel: PosChannel, session: PosEmployeeSession): void {
  try {
    sessionStorage.setItem(posEmployeeSessionKey(channel), JSON.stringify(session));
  } catch {}
  window.dispatchEvent(new CustomEvent("pos-employee-session-updated", { detail: channel }));
}

export function clearPosEmployeeSession(channel: PosChannel): void {
  try {
    sessionStorage.removeItem(posEmployeeSessionKey(channel));
  } catch {}
  window.dispatchEvent(new CustomEvent("pos-employee-session-updated", { detail: channel }));
}

export async function saveSalesPerson(
  person: Omit<SalesPerson, "id" | "createdAt"> & { id?: string; password?: string },
): Promise<SalesPerson> {
  const payload = {
    name: person.name,
    employmentCode: person.employmentCode,
    password: person.password || "",
    department: person.department,
    phone: person.phone,
    country: person.country,
    address: person.address,
  };
  const res = await fetch(person.id ? `/api/sales-persons/${encodeURIComponent(person.id)}` : "/api/sales-persons", {
    method: person.id ? "PUT" : "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return readJson(res);
}

export async function deleteSalesPerson(id: string): Promise<void> {
  const res = await fetch(`/api/sales-persons/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "include",
  });
  await readJson(res);
}

export function useSalesPersons() {
  const [salesPersons, setSalesPersons] = useState<SalesPerson[]>([]);

  const reload = useCallback(async () => {
    const rows = await fetchSalesPersons();
    setSalesPersons(rows);
    return rows;
  }, []);

  useEffect(() => {
    let cancel = false;
    fetchSalesPersons()
      .then((rows) => {
        if (!cancel) setSalesPersons(rows);
      })
      .catch(() => {
        if (!cancel) setSalesPersons(getSalesPersons());
      });
    return () => {
      cancel = true;
    };
  }, []);

  return {
    salesPersons,
    reload,
    saveSalesPerson: async (person: Parameters<typeof saveSalesPerson>[0]) => {
      const saved = await saveSalesPerson(person);
      await reload();
      return saved;
    },
    deleteSalesPerson: async (id: string) => {
      await deleteSalesPerson(id);
      await reload();
    },
  };
}
