import { useQuery } from "@tanstack/react-query";
import {
  useGetPurchaseOrderStats, getGetPurchaseOrderStatsQueryKey,
  useGetQuotationStats, getGetQuotationStatsQueryKey,
  useGetInvoiceStats, getGetInvoiceStatsQueryKey,
  useListPurchaseOrders, getListPurchaseOrdersQueryKey,
  useListInvoices, getListInvoicesQueryKey,
  useListQuotations, getListQuotationsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  FileText, CheckCircle2, Clock, DollarSign, Receipt, FileSpreadsheet,
  Truck, Package, TrendingUp, AlertTriangle, ShoppingCart,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fmtDate } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";

function StatCard({
  title, value, icon: Icon, iconClass = "text-primary", loading, sub,
}: {
  title: string; value: string | number; icon: React.ElementType;
  iconClass?: string; loading?: boolean; sub?: string;
}) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 px-5 pt-5">
        <CardTitle className="text-sm xl:text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={`h-5 w-5 ${iconClass}`} />
      </CardHeader>
      <CardContent className="px-5 pb-5">
        {loading ? (
          <Skeleton className="h-9 w-28" />
        ) : (
          <>
            <div className="text-2xl xl:text-3xl font-bold tracking-tight">{value}</div>
            {sub && <p className="text-xs xl:text-sm text-muted-foreground mt-1">{sub}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ModuleSummaryCard({
  title, icon: Icon, iconBg, stats, loading, href,
}: {
  title: string; icon: React.ElementType; iconBg: string;
  stats?: { total: number; confirmed: number; draft: number; cancelled?: number; totalValue?: number };
  loading?: boolean; href: string;
}) {
  const fmt = (v: number) => new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD", maximumFractionDigits: 0 }).format(v);
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="pt-5 pb-5 px-5">
        <div className="flex items-start justify-between mb-4">
          <div className={`p-2.5 rounded-lg ${iconBg}`}>
            <Icon className="h-5 w-5 text-white" />
          </div>
          <Link href={href}>
            <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-primary px-2">
              View all →
            </Button>
          </Link>
        </div>
        <p className="text-sm xl:text-base font-semibold text-foreground mb-3">{title}</p>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : stats ? (
          <div className="space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total</span>
              <span className="font-semibold">{stats.total}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Confirmed</span>
              <span className="font-semibold text-emerald-600">{stats.confirmed}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Drafts</span>
              <span className="font-semibold text-amber-600">{stats.draft}</span>
            </div>
            {stats.totalValue !== undefined && (
              <div className="flex justify-between text-sm pt-2 border-t border-border/50 mt-2">
                <span className="text-muted-foreground">Total Value</span>
                <span className="font-semibold text-xs xl:text-sm">{fmt(stats.totalValue)}</span>
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No data available</p>
        )}
      </CardContent>
    </Card>
  );
}

function getStatusBadge(status: string) {
  switch (status) {
    case "confirmed": return <Badge className="bg-emerald-600 hover:bg-emerald-700 text-xs py-0">Confirmed</Badge>;
    case "draft": return <Badge variant="secondary" className="text-xs py-0">Draft</Badge>;
    case "cancelled": return <Badge variant="destructive" className="text-xs py-0">Cancelled</Badge>;
    case "void": return <Badge variant="outline" className="text-xs py-0 border-red-300 text-red-600">Void</Badge>;
    case "paid": return <Badge className="bg-blue-600 hover:bg-blue-700 text-xs py-0">Paid</Badge>;
    default: return <Badge variant="outline" className="text-xs py-0">{status}</Badge>;
  }
}

export default function Dashboard() {
  const { selectedCompany } = useAuth();

  const { data: poStats, isLoading: poStatsLoading } = useGetPurchaseOrderStats({
    query: { queryKey: getGetPurchaseOrderStatsQueryKey() },
  });
  const { data: qtStats, isLoading: qtStatsLoading } = useGetQuotationStats({
    query: { queryKey: getGetQuotationStatsQueryKey() },
  });
  const { data: invStats, isLoading: invStatsLoading } = useGetInvoiceStats({
    query: { queryKey: getGetInvoiceStatsQueryKey() },
  });
  const { data: doStats, isLoading: doStatsLoading } = useQuery({
    queryKey: ["delivery-orders-stats"],
    queryFn: async () => {
      const res = await fetch("/api/delivery-orders/stats", { credentials: "include" });
      if (!res.ok) return null;
      return res.json() as Promise<{ total: number; confirmed: number; draft: number; cancelled: number; totalValue: number }>;
    },
  });
  const { data: stockItems, isLoading: stockLoading } = useQuery({
    queryKey: ["stock-items-dashboard"],
    queryFn: async () => {
      const res = await fetch("/api/stock-items", { credentials: "include" });
      if (!res.ok) return [];
      return res.json() as Promise<{ id: number; name: string; stockQty: string; uom: string }[]>;
    },
  });

  const { data: recentInvoices, isLoading: invLoading } = useListInvoices({
    query: { queryKey: getListInvoicesQueryKey() },
  });
  const { data: recentPOs, isLoading: posLoading } = useListPurchaseOrders({
    query: { queryKey: getListPurchaseOrdersQueryKey() },
  });
  const { data: recentQuotations, isLoading: qtLoading } = useListQuotations({
    query: { queryKey: getListQuotationsQueryKey() },
  });

  const fmt = (v: number) => new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD" }).format(v);

  const totalInvoiceRevenue = (invStats as any)?.confirmedValue ?? invStats?.totalValue ?? 0;
  const pendingDrafts = (poStats?.draft ?? 0) + (qtStats?.draft ?? 0) + (invStats?.draft ?? 0) + (doStats?.draft ?? 0);
  const stockTotal = stockItems?.length ?? 0;
  const lowStockCount = stockItems?.filter(i => Number(i.stockQty) <= 5 && Number(i.stockQty) >= 0).length ?? 0;

  return (
    <div className="space-y-6 xl:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl xl:text-4xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm xl:text-base mt-1">
            Overview for {selectedCompany?.name ?? "your company"}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link href="/invoices/new">
            <Button size="sm" className="gap-1.5 xl:h-9 xl:px-4 xl:text-sm">
              <Receipt className="h-3.5 w-3.5 xl:h-4 xl:w-4" />
              New Invoice
            </Button>
          </Link>
          <Link href="/purchase-orders/new">
            <Button size="sm" variant="outline" className="gap-1.5 xl:h-9 xl:px-4 xl:text-sm">
              <FileText className="h-3.5 w-3.5 xl:h-4 xl:w-4" />
              New PO
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid gap-4 xl:gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Invoice Revenue"
          value={fmt(totalInvoiceRevenue)}
          icon={TrendingUp}
          iconClass="text-emerald-600"
          loading={invStatsLoading}
          sub="Confirmed invoices"
        />
        <StatCard
          title="PO Spend"
          value={fmt(poStats?.totalValue ?? 0)}
          icon={ShoppingCart}
          iconClass="text-blue-600"
          loading={poStatsLoading}
          sub="Confirmed purchase orders"
        />
        <StatCard
          title="Pending Drafts"
          value={pendingDrafts}
          icon={Clock}
          iconClass="text-amber-600"
          loading={poStatsLoading || qtStatsLoading || invStatsLoading || doStatsLoading}
          sub="Across all modules"
        />
        <StatCard
          title="Stock Items"
          value={stockTotal}
          icon={Package}
          iconClass={lowStockCount > 0 ? "text-orange-500" : "text-primary"}
          loading={stockLoading}
          sub={lowStockCount > 0 ? `${lowStockCount} item(s) low stock` : "All levels OK"}
        />
      </div>

      {/* Module Summary Row */}
      <div>
        <h2 className="text-lg xl:text-xl font-semibold mb-3 xl:mb-4">Module Activity</h2>
        <div className="grid gap-4 xl:gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <ModuleSummaryCard
            title="Purchase Orders"
            icon={FileText}
            iconBg="bg-blue-600"
            stats={poStats ? { total: poStats.total, confirmed: poStats.confirmed, draft: poStats.draft, totalValue: poStats.totalValue } : undefined}
            loading={poStatsLoading}
            href="/purchase-orders"
          />
          <ModuleSummaryCard
            title="Quotations"
            icon={FileSpreadsheet}
            iconBg="bg-violet-600"
            stats={qtStats ? { total: qtStats.total, confirmed: qtStats.confirmed, draft: qtStats.draft, totalValue: qtStats.totalValue } : undefined}
            loading={qtStatsLoading}
            href="/quotations"
          />
          <ModuleSummaryCard
            title="Invoices"
            icon={Receipt}
            iconBg="bg-emerald-600"
            stats={invStats ? { total: invStats.total, confirmed: invStats.confirmed, draft: invStats.draft, totalValue: invStats.totalValue } : undefined}
            loading={invStatsLoading}
            href="/invoices"
          />
          <ModuleSummaryCard
            title="Delivery Orders"
            icon={Truck}
            iconBg="bg-orange-600"
            stats={doStats ? { total: doStats.total, confirmed: doStats.confirmed, draft: doStats.draft } : undefined}
            loading={doStatsLoading}
            href="/delivery-orders"
          />
        </div>
      </div>

      {/* Low Stock Alert */}
      {!stockLoading && lowStockCount > 0 && (
        <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-900">
          <CardContent className="flex items-center gap-3 py-4 px-5">
            <AlertTriangle className="h-5 w-5 text-orange-600 shrink-0" />
            <div className="flex-1">
              <p className="text-sm xl:text-base font-medium text-orange-800 dark:text-orange-200">
                Low Stock Alert — {lowStockCount} item{lowStockCount > 1 ? "s" : ""} running low (≤5 units)
              </p>
            </div>
            <Link href="/stock">
              <Button size="sm" variant="outline" className="border-orange-300 text-orange-700 hover:bg-orange-100 shrink-0 xl:h-9 xl:px-4">
                View Stock
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Recent Activity — 2 cols on lg, 4 cols on 2xl */}
      <div>
        <h2 className="text-lg xl:text-xl font-semibold mb-3 xl:mb-4">Recent Activity</h2>
        <div className="grid gap-5 xl:gap-6 lg:grid-cols-2 2xl:grid-cols-4">
          {/* Recent Invoices */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm xl:text-base font-semibold">Invoices</h3>
              <Link href="/invoices">
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground h-7">View all →</Button>
              </Link>
            </div>
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-medium">Invoice #</th>
                      <th className="px-4 py-2.5 text-left font-medium">Customer</th>
                      <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                      <th className="px-4 py-2.5 text-center font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {invLoading ? (
                      Array.from({ length: 4 }).map((_, i) => (
                        <tr key={i}>
                          <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                          <td className="px-4 py-3"><Skeleton className="h-4 w-28" /></td>
                          <td className="px-4 py-3"><Skeleton className="h-4 w-16 ml-auto" /></td>
                          <td className="px-4 py-3"><Skeleton className="h-5 w-16 mx-auto" /></td>
                        </tr>
                      ))
                    ) : !recentInvoices?.length ? (
                      <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">No invoices yet.</td></tr>
                    ) : (
                      recentInvoices.slice(0, 6).map((inv: any) => (
                        <tr key={inv.id} className="hover:bg-muted/40 transition-colors">
                          <td className="px-4 py-3">
                            <Link href={`/invoices/${inv.id}`} className="font-mono text-xs font-medium text-primary hover:underline">
                              {inv.invNumber}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-sm truncate">{inv.customerName}</td>
                          <td className="px-4 py-3 text-right text-sm font-medium whitespace-nowrap">{fmt(parseFloat(inv.totalAmount ?? "0"))}</td>
                          <td className="px-4 py-3 text-center">{getStatusBadge(inv.status)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          {/* Recent Quotations */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm xl:text-base font-semibold">Quotations</h3>
              <Link href="/quotations">
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground h-7">View all →</Button>
              </Link>
            </div>
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-medium">Quote #</th>
                      <th className="px-4 py-2.5 text-left font-medium">Customer</th>
                      <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                      <th className="px-4 py-2.5 text-center font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {qtLoading ? (
                      Array.from({ length: 4 }).map((_, i) => (
                        <tr key={i}>
                          <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                          <td className="px-4 py-3"><Skeleton className="h-4 w-28" /></td>
                          <td className="px-4 py-3"><Skeleton className="h-4 w-16 ml-auto" /></td>
                          <td className="px-4 py-3"><Skeleton className="h-5 w-16 mx-auto" /></td>
                        </tr>
                      ))
                    ) : !recentQuotations?.length ? (
                      <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">No quotations yet.</td></tr>
                    ) : (
                      recentQuotations.slice(0, 6).map((qt: any) => (
                        <tr key={qt.id} className="hover:bg-muted/40 transition-colors">
                          <td className="px-4 py-3">
                            <Link href={`/quotations/${qt.id}`} className="font-mono text-xs font-medium text-primary hover:underline">
                              {qt.qtNumber}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-sm truncate">{qt.customerName}</td>
                          <td className="px-4 py-3 text-right text-sm font-medium whitespace-nowrap">{fmt(parseFloat(qt.totalAmount ?? "0"))}</td>
                          <td className="px-4 py-3 text-center">{getStatusBadge(qt.status)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          {/* Recent Purchase Orders */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm xl:text-base font-semibold">Purchase Orders</h3>
              <Link href="/purchase-orders">
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground h-7">View all →</Button>
              </Link>
            </div>
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-medium">PO #</th>
                      <th className="px-4 py-2.5 text-left font-medium">Vendor</th>
                      <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                      <th className="px-4 py-2.5 text-center font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {posLoading ? (
                      Array.from({ length: 4 }).map((_, i) => (
                        <tr key={i}>
                          <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                          <td className="px-4 py-3"><Skeleton className="h-4 w-28" /></td>
                          <td className="px-4 py-3"><Skeleton className="h-4 w-16 ml-auto" /></td>
                          <td className="px-4 py-3"><Skeleton className="h-5 w-16 mx-auto" /></td>
                        </tr>
                      ))
                    ) : !recentPOs?.length ? (
                      <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">No purchase orders yet.</td></tr>
                    ) : (
                      recentPOs.slice(0, 6).map((po: any) => (
                        <tr key={po.id} className="hover:bg-muted/40 transition-colors">
                          <td className="px-4 py-3">
                            <Link href={`/purchase-orders/${po.id}`} className="font-mono text-xs font-medium text-primary hover:underline">
                              {po.poNumber}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-sm truncate">{po.vendorName}</td>
                          <td className="px-4 py-3 text-right text-sm font-medium whitespace-nowrap">{fmt(po.totalAmount ?? 0)}</td>
                          <td className="px-4 py-3 text-center">{getStatusBadge(po.status)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          {/* Stock Overview */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm xl:text-base font-semibold">Stock Overview</h3>
              <Link href="/stock">
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground h-7">View all →</Button>
              </Link>
            </div>
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-medium">Item</th>
                      <th className="px-4 py-2.5 text-right font-medium">Qty</th>
                      <th className="px-4 py-2.5 text-center font-medium">Level</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {stockLoading ? (
                      Array.from({ length: 4 }).map((_, i) => (
                        <tr key={i}>
                          <td className="px-4 py-3"><Skeleton className="h-4 w-32" /></td>
                          <td className="px-4 py-3"><Skeleton className="h-4 w-12 ml-auto" /></td>
                          <td className="px-4 py-3"><Skeleton className="h-5 w-16 mx-auto" /></td>
                        </tr>
                      ))
                    ) : !stockItems?.length ? (
                      <tr><td colSpan={3} className="px-4 py-8 text-center text-sm text-muted-foreground">No stock items yet.</td></tr>
                    ) : (
                      stockItems.slice(0, 6).map((item) => {
                        const qty = Number(item.stockQty) || 0;
                        const isLow = qty <= 5;
                        const isOut = qty === 0;
                        return (
                          <tr key={item.id} className="hover:bg-muted/40 transition-colors">
                            <td className="px-4 py-3 text-sm font-medium truncate">{item.name}</td>
                            <td className="px-4 py-3 text-right text-sm whitespace-nowrap">{qty} {item.uom}</td>
                            <td className="px-4 py-3 text-center">
                              {isOut ? (
                                <Badge variant="destructive" className="text-xs py-0">Out</Badge>
                              ) : isLow ? (
                                <Badge className="bg-orange-500 hover:bg-orange-600 text-xs py-0">Low</Badge>
                              ) : (
                                <Badge variant="outline" className="text-xs py-0 text-green-600 border-green-300">OK</Badge>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
