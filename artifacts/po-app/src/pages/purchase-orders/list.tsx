import { useState, useMemo } from "react";
import { useListPurchaseOrders, getListPurchaseOrdersQueryKey } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";
import { Search, Plus, ArrowRight, MailCheck, Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { fmtDate } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/auth-context";

const QUARTERS = [
  { label: "Q1", months: [0,1,2] }, { label: "Q2", months: [3,4,5] },
  { label: "Q3", months: [6,7,8] }, { label: "Q4", months: [9,10,11] },
];
type FilterMode = "all"|"q1"|"q2"|"q3"|"q4"|"custom";

function SentToCell({ emailSentTo }: { emailSentTo?: string | null }) {
  if (!emailSentTo) return <span className="text-muted-foreground">—</span>;
  const emails = emailSentTo.split(",").map(e => e.trim()).filter(Boolean);
  if (emails.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex items-center gap-1.5" title={emails.join(", ")}>
      <MailCheck className="h-3.5 w-3.5 text-violet-500 shrink-0" />
      <span className="truncate max-w-[140px] text-xs text-muted-foreground">{emails[0]}</span>
      {emails.length > 1 && <Badge variant="secondary" className="text-xs py-0 px-1 shrink-0">+{emails.length - 1}</Badge>}
    </div>
  );
}

function piStatusBadge(status: string) {
  switch (status) {
    case "paid":    return <Badge className="bg-emerald-600 hover:bg-emerald-700 text-xs py-0 px-1.5">Paid</Badge>;
    case "partial": return <Badge className="bg-amber-500 hover:bg-amber-600 text-white text-xs py-0 px-1.5">Partial</Badge>;
    default:        return <Badge variant="outline" className="text-orange-600 border-orange-300 text-xs py-0 px-1.5">Pending</Badge>;
  }
}

export default function PurchaseOrderList() {
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const { selectedCompany } = useAuth();
  const currentYear = new Date().getFullYear();

  const { data: pos, isLoading } = useListPurchaseOrders({
    query: {
      queryKey: getListPurchaseOrdersQueryKey(),
      refetchOnMount: "always",
    },
  });

  const { data: vendorInvoices = [] } = useQuery<any[]>({
    queryKey: ["vendor-invoices", selectedCompany?.id],
    queryFn: async () => {
      const res = await fetch("/api/vendor-invoices", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const pisByPoId = vendorInvoices.reduce((acc: Record<number, any[]>, pi: any) => {
    for (const poId of (pi.poIds || [])) {
      if (!acc[poId]) acc[poId] = [];
      acc[poId].push(pi);
    }
    return acc;
  }, {});

  const filteredByDate = useMemo(() => {
    const all = pos ?? [];
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
  }, [pos, filterMode, filterYear, customFrom, customTo]);

  const filteredPOs = filteredByDate.filter(po => {
    const term = searchTerm.toLowerCase();
    return po.poNumber.toLowerCase().includes(term) || po.vendorName.toLowerCase().includes(term);
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "confirmed": return <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700">Confirmed</Badge>;
      case "sent":      return <Badge className="bg-violet-600 hover:bg-violet-700">Sent</Badge>;
      case "draft":     return <Badge variant="secondary">Draft</Badge>;
      case "cancelled": return <Badge variant="destructive">Cancelled</Badge>;
      default:          return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#2563EB]">Purchase Orders</h1>
          <p className="text-muted-foreground mt-1">Manage and track all purchase orders.</p>
        </div>
        <Link href="/purchase-orders/new">
          <Button className="gap-2"><Plus className="h-4 w-4" />Create Purchase Order</Button>
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
            {filteredByDate.length} order{filteredByDate.length!==1?"s":""}
            {filterMode!=="custom"?` in ${filterMode.toUpperCase()} ${filterYear}`:""}
          </span>
        )}
      </div>

      <Card className="p-4 flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by PO Number or Vendor..." className="pl-9" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b">
              <tr>
                <th className="px-6 py-4 font-medium">PO Number</th>
                <th className="px-6 py-4 font-medium">Date</th>
                <th className="px-6 py-4 font-medium">Vendor</th>
                <th className="px-6 py-4 font-medium">Customer</th>
                <th className="px-6 py-4 font-medium text-right">Amount</th>
                <th className="px-6 py-4 font-medium text-center">Status</th>
                <th className="px-6 py-4 font-medium">Sent To</th>
                <th className="px-6 py-4 font-medium">Vendor PI</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>{[...Array(9)].map((_, j) => <td key={j} className="px-6 py-4"><Skeleton className="h-4 w-full"/></td>)}</tr>
                ))
              ) : filteredPOs.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <Search className="h-8 w-8 text-muted-foreground/50"/>
                      <p>No purchase orders found.</p>
                      {searchTerm && <Button variant="link" onClick={() => setSearchTerm("")}>Clear search</Button>}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredPOs.map((po) => {
                  const pis: any[] = pisByPoId[po.id] || [];
                  const overallStatus = pis.length === 0 ? null
                    : pis.every(p => p.status === "paid") ? "paid"
                    : pis.some(p => p.status === "paid" || p.status === "partial") ? "partial"
                    : "pending";
                  return (
                    <tr key={po.id} className="hover:bg-muted/50 transition-colors group cursor-pointer" onClick={() => setLocation(`/purchase-orders/${po.id}`)}>
                      <td className="px-6 py-4 font-medium">{po.poNumber}</td>
                      <td className="px-6 py-4 font-medium">{fmtDate(po.createdAt)}</td>
                      <td className="px-6 py-4 font-medium">{po.vendorName}</td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {(po as any).customerName ? <span className="text-foreground font-medium">{(po as any).customerName}</span> : <span>—</span>}
                      </td>
                      <td className="px-6 py-4 text-right font-medium">{new Intl.NumberFormat("en-SG",{style:"currency",currency:(po as any).currency||"SGD"}).format(po.totalAmount)}</td>
                      <td className="px-6 py-4 text-center">{getStatusBadge(po.status)}</td>
                      <td className="px-6 py-4"><SentToCell emailSentTo={(po as any).emailSentTo}/></td>
                      <td className="px-6 py-4">
                        {pis.length === 0 ? <span className="text-muted-foreground">—</span>
                          : pis.length === 1 ? (
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium cursor-pointer" onClick={e=>{e.stopPropagation();setLocation(`/vendor-invoices/${pis[0].id}`)}}>{pis[0].piNumber}</span>
                              {piStatusBadge(pis[0].status)}
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium cursor-pointer" onClick={e=>{e.stopPropagation();setLocation(`/vendor-invoices`)}}>{pis.length} PIs</span>
                              {overallStatus && piStatusBadge(overallStatus)}
                            </div>
                          )}
                      </td>
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
