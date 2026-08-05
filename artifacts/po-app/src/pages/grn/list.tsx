import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { Search, ArrowRight, ClipboardList, Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { fmtDate } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

const QUARTERS = [
  { label: "Q1", months: [0,1,2] }, { label: "Q2", months: [3,4,5] },
  { label: "Q3", months: [6,7,8] }, { label: "Q4", months: [9,10,11] },
];
type FilterMode = "all"|"q1"|"q2"|"q3"|"q4"|"custom";

interface GrnItem {
  partNumber?: string; description: string; qty: number;
  unitPrice: number; amount: number; received: boolean; serialNumbers: string;
}
interface Grn {
  id: number; grnNumber: string; poId: number; poNumber: string;
  vendorName: string; companyId: number; status: string;
  items: GrnItem[]; createdBy: number; createdAt: string; updatedAt: string;
}

function getStatusBadge(status: string) {
  switch (status) {
    case "complete": return <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white">Complete</Badge>;
    case "partial":  return <Badge className="bg-amber-500 hover:bg-amber-600 text-white">Partial</Badge>;
    case "draft":    return <Badge variant="secondary">Draft</Badge>;
    default:         return <Badge variant="outline">{status}</Badge>;
  }
}

async function fetchGrns(): Promise<Grn[]> {
  const res = await fetch("/api/grn", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch GRNs");
  return res.json();
}

export default function GrnList() {
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const currentYear = new Date().getFullYear();

  const { data: grns, isLoading } = useQuery({ queryKey: ["grns"], queryFn: fetchGrns });

  const filteredByDate = useMemo(() => {
    const all = grns ?? [];
    if (filterMode === "all") return all;
    if (filterMode === "custom") {
      if (!customFrom && !customTo) return all;
      return all.filter(d => {
        const s = (d.createdAt || "").slice(0, 10);
        if (customFrom && s < customFrom) return false;
        if (customTo && s > customTo) return false;
        return true;
      });
    }
    const qIdx = ["q1","q2","q3","q4"].indexOf(filterMode);
    const months = QUARTERS[qIdx].months;
    return all.filter(d => {
      if (!d.createdAt) return false;
      const dt = new Date(d.createdAt);
      return dt.getFullYear() === filterYear && months.includes(dt.getMonth());
    });
  }, [grns, filterMode, filterYear, customFrom, customTo]);

  const filtered = filteredByDate.filter((g) => {
    const term = searchTerm.toLowerCase();
    return g.grnNumber.toLowerCase().includes(term) || g.poNumber.toLowerCase().includes(term) || g.vendorName.toLowerCase().includes(term);
  });

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Goods Receipt Notes</h1>
          <p className="text-muted-foreground mt-1">Track received goods against Purchase Orders.</p>
        </div>
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
            {filteredByDate.length} GRN{filteredByDate.length!==1?"s":""}
            {filterMode!=="custom"?` in ${filterMode.toUpperCase()} ${filterYear}`:""}
          </span>
        )}
      </div>

      <Card className="p-4 flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by GRN No, PO No, or Vendor..." className="pl-9" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b">
              <tr>
                <th className="px-6 py-4 font-medium">GRN Number</th>
                <th className="px-6 py-4 font-medium">PO Reference</th>
                <th className="px-6 py-4 font-medium">Vendor</th>
                <th className="px-6 py-4 font-medium">Date</th>
                <th className="px-6 py-4 font-medium text-center">Items</th>
                <th className="px-6 py-4 font-medium text-center">Status</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>{[...Array(7)].map((_, j) => <td key={j} className="px-6 py-4"><Skeleton className="h-4 w-full"/></td>)}</tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <ClipboardList className="h-10 w-10 text-muted-foreground/40"/>
                      <p className="font-medium">No GRNs found.</p>
                      <p className="text-xs">GRNs are automatically created when a Purchase Order is confirmed.</p>
                      {searchTerm && <Button variant="link" onClick={() => setSearchTerm("")}>Clear search</Button>}
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((grn) => {
                  const receivedCount = grn.items.filter((i) => i.received).length;
                  return (
                    <tr key={grn.id} className="hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => setLocation(`/grn/${grn.id}`)}>
                      <td className="px-6 py-4 font-medium text-primary">{grn.grnNumber}</td>
                      <td className="px-6 py-4 font-medium">{grn.poNumber}</td>
                      <td className="px-6 py-4">{grn.vendorName}</td>
                      <td className="px-6 py-4 text-muted-foreground">{fmtDate(grn.createdAt)}</td>
                      <td className="px-6 py-4 text-center text-muted-foreground">{receivedCount}/{grn.items.length} received</td>
                      <td className="px-6 py-4 text-center">{getStatusBadge(grn.status)}</td>
                      <td className="px-6 py-4 text-right">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground"><ArrowRight className="h-4 w-4"/></Button>
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
  );
}
