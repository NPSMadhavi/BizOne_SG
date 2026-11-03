import React, { useState, useEffect } from "react";
import {
  ShieldAlert,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Code,
  Calendar,
  User,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { getAuditLogs } from "./api";
import type { SuperAdminAuditLog } from "./types";

export function AuditLogsTab() {
  const [logs, setLogs] = useState<SuperAdminAuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [entityFilter, setEntityFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(false);

  // Payload viewer dialog
  const [viewingLog, setViewingLog] = useState<SuperAdminAuditLog | null>(null);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const res = await getAuditLogs({
        search: search.trim() || undefined,
        entityType: entityFilter !== "all" ? entityFilter : undefined,
        page,
        limit: 15,
      });
      setLogs(res.logs || []);
      setTotal(res.total || 0);
      setTotalPages(res.totalPages || 1);
    } catch (err) {
      console.error("Failed to load audit logs:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page, entityFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchLogs();
  };

  return (
    <div className="space-y-6">
      {/* Top Filter Bar */}
      <Card className="border border-slate-200/80 dark:border-slate-800 shadow-sm">
        <CardContent className="p-4">
          <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search audit actions by keyword or username..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 text-xs h-9 bg-slate-50/50 dark:bg-slate-900"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={entityFilter}
                onChange={(e) => {
                  setEntityFilter(e.target.value);
                  setPage(1);
                }}
                className="text-xs h-9 px-3 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none"
              >
                <option value="all">All Entities</option>
                <option value="license">License</option>
                <option value="plan">Plan</option>
                <option value="company">Company</option>
                <option value="user">User / Auth</option>
              </select>

              <Button type="submit" size="sm" className="bg-indigo-600 hover:bg-indigo-500 text-xs h-9 cursor-pointer">
                Filter
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setEntityFilter("all");
                  setPage(1);
                  fetchLogs();
                }}
                className="text-xs h-9 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Audit Logs Table */}
      <Card className="border border-slate-200/80 dark:border-slate-800 shadow-sm">
        <CardHeader className="p-5 pb-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-indigo-600" />
            <div>
              <CardTitle className="text-base font-semibold">Master Security & Audit Logs ({total})</CardTitle>
              <CardDescription className="text-xs">
                Immutable chronological event trail of all Super Admin administrative actions
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center space-y-2">
              <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-slate-500">Loading audit records...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="py-16 text-center text-xs text-slate-500">
              No audit records found matching your filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/75 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border-y border-slate-200/80 dark:border-slate-800">
                  <tr>
                    <th className="py-3 px-4 font-medium">Timestamp</th>
                    <th className="py-3 px-4 font-medium">Action</th>
                    <th className="py-3 px-4 font-medium">Entity</th>
                    <th className="py-3 px-4 font-medium">Operator</th>
                    <th className="py-3 px-4 font-medium">Client IP</th>
                    <th className="py-3 px-4 font-medium text-right">Payload</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {logs.map((log) => (
                    <tr
                      key={log.id}
                      className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3 px-4 text-slate-500 font-mono text-[11px] whitespace-nowrap">
                        {(() => {
                          const rawTime = log.createdAt || (log as any).created_at;
                          if (!rawTime) return "Recently";
                          const parsed = new Date(rawTime);
                          return isNaN(parsed.getTime()) ? "Recently" : parsed.toLocaleString();
                        })()}
                      </td>

                      <td className="py-3 px-4 font-mono font-medium text-slate-900 dark:text-white">
                        {log.action}
                      </td>

                      <td className="py-3 px-4">
                        <span className="uppercase text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {log.entityType} {log.entityId ? `#${log.entityId}` : ""}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <span className="font-medium text-slate-800 dark:text-slate-200 flex items-center gap-1">
                          <User className="w-3 h-3 text-slate-400" />
                          @{log.username}
                        </span>
                      </td>

                      <td className="py-3 px-4 font-mono text-[11px] text-slate-500">
                        {log.ipAddress || "127.0.0.1"}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setViewingLog(log)}
                          className="text-xs h-7 text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 cursor-pointer"
                        >
                          <Code className="w-3 h-3 mr-1" />
                          View Data
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          <div className="p-4 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
            <div>
              Showing page <span className="font-medium text-slate-800 dark:text-slate-200">{page}</span> of{" "}
              <span className="font-medium text-slate-800 dark:text-slate-200">{totalPages}</span> ({total} logs)
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || isLoading}
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                className="h-7 text-xs px-2.5 cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || isLoading}
                onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                className="h-7 text-xs px-2.5 cursor-pointer"
              >
                Next <ChevronRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payload Modal */}
      <Dialog open={!!viewingLog} onOpenChange={(open) => !open && setViewingLog(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-mono">
              <Code className="w-4 h-4 text-indigo-600" />
              Audit Payload: {viewingLog?.action}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Logged at {viewingLog?.createdAt ? new Date(viewingLog.createdAt).toLocaleString() : ""} by @{viewingLog?.username}
            </DialogDescription>
          </DialogHeader>

          <div className="p-3 bg-slate-950 text-slate-200 rounded-lg font-mono text-xs overflow-x-auto max-h-80">
            <pre>{JSON.stringify(viewingLog?.details || {}, null, 2)}</pre>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

