import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { Plus, Search, Eye, Pencil, FilePlus, Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePagination } from "@/hooks/use-pagination";
import { ListPagination } from "@/components/list-pagination";

const QUARTERS = [
  { label: "Q1", months: [0,1,2] }, { label: "Q2", months: [3,4,5] },
  { label: "Q3", months: [6,7,8] }, { label: "Q4", months: [9,10,11] },
];
type FilterMode = "all"|"q1"|"q2"|"q3"|"q4"|"custom";

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
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const qc = useQueryClient();
  const { toast } = useToast();
  const { canManage } = useAuth();
  const currentYear = new Date().getFullYear();

  const { data = [], isLoading } = useQuery<DebitNote[]>({
    queryKey: ["debit-notes"],
    queryFn: async () => {
      const r = await fetch("/api/debit-notes", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load");
      return r.json();
    },
  });

  const filteredByDate = useMemo(() => {
    if (filterMode === "all") return data;
    if (filterMode === "custom") {
      if (!customFrom && !customTo) return data;
      return data.filter(d => {
        const s = (d.issueDate || "").slice(0, 10);
        if (!s) return false;
        if (customFrom && s < customFrom) return false;
        if (customTo && s > customTo) return false;
        return true;
      });
    }
    const qIdx = ["q1","q2","q3","q4"].indexOf(filterMode);
    const months = QUARTERS[qIdx].months;
    return data.filter(d => {
      if (!d.issueDate) return false;
      const dt = new Date(d.issueDate + "T00:00:00");
      return dt.getFullYear() === filterYear && months.includes(dt.getMonth());
    });
  }, [data, filterMode, filterYear, customFrom, customTo]);

  const filtered = useMemo(() => filteredByDate.filter(note =>
    !search.trim() ||
    note.dnNumber.toLowerCase().includes(search.toLowerCase()) ||
    note.customerName.toLowerCase().includes(search.toLowerCase()) ||
    (note.refInvNumber ?? "").toLowerCase().includes(search.toLowerCase())
  ), [filteredByDate, search]);

  const { page, setPage, totalPages, paginatedItems } = usePagination(filtered);

  return (
    <div className="space-y-5 pb-20 animate-in fade-in duration-300">
      <div className="flex items-end justify-between flex-wrap gap-4 pb-4 border-b border-gray-200">
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Documents</p>
          <h1 className="text-2xl font-bold text-[#2563EB] flex items-center gap-2">
            <FilePlus className="h-6 w-6 text-gray-700" /> Debit Notes
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Manual debit notes issued to customers</p>
        </div>
        <Link href="/debit-notes/new">
          <Button className="gap-2"><Plus className="h-4 w-4" />Create Debit Note</Button>
        </Link>
      </div>

      {/* Quarter filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
          {(["all","q1","q2","q3","q4"] as FilterMode[]).map(m => (
            <button key={m} onClick={() => setFilterMode(m)}
              className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${filterMode===m?"bg-background shadow text-foreground":"text-muted-foreground hover:text-foreground"}`}
            >{m==="all"?"All Time":m.toUpperCase()}</button>
          ))}
          <button onClick={() => setFilterMode("custom")}
            className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors flex items-center gap-1 ${filterMode==="custom"?"bg-background shadow text-foreground":"text-muted-foreground hover:text-foreground"}`}
          ><Calendar className="h-3.5 w-3.5"/>Custom</button>
        </div>
        {filterMode!=="all"&&filterMode!=="custom"&&(
          <div className="flex items-center gap-1 border rounded-lg px-2 py-1.5 bg-background text-sm">
            <button onClick={()=>setFilterYear(y=>y-1)} className="text-muted-foreground hover:text-foreground p-0.5"><ChevronLeft className="h-4 w-4"/></button>
            <span className="font-medium w-12 text-center">{filterYear}</span>
            <button onClick={()=>setFilterYear(y=>y+1)} disabled={filterYear>=currentYear} className="text-muted-foreground hover:text-foreground p-0.5 disabled:opacity-30"><ChevronRight className="h-4 w-4"/></button>
          </div>
        )}
        {filterMode==="custom"&&(
          <div className="flex items-center gap-2">
            <Input type="date" value={customFrom} onChange={e=>setCustomFrom(e.target.value)} className="h-9 w-36 text-sm"/>
            <span className="text-muted-foreground text-sm">to</span>
            <Input type="date" value={customTo} onChange={e=>setCustomTo(e.target.value)} className="h-9 w-36 text-sm"/>
          </div>
        )}
        {filterMode!=="all"&&(
          <span className="text-xs text-muted-foreground ml-1">
            {filteredByDate.length} note{filteredByDate.length!==1?"s":""}
            {filterMode!=="custom"?` in ${filterMode.toUpperCase()} ${filterYear}`:""}
          </span>
        )}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input placeholder="Search DN number, customer…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      {isLoading && <div className="text-center py-16 text-gray-400 text-sm">Loading…</div>}

      {!isLoading && (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider">DN Number</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider">Customer</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider">Ref Invoice</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider">Date</th>
                <th className="text-right px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider">Amount</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider">Status</th>
                <th className="text-right px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-16 text-gray-400">
                    {search || filterMode !== "all" ? "No debit notes match your filters." : "No debit notes yet. Create your first one."}
                  </td>
                </tr>
              )}
              {paginatedItems.map(note => (
                <tr key={note.id} className={cn("border-b border-gray-100 hover:bg-gray-50/50 transition-colors", note.status === "void" ? "opacity-60" : "")}>
                  <td className="px-4 py-3 font-mono font-semibold text-gray-800">{note.dnNumber}</td>
                  <td className="px-4 py-3 text-gray-700">{note.customerName}</td>
                  <td className="px-4 py-3 font-mono text-gray-500">{note.refInvNumber || "—"}</td>
                  <td className="px-4 py-3 font-medium">{fmtDate(note.issueDate)}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-gray-800">
                    {note.currency} {new Intl.NumberFormat("en-SG", { minimumFractionDigits: 2 }).format(note.totalAmount)}
                  </td>
                  <td className="px-4 py-3">{statusBadge(note.status)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Link href={`/debit-notes/${note.id}`}>
                        <Button size="icon" variant="ghost" className="h-8 w-8" title="View">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </Link>
                      <Link href={`/debit-notes/${note.id}/edit`}>
                        <Button size="icon" variant="ghost" className="h-8 w-8" title="Edit">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <ListPagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      )}
    </div>
  );
}
