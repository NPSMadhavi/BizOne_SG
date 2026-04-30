import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldCheck, Search, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { fmtDate } from "@/lib/utils";

interface AuditLog {
  id: number;
  companyId: number | null;
  userId: number | null;
  username: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  entityLabel: string | null;
  details: any;
  ipAddress: string | null;
  createdAt: string;
}

const ENTITY_LABELS: Record<string, string> = {
  purchase_order: "Purchase Order",
  quotation: "Quotation",
  invoice: "Invoice",
  delivery_order: "Delivery Order",
  vendor_invoice: "Vendor Invoice",
  user: "User",
  grn: "GRN",
  stock_item: "Stock Item",
};

const ACTION_COLORS: Record<string, string> = {
  create: "bg-emerald-100 text-emerald-800",
  update: "bg-blue-100 text-blue-800",
  delete: "bg-red-100 text-red-800",
  void: "bg-orange-100 text-orange-800",
  "knock-off": "bg-purple-100 text-purple-800",
  "status:confirmed": "bg-emerald-100 text-emerald-800",
  "payment:add": "bg-blue-100 text-blue-800",
  "payment:delete": "bg-red-100 text-red-800",
};

function actionBadge(action: string) {
  const cls = ACTION_COLORS[action] ?? "bg-muted text-muted-foreground";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {action}
    </span>
  );
}

const PAGE_SIZE = 50;

async function fetchAuditLogs(params: Record<string, string>): Promise<{ total: number; rows: AuditLog[] }> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`/api/audit-logs?${qs}`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load audit logs");
  return res.json();
}

export default function AuditLogPage() {
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [entityFilter, setEntityFilter] = useState("all");
  const [page, setPage] = useState(0);

  const params: Record<string, string> = {
    limit: String(PAGE_SIZE),
    offset: String(page * PAGE_SIZE),
  };
  if (search) params.search = search;
  if (actionFilter !== "all") params.action = actionFilter;
  if (entityFilter !== "all") params.entityType = entityFilter;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["audit-logs", params],
    queryFn: () => fetchAuditLogs(params),
    staleTime: 30_000,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const handleSearch = (v: string) => { setSearch(v); setPage(0); };
  const handleAction = (v: string) => { setActionFilter(v); setPage(0); };
  const handleEntity = (v: string) => { setEntityFilter(v); setPage(0); };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 w-full">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <ShieldCheck className="h-8 w-8 text-primary" />
            Audit Log
          </h1>
          <p className="text-muted-foreground mt-1">All write activity across the system, including who did what and when.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by user, document, action…"
            value={search}
            onChange={e => handleSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={entityFilter} onValueChange={handleEntity}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All document types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {Object.entries(ENTITY_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={actionFilter} onValueChange={handleAction}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All actions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            <SelectItem value="create">Create</SelectItem>
            <SelectItem value="update">Update</SelectItem>
            <SelectItem value="delete">Delete</SelectItem>
            <SelectItem value="status:confirmed">Confirmed</SelectItem>
            <SelectItem value="void">Void</SelectItem>
            <SelectItem value="knock-off">Knock-off</SelectItem>
            <SelectItem value="payment:add">Payment Add</SelectItem>
            <SelectItem value="payment:delete">Payment Delete</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {isLoading ? "Loading…" : `${total.toLocaleString()} event${total !== 1 ? "s" : ""}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : rows.length === 0 ? (
            <div className="px-6 py-12 text-center text-muted-foreground">
              <ShieldCheck className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>No audit events found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-t">
                  <tr>
                    <th className="px-4 py-3 font-medium text-left">Timestamp</th>
                    <th className="px-4 py-3 font-medium text-left">User</th>
                    <th className="px-4 py-3 font-medium text-left">Action</th>
                    <th className="px-4 py-3 font-medium text-left">Type</th>
                    <th className="px-4 py-3 font-medium text-left">Reference</th>
                    <th className="px-4 py-3 font-medium text-left">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map(log => (
                    <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString("en-SG", {
                          day: "2-digit", month: "short", year: "numeric",
                          hour: "2-digit", minute: "2-digit", second: "2-digit",
                        })}
                      </td>
                      <td className="px-4 py-2.5 font-medium whitespace-nowrap">
                        {log.username ?? <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {actionBadge(log.action)}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                        {ENTITY_LABELS[log.entityType] ?? log.entityType}
                      </td>
                      <td className="px-4 py-2.5 font-medium font-mono text-xs whitespace-nowrap">
                        {log.entityLabel ?? log.entityId ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-[200px] truncate">
                        {log.details ? JSON.stringify(log.details) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <span className="text-sm text-muted-foreground">
                Page {page + 1} of {totalPages}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
