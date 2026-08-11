import type { QueryClient } from "@tanstack/react-query";

/** Shared React Query keys for live warehouse inventory (Tax Invoice / GRN). */
export const inventoryQueryKeys = {
  all: ["inventory"] as const,
  currentStock: ["inventory", "current-stock"] as const,
  dashboard: ["inventory", "dashboard"] as const,
  warehouses: ["inventory", "warehouses"] as const,
  stockTransfers: ["inventory", "stock-transfers"] as const,
  stockActivity: ["inventory", "stock-activity"] as const,
  warehouseStock: (stockItemId?: number) =>
    ["invoice-warehouse-stock", stockItemId] as const,
};

/** Call after Tax Invoice / GRN / Opening Stock / Stock Transfer changes qty. */
export async function invalidateInventoryQueries(queryClient: QueryClient): Promise<void> {
  queryClient.removeQueries({ queryKey: inventoryQueryKeys.currentStock });
  queryClient.removeQueries({ queryKey: inventoryQueryKeys.dashboard });
  queryClient.removeQueries({ queryKey: inventoryQueryKeys.stockTransfers });
  queryClient.removeQueries({ queryKey: inventoryQueryKeys.stockActivity });
  queryClient.removeQueries({ queryKey: ["invoice-warehouse-stock"] });
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.all, refetchType: "all" }),
    queryClient.invalidateQueries({ queryKey: ["stock-items"], refetchType: "all" }),
    queryClient.invalidateQueries({ queryKey: ["stock-items-picker"], refetchType: "all" }),
    queryClient.invalidateQueries({ queryKey: ["invoice-warehouses"], refetchType: "all" }),
    queryClient.invalidateQueries({ queryKey: ["invoice-warehouse-stock"], refetchType: "all" }),
  ]);
}
