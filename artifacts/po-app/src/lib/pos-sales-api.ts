export type PosSalePayload = {
  id: string;
  posNumber: string;
  createdAt: string;
  channel?: string;
  salesPerson?: string;
  salesPersonId?: string;
  createdByUserId?: number;
  [key: string]: unknown;
};

const LOCAL_KEY = "pos-sales-v1";
const IMPORTED_KEY = "pos-sales-v1-imported";

function readLocalSales(): PosSalePayload[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function readJson(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || "Could not save the POS sale");
  return data;
}

export async function loadPosSalesFromServer(channel?: string | null, scope?: "all"): Promise<PosSalePayload[]> {
  const local = readLocalSales();
  if (local.length && localStorage.getItem(IMPORTED_KEY) !== "1") {
    const imported = await fetch("/api/pos-sales/import", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sales: local.map((sale) => ({ ...sale, channel: sale.channel || "retail" })),
      }),
    });
    if (imported.ok) {
      localStorage.removeItem(LOCAL_KEY);
      localStorage.setItem(IMPORTED_KEY, "1");
    }
  }
  const query = new URLSearchParams();
  if (channel) query.set("channel", channel);
  if (scope) query.set("scope", scope);
  const qs = query.toString();
  const res = await fetch(`/api/pos-sales${qs ? `?${qs}` : ""}`, { credentials: "include" });
  const data = await readJson(res);
  return Array.isArray(data) ? data : [];
}

export async function createPosSale(sale: PosSalePayload): Promise<PosSalePayload> {
  const res = await fetch("/api/pos-sales", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sale),
  });
  return readJson(res);
}

export async function updatePosSale(sale: PosSalePayload): Promise<PosSalePayload> {
  const res = await fetch(`/api/pos-sales/${encodeURIComponent(sale.id)}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sale),
  });
  return readJson(res);
}

export async function deletePosSale(id: string): Promise<void> {
  const res = await fetch(`/api/pos-sales/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "include",
  });
  await readJson(res);
}
