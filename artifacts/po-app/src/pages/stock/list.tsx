import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  useListStockItems,
  useDeleteStockItem,
  getListStockItemsQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Search, Package, Wrench } from "lucide-react";
import { usePagination } from "@/hooks/use-pagination";
import { ListPagination } from "@/components/list-pagination";

export default function StockList() {
  const { canManage } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"" | "product" | "service">("");
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const stockParams = { search: search || undefined, type: typeFilter || undefined } as any;
  const { data: items = [], refetch } = useListStockItems(stockParams, {
    query: { queryKey: getListStockItemsQueryKey(stockParams), refetchOnWindowFocus: false },
  });

  const deleteMutation = useDeleteStockItem();
  const queryClient = useQueryClient();

  function handleDelete() {
    if (!deleteId) return;
    deleteMutation.mutate(
      { id: deleteId },
      {
        onSuccess: () => {
          toast({ title: "Deleted", description: "Stock item deleted." });
          setDeleteId(null);
          refetch();
          void queryClient.invalidateQueries({ queryKey: ["stock-items-picker"] });
        },
        onError: (e: any) =>
          toast({ title: "Error", description: e.message, variant: "destructive" }),
      },
    );
  }

  const filtered = useMemo(() => (items as any[]).filter((item: any) => {
    const matchesSearch =
      !search ||
      item.code.toLowerCase().includes(search.toLowerCase()) ||
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      String(item.batchNo || "")
        .toLowerCase()
        .includes(search.toLowerCase());
    const matchesType = !typeFilter || item.type === typeFilter;
    return matchesSearch && matchesType;
  }), [items, search, typeFilter]);

  const { page, setPage, totalPages, paginatedItems } = usePagination(filtered);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#2563EB]">Stock Items</h1>
          <p className="text-muted-foreground mt-1">Manage your product and service catalogue.</p>
        </div>
        <Button className="gap-2" onClick={() => setLocation("/stock/new")}>
          <Plus className="h-4 w-4" />
          New Item
        </Button>
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by code, name, or batch no..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2">
              {(["", "product", "service"] as const).map((t) => (
                <Button
                  key={t || "all"}
                  variant={typeFilter === t ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTypeFilter(t)}
                >
                  {t === "" ? "All" : t === "product" ? "Products" : "Services"}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {filtered.length} item{filtered.length !== 1 ? "s" : ""}
          </CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-y bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="w-32 px-4 py-3 text-left font-medium">Code</th>
                <th className="px-4 py-3 text-left font-medium">Name</th>
                <th className="w-28 px-4 py-3 text-left font-medium">Batch No</th>
                <th className="w-24 px-4 py-3 text-left font-medium">Type</th>
                <th className="w-32 px-4 py-3 text-left font-medium">Sales Person</th>
                <th className="w-16 px-4 py-3 text-left font-medium">UOM</th>
                <th className="w-28 px-4 py-3 text-right font-medium">Unit Price</th>
                <th className="w-28 px-4 py-3 text-right font-medium">Stock Qty</th>
                <th className="w-20 px-4 py-3 text-center font-medium">Status</th>
                <th className="w-20 px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-muted-foreground">
                    No stock items found. Create your first item.
                  </td>
                </tr>
              ) : (
                paginatedItems.map((item: any) => (
                  <tr key={item.id} className="bg-card transition-colors hover:bg-muted/20">
                    <td className="px-4 py-3 font-mono text-sm font-medium">{item.code}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{item.name}</div>
                      {item.description && (
                        <div className="max-w-xs truncate text-xs text-muted-foreground">
                          {item.description}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-muted-foreground">
                      {item.batchNo || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="gap-1 text-xs font-normal">
                        {item.type === "service" ? (
                          <Wrench className="h-3 w-3" />
                        ) : (
                          <Package className="h-3 w-3" />
                        )}
                        {item.type}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground font-medium">
                      {item.salesPerson || "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{item.uom}</td>
                    <td className="px-4 py-3 text-right font-medium">
                      {parseFloat(item.unitPrice ?? "0").toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={
                          parseFloat(item.stockQty ?? "0") <= 0
                            ? "font-medium text-destructive"
                            : "text-foreground"
                        }
                      >
                        {parseFloat(item.stockQty ?? "0").toFixed(3)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {item.isActive ? (
                        <Badge
                          variant="default"
                          className="bg-emerald-600 text-xs hover:bg-emerald-700"
                        >
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">
                          Inactive
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setLocation(`/stock/${item.id}/edit`)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {canManage && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => setDeleteId(item.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <ListPagination page={page} totalPages={totalPages} onPageChange={setPage} />
      </Card>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Stock Item?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The item will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
