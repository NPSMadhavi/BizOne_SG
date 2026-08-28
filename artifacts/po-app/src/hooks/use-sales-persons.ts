import { useState, useEffect } from "react";

export type SalesPerson = {
  id: string;
  name: string;
  employmentCode: string;
  department: string;
  phone: string;
  country: string;
  address: string;
  createdAt: string;
};

const STORAGE_KEY = "bizone_sales_persons_v1";

const defaultSalesPersons: SalesPerson[] = [
  {
    id: "sp-1",
    name: "John Tan",
    employmentCode: "EMP-1001",
    department: "Sales & Marketing",
    phone: "+65 9123 4567",
    country: "Singapore",
    address: "10 Anson Road, International Plaza, Singapore 079903",
    createdAt: "2026-04-01",
  },
  {
    id: "sp-2",
    name: "Sarah Lim",
    employmentCode: "EMP-1002",
    department: "Corporate Sales",
    phone: "+65 9876 5432",
    country: "Singapore",
    address: "20 Orchard Road, Singapore 238888",
    createdAt: "2026-04-01",
  },
];

export function getSalesPersons(): SalesPerson[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return defaultSalesPersons;
}

export function saveSalesPerson(person: Omit<SalesPerson, "id" | "createdAt"> & { id?: string }): SalesPerson[] {
  const current = getSalesPersons();
  let updated: SalesPerson[];
  if (person.id) {
    updated = current.map((p) => (p.id === person.id ? { ...p, ...person } : p));
  } else {
    const newPerson: SalesPerson = {
      ...person,
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
