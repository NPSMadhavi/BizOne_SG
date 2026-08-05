const BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed (${res.status})`);
  }
  return res.json();
}

export const inventoryApi = {
  getDashboard: () => request<any>("/inventory/dashboard"),
  getWarehouses: (search?: string) => request<any[]>(`/warehouses${search ? `?search=${encodeURIComponent(search)}` : ""}`),
  createWarehouse: (data: any) => request<any>("/warehouses", { method: "POST", body: JSON.stringify(data) }),
  updateWarehouse: (id: number, data: any) => request<any>(`/warehouses/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteWarehouse: (id: number) => request<any>(`/warehouses/${id}`, { method: "DELETE" }),

  getOpeningStock: () => request<any[]>("/opening-stock"),
  createOpeningStock: (data: any) => request<any>("/opening-stock", { method: "POST", body: JSON.stringify(data) }),
  deleteOpeningStock: (id: number) => request<any>(`/opening-stock/${id}`, { method: "DELETE" }),

  getGoodsReceipts: () => request<any[]>("/inventory/goods-receipts"),
  createGoodsReceipt: (data: any) => request<any>("/inventory/goods-receipts", { method: "POST", body: JSON.stringify(data) }),

  getGoodsIssues: () => request<any[]>("/inventory/goods-issues"),
  createGoodsIssue: (data: any) => request<any>("/inventory/goods-issues", { method: "POST", body: JSON.stringify(data) }),

  getTransfers: () => request<any[]>("/inventory/stock-transfers"),
  createTransfer: (data: any) => request<any>("/inventory/stock-transfers", { method: "POST", body: JSON.stringify(data) }),

  getAdjustments: () => request<any[]>("/inventory/stock-adjustments"),
  createAdjustment: (data: any) => request<any>("/inventory/stock-adjustments", { method: "POST", body: JSON.stringify(data) }),

  getMovements: (params?: Record<string, string>) => {
    const q = params ? "?" + new URLSearchParams(params).toString() : "";
    return request<any[]>(`/inventory/movements${q}`);
  },
  getLedger: (params?: Record<string, string>) => {
    const q = params ? "?" + new URLSearchParams(params).toString() : "";
    return request<any[]>(`/inventory/ledger${q}`);
  },
  getCurrentStockReport: (warehouseId?: number) =>
    request<any[]>(`/inventory/reports/current-stock${warehouseId ? `?warehouseId=${warehouseId}` : ""}`),
  search: (q: string) => request<any>(`/inventory/search?q=${encodeURIComponent(q)}`),
};

export function exportCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(","), ...rows.map(r => headers.map(h => JSON.stringify(r[h] ?? "")).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
