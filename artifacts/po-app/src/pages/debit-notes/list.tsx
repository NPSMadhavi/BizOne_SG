import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { Plus, Search, Eye, FileText, FilePlus } from "lucide-react";
import { cn } from "@/lib/utils";

interface DebitNote {
  id: number; dnNumber: string; customerName: string; refInvNumber: string | null;
  issueDate: string | null; currency: string; totalAmount: number; status: string;
  createdByUsername: string | null; isPrivate: boolean; reason: string | null;
}

function statusBadge(status: string) {
  if (status === "confirmed") return <Badge className="bg-emerald-100 text-emerald-800 border-0">Confirmed</Badge>;
  if (status === "void")      return <Badge className="bg-gray-100 text-gray-500 border-0">Void</Badge>;
  return <Badge className="bg-amber-100 text-amber-800 border-0">Draft</Badge>;
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-SG", { day: "2-digit", month: "short", year: "numeric" });
}

export default function DebitNoteList() {
  const [search, setSearch] = useState("");
  const qc = useQueryClient();
  const { toast } = useToast();
  const { canManage } = useAuth();

  const { data = [], isLoading } = useQuery<DebitNote[]>({
    queryKey: ["debit-notes"],
    queryFn: async () => {
      const r = await fetch("/api/debit-notes", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load");
      return r.json();
    },
  });

  const filtered = data.filter(note =>
    !search.trim() ||
    note.dnNumber.toLowerCase().includes(search.toLowerCase()) ||
    note.customerName.toLowerCase().includes(search.toLowerCase()) ||
    (note.refInvNumber ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5 pb-20 animate-in fade-in duration-300">
      <div className="flex items-end justify-between flex-wrap gap-4 pb-4 border-b border-gray-200">
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Documents</p>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FilePlus className="h-6 w-6 text-gray-700" /> Debit Notes
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Manual debit notes issued to customers</p>
        </div>
        <Link href="/debit-notes/new">
          <Button className="gap-2">
            <Plus className="h-4 w-4" />New Debit Note
          </Button>
        </Link>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input placeholder="Search CN number, customer…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      {isLoading && <div className="text-center py-16 text-gray-400 text-sm">Loading…</div>}

      {!isLoading && (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider">CN Number</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider">Customer</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider">Ref Invoice</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider">Date</th>
                <th className="text-right px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider">Amount</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider">Created By</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-16 text-gray-400">
                    {search ? "No debit notes match your search." : "No debit notes yet. Create your first one."}
                  </td>
                </tr>
              )}
              {filtered.map(note => (
                <tr key={note.id} className={cn("border-b border-gray-100 hover:bg-gray-50/50 transition-colors", note.status === "void" ? "opacity-60" : "")}>
                  <td className="px-4 py-3 font-mono font-semibold text-gray-800">{note.dnNumber}</td>
                  <td className="px-4 py-3 text-gray-700">{note.customerName}</td>
                  <td className="px-4 py-3 font-mono text-gray-500">{note.refInvNumber || "—"}</td>
                  <td className="px-4 py-3 text-gray-500">{fmtDate(note.issueDate)}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-gray-800">
                    {note.currency} {new Intl.NumberFormat("en-SG", { minimumFractionDigits: 2 }).format(note.totalAmount)}
                  </td>
                  <td className="px-4 py-3">{statusBadge(note.status)}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{note.createdByUsername || "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/debit-notes/${note.id}`}>
                      <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs">
                        <Eye className="h-3.5 w-3.5" />View
                      </Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
