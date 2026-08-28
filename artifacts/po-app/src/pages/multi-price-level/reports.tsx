import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useLocation } from "wouter";
import { useListStockItems } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useSalesPersons } from "@/hooks/use-sales-persons";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { ArrowLeft, CalendarDays, ChevronRight, Download, Eye, FileSpreadsheet, FileText, Layers3, Package, Pencil, Trash2, UsersRound } from "lucide-react";

type PriceLevel = { id: string; name: string; description: string; active: boolean };
const defaults: PriceLevel[] = [
  { id: "retail", name: "Retail Price", description: "Standard retail selling price", active: true },
  { id: "wholesale", name: "Wholesale Price", description: "For wholesale customers", active: true },
  { id: "dealer", name: "Dealer Price", description: "For dealers", active: true },
  { id: "distributor", name: "Distributor Price", description: "For distributors", active: true },
];

export default function MultiPriceLevelReportsPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { data: stockItems = [] } = useListStockItems({} as any);

  const { data: customers = [] } = useQuery<any[]>({
    queryKey: ["customers", "price-level-reports-page"],
    queryFn: async () => {
      const response = await fetch("/api/customers", { credentials: "include" });
      return response.ok ? response.json() : [];
    },
  });

  const { salesPersons } = useSalesPersons();
  const [priceLevel, setPriceLevel] = useState("all");
  const [salesPerson, setSalesPerson] = useState("all");
  const [customer, setCustomer] = useState("all");
  const [status, setStatus] = useState("all");
  const [fromDate, setFromDate] = useState("2026-04-01");
  const [toDate, setToDate] = useState("2026-08-31");

  const [appliedFilters, setAppliedFilters] = useState({
    fromDate: "2026-04-01",
    toDate: "2026-08-31",
    priceLevel: "all",
    salesPerson: "all",
    customer: "all",
    status: "all",
  });

  const [levelData, setLevelData] = useState<PriceLevel[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("multi-price-levels-v1") || "null") || defaults;
    } catch {
      return defaults;
    }
  });
  const levels = levelData;

  const [viewLevel, setViewLevel] = useState<PriceLevel | null>(null);
  const [editLevel, setEditLevel] = useState<PriceLevel | null>(null);
  const [editForm, setEditForm] = useState({ name: "", description: "", active: true });

  const priceMap = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("multi-price-prices-v1") || "{}");
    } catch {
      return {};
    }
  }, []);

  const savedInvoices = useMemo(() => {
    try {
      const raw = localStorage.getItem("multi-price-invoices-v1") || localStorage.getItem("multi-price-invoice-v1");
      if (raw) {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [parsed];
      }
    } catch { /* empty */ }
    return [];
  }, []);

  const handleViewReport = () => {
    setAppliedFilters({
      fromDate,
      toDate,
      priceLevel,
      salesPerson,
      customer,
      status,
    });
    toast({
      title: "Report Filtered",
      description: `Updated report filter applied.`,
    });
  };

  const handleReset = () => {
    setFromDate("2026-04-01");
    setToDate("2026-08-31");
    setPriceLevel("all");
    setSalesPerson("all");
    setCustomer("all");
    setStatus("all");
    setAppliedFilters({
      fromDate: "2026-04-01",
      toDate: "2026-08-31",
      priceLevel: "all",
      salesPerson: "all",
      customer: "all",
      status: "all",
    });
    toast({ title: "Filters Reset", description: "Report reset to default parameters." });
  };

  const filteredLevels = useMemo(() => {
    return levels.filter((l: PriceLevel) => {
      if (appliedFilters.priceLevel !== "all" && l.id !== appliedFilters.priceLevel && l.name !== appliedFilters.priceLevel) {
        return false;
      }
      if (appliedFilters.status === "active" && !l.active) return false;
      if (appliedFilters.status === "inactive" && l.active) return false;
      return true;
    });
  }, [levels, appliedFilters]);

  const filteredInvoices = useMemo(() => {
    return savedInvoices.filter((inv: any) => {
      if (appliedFilters.customer !== "all" && inv.customer !== appliedFilters.customer) {
        return false;
      }
      if (appliedFilters.salesPerson !== "all" && inv.salesPerson !== appliedFilters.salesPerson) {
        return false;
      }
      if (appliedFilters.priceLevel !== "all" && inv.priceLevel !== appliedFilters.priceLevel) {
        const match = levels.find((l: PriceLevel) => l.id === appliedFilters.priceLevel);
        if (match && inv.priceLevel !== match.name) return false;
      }
      if (inv.invoiceDate) {
        if (appliedFilters.fromDate && inv.invoiceDate < appliedFilters.fromDate) return false;
        if (appliedFilters.toDate && inv.invoiceDate > appliedFilters.toDate) return false;
      }
      return true;
    });
  }, [savedInvoices, appliedFilters, levels]);

  const mappedItemsCount = useMemo(() => {
    return (stockItems as any[]).filter(stock => {
      if (appliedFilters.item !== "all" && String(stock.id) !== appliedFilters.item) return false;
      return priceMap[String(stock.id)] && Object.values(priceMap[String(stock.id)]).some(Boolean);
    }).length;
  }, [stockItems, priceMap, appliedFilters.item]);

  const totalCustomersMapped = useMemo(() => {
    const set = new Set<string>();
    filteredInvoices.forEach((inv: any) => {
      if (inv.customer) set.add(inv.customer);
    });
    return set.size;
  }, [filteredInvoices]);

  const effectiveEntries = Object.values(priceMap).reduce((count: number, itemPrices: any) => count + Object.values(itemPrices || {}).filter(Boolean).length, 0);

  const itemsMappedByLevel = useMemo(() => {
    return filteredLevels.map((level: PriceLevel) => {
      const itemsCount = (stockItems as any[]).filter((stock) => {
        const sId = String(stock.id);
        if (priceMap[sId]?.[level.id] && String(priceMap[sId][level.id]).trim() !== "") {
          return true;
        }
        const inInvoice = savedInvoices.some(
          (inv: any) =>
            (inv.priceLevel === level.name || inv.priceLevel === level.id) &&
            inv.rows?.some((r: any) => String(r.itemId) === sId)
        );
        if (inInvoice) return true;
        if (level.id === "retail" || level.name === "Retail Price") {
          return true;
        }
        return false;
      }).length;
      return itemsCount;
    });
  }, [filteredLevels, stockItems, priceMap, savedInvoices]);

  const customersMappedByLevel = useMemo(() => {
    return filteredLevels.map((level: PriceLevel) => {
      const custSet = new Set<string>();
      savedInvoices.forEach((inv: any) => {
        if ((inv.priceLevel === level.name || inv.priceLevel === level.id) && inv.customer) {
          custSet.add(inv.customer);
        }
      });
      (customers as any[]).forEach((c: any) => {
        if (c.priceLevel === level.id || c.priceLevel === level.name) {
          if (c.name) custSet.add(c.name);
        }
      });
      return custSet.size;
    });
  }, [filteredLevels, savedInvoices, customers]);

  const trendData = useMemo(() => {
    const months = ["Apr-26", "May-26", "Jun-26", "Jul-26", "Aug-26"];
    const monthPrefixes: Record<string, string> = {
      "Apr-26": "2026-04",
      "May-26": "2026-05",
      "Jun-26": "2026-06",
      "Jul-26": "2026-07",
      "Aug-26": "2026-08",
    };

    return months.map((mLabel) => {
      const prefix = monthPrefixes[mLabel];
      const invoiceCount = savedInvoices.filter((inv: any) => {
        const d = inv.savedAt || inv.invoiceDate;
        return d && d.startsWith(prefix);
      }).length;

      return { label: mLabel, value: invoiceCount };
    });
  }, [savedInvoices]);

  const exportExcel = () => {
    const exportData = filteredLevels.map((l: PriceLevel, idx: number) => {
      const itemsCount = (stockItems as any[]).filter(stock => priceMap[String(stock.id)]?.[l.id]).length;
      const custCount = filteredInvoices.filter((inv: any) => inv.priceLevel === l.name || inv.priceLevel === l.id).length;
      return {
        "#": idx + 1,
        "Price Level": l.name,
        "Description": l.description || "-",
        "Items Mapped": itemsCount,
        "Customers Mapped": custCount,
        "Effective From": appliedFilters.fromDate,
        "Effective To": appliedFilters.toDate,
        "Status": l.active ? "Active" : "Inactive",
      };
    });
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Price Level Report");
    XLSX.writeFile(workbook, `Price_Level_Report_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast({ title: "Excel Exported", description: "Report exported to Excel (.xlsx)." });
  };

  const exportPdf = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Price Level Report", 14, 15);
    doc.setFontSize(10);
    doc.text(`Period: ${appliedFilters.fromDate} to ${appliedFilters.toDate}`, 14, 22);

    const tableData = filteredLevels.map((l: PriceLevel, idx: number) => {
      const itemsCount = (stockItems as any[]).filter(stock => priceMap[String(stock.id)]?.[l.id]).length;
      const custCount = filteredInvoices.filter((inv: any) => inv.priceLevel === l.name || inv.priceLevel === l.id).length;
      return [
        idx + 1,
        l.name,
        l.description || "-",
        itemsCount,
        custCount,
        appliedFilters.fromDate,
        appliedFilters.toDate,
        l.active ? "Active" : "Inactive",
      ];
    });

    autoTable(doc, {
      head: [["#", "Price Level", "Description", "Items Mapped", "Customers Mapped", "Effective From", "Effective To", "Status"]],
      body: tableData,
      startY: 28,
    });

    doc.save(`Price_Level_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
    toast({ title: "PDF Exported", description: "Report exported to PDF." });
  };

  return <div className="min-h-full space-y-4 bg-[#f6f8fc] p-1 animate-in fade-in duration-500">
    <div className="border-b border-slate-200 bg-white px-2 pb-3"><div className="flex items-center gap-2"><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setLocation("/multi-price-level")}><ArrowLeft className="h-4 w-4" /></Button><h1 className="text-2xl font-bold tracking-tight text-[#132d52]">Price Level Reports</h1></div><div className="mt-1 flex flex-wrap items-center gap-2 pl-10 text-xs text-muted-foreground"><span>Home</span><ChevronRight className="h-3 w-3" /><span>Sales</span><ChevronRight className="h-3 w-3" /><span>Price Management</span><ChevronRight className="h-3 w-3" /><span className="text-slate-800">Price Level Reports</span></div></div>
    <div className="flex gap-5 overflow-x-auto border-b border-slate-200 bg-white px-3 pt-1 shadow-sm"><button onClick={() => setLocation("/multi-price-level")} className="whitespace-nowrap border-b-2 border-transparent px-2 py-3 text-xs font-medium text-slate-600 hover:text-[#1265d8]">Price Level Dashboard</button><button className="whitespace-nowrap border-b-2 border-[#1265d8] px-2 py-3 text-xs font-medium text-[#1265d8]">Price Level Reports</button></div>
    <Card><CardContent className="space-y-3 p-3"><div className="grid gap-3 md:grid-cols-2 lg:grid-cols-6"><FilterField label="From Date"><Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} /></FilterField><FilterField label="To Date"><Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} /></FilterField><FilterField label="Price Level"><Select value={priceLevel} onValueChange={setPriceLevel}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All</SelectItem>{levels.map((level: PriceLevel) => <SelectItem key={level.id} value={level.id}>{level.name}</SelectItem>)}</SelectContent></Select></FilterField><FilterField label="Sales Person"><Select value={salesPerson} onValueChange={setSalesPerson}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Sales Persons</SelectItem>{salesPersons.map((sp) => <SelectItem key={sp.id} value={sp.name}>{sp.name}</SelectItem>)}</SelectContent></Select></FilterField><FilterField label="Customer"><Select value={customer} onValueChange={setCustomer}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Customers</SelectItem>{customers.map((c: any) => <SelectItem key={c.id || c.name} value={c.name}>{c.name}</SelectItem>)}</SelectContent></Select></FilterField><FilterField label="Status"><Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent></Select></FilterField></div><div className="flex flex-wrap justify-between gap-2"><div className="flex gap-2"><Button className="bg-[#1265d8] hover:bg-[#0d55b8]" onClick={handleViewReport}>View Report</Button></div><div className="flex gap-2"><DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" className="gap-2 border-slate-300"><Download className="h-4 w-4" /> Export</Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={exportExcel} className="gap-2 cursor-pointer"><FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Excel</DropdownMenuItem><DropdownMenuItem onClick={exportPdf} className="gap-2 cursor-pointer"><FileText className="h-4 w-4 text-red-600" /> PDF</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div></div></CardContent></Card>
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5"><ReportMetric icon={Layers3} value={filteredLevels.length} label="Total Price Levels" detail="Active Price Levels" tone="blue" /><ReportMetric icon={Package} value={mappedItemsCount} label="Total Items Mapped" detail="Items" tone="green" /><ReportMetric icon={UsersRound} value={totalCustomersMapped || customers.length} label="Total Customers Mapped" detail="Customers" tone="violet" /><ReportMetric icon={Download} value={filteredInvoices.length} label="Price Updates (This Period)" detail="Changes" tone="orange" /><ReportMetric icon={CalendarDays} value={effectiveEntries} label="Effective Price Entries" detail="Entries" tone="teal" /></div>
    <Card><CardHeader className="flex flex-row items-center justify-between border-b py-3"><CardTitle className="text-sm">Price Level Summary</CardTitle><Button variant="outline" size="sm" className="text-xs">Customize Columns</Button></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[780px] text-xs"><thead className="bg-[#102d52] text-left text-white"><tr><th className="px-3 py-2">#</th><th className="px-3 py-2">Price Level</th><th className="px-3 py-2">Description</th><th className="px-3 py-2 text-right">Items Mapped</th><th className="px-3 py-2 text-right">Customers Mapped</th><th className="px-3 py-2">Effective From</th><th className="px-3 py-2">Effective To</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Last Updated</th><th className="px-3 py-2">Action</th></tr></thead><tbody className="divide-y">{filteredLevels.map((level: PriceLevel, index: number) => { const custCount = filteredInvoices.filter((inv: any) => inv.priceLevel === level.name || inv.priceLevel === level.id).length; return <tr key={level.id}><td className="px-3 py-2">{index + 1}</td><td className="px-3 py-2 font-medium">{level.name}</td><td className="px-3 py-2">{level.description}</td><td className="px-3 py-2 text-right">{(stockItems as any[]).filter(stock => priceMap[String(stock.id)]?.[level.id]).length}</td><td className="px-3 py-2 text-right">{custCount}</td><td className="px-3 py-2">{appliedFilters.fromDate}</td><td className="px-3 py-2">{appliedFilters.toDate}</td><td className="px-3 py-2"><Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50">{level.active ? "Active" : "Inactive"}</Badge></td><td className="px-3 py-2">-</td><td className="px-3 py-2"><div className="flex items-center gap-1"><Button variant="ghost" size="icon" className="h-7 w-7 text-slate-600 hover:text-blue-600 hover:bg-blue-50" title="View Details" onClick={() => setViewLevel(level)}><Eye className="h-3.5 w-3.5" /></Button><Button variant="ghost" size="icon" className="h-7 w-7 text-slate-600 hover:text-amber-600 hover:bg-amber-50" title="Edit Price Level" onClick={() => { setEditLevel(level); setEditForm({ name: level.name, description: level.description || "", active: level.active }); }}><Pencil className="h-3.5 w-3.5" /></Button><Button variant="ghost" size="icon" className="h-7 w-7 text-slate-600 hover:text-red-600 hover:bg-red-50" title="Delete Price Level" onClick={() => { const updated = levels.filter(l => l.id !== level.id); setLevelData(updated); localStorage.setItem("multi-price-levels-v1", JSON.stringify(updated)); toast({ title: "Price Level Deleted", description: `${level.name} deleted.` }); }}><Trash2 className="h-3.5 w-3.5" /></Button></div></td></tr>; })}</tbody></table></div><div className="flex items-center justify-between px-3 py-3 text-xs text-muted-foreground"><span>Showing 1 to {filteredLevels.length} of {filteredLevels.length} entries</span><span>1 / page</span></div></CardContent></Card>
    <div className="grid gap-4 lg:grid-cols-3">
      <Chart
        title="Items by Price Level"
        values={itemsMappedByLevel}
        labels={filteredLevels.length > 0 ? filteredLevels.map((level: PriceLevel) => level.name) : ["Retail Price", "Wholesale Price", "Dealer Price", "Distributor Price"]}
        colors={["#1665d8", "#22c55e", "#f97316", "#8b62c9"]}
      />
      <Chart
        title="Customers by Price Level"
        values={customersMappedByLevel}
        labels={filteredLevels.length > 0 ? filteredLevels.map((level: PriceLevel) => level.name) : ["Retail Price", "Wholesale Price", "Dealer Price", "Distributor Price"]}
        colors={["#1665d8", "#22c55e", "#f97316", "#8b62c9"]}
      />
      <TrendChart data={trendData} />
    </div>

    {/* View Price Level Modal */}
    <Dialog open={Boolean(viewLevel)} onOpenChange={(open) => !open && setViewLevel(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-[#132d52]">
            Price Level Details
          </DialogTitle>
        </DialogHeader>
        {viewLevel && (
          <div className="space-y-3 py-2 text-xs">
            <div className="flex justify-between border-b pb-2">
              <span className="font-semibold text-slate-600">Price Level Name:</span>
              <span className="font-bold text-slate-900">{viewLevel.name}</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="font-semibold text-slate-600">Description:</span>
              <span className="text-slate-800">{viewLevel.description || "—"}</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="font-semibold text-slate-600">Status:</span>
              <Badge className={viewLevel.active ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-50" : "bg-slate-100 text-slate-600"}>
                {viewLevel.active ? "Active" : "Inactive"}
              </Badge>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="font-semibold text-slate-600">Effective From:</span>
              <span>{appliedFilters.fromDate}</span>
            </div>
            <div className="flex justify-between pb-2">
              <span className="font-semibold text-slate-600">Effective To:</span>
              <span>{appliedFilters.toDate}</span>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setViewLevel(null)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Edit Price Level Modal */}
    <Dialog open={Boolean(editLevel)} onOpenChange={(open) => !open && setEditLevel(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-[#132d52]">
            Edit Price Level
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!editLevel) return;
            const updated = levelData.map((l) =>
              l.id === editLevel.id
                ? { ...l, name: editForm.name, description: editForm.description, active: editForm.active }
                : l
            );
            setLevelData(updated);
            localStorage.setItem("multi-price-levels-v1", JSON.stringify(updated));
            toast({
              title: "Price Level Updated",
              description: `${editForm.name} updated successfully.`,
            });
            setEditLevel(null);
          }}
          className="space-y-4 py-2 text-xs"
        >
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Price Level Name *</Label>
            <Input
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              required
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Description</Label>
            <Input
              value={editForm.description}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Status</Label>
            <Select
              value={editForm.active ? "active" : "inactive"}
              onValueChange={(v) => setEditForm({ ...editForm, active: v === "active" })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setEditLevel(null)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" className="bg-[#1265d8] hover:bg-[#0d55b8]">
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </div>;
}

function FilterField({ label, children }: { label: string; children: ReactNode }) { return <div className="space-y-1"><label className="text-[10px] font-semibold text-slate-600">{label}</label>{children}</div>; }
function ReportMetric({ icon: Icon, value, label, detail, tone }: any) { const tones: any = { blue: "bg-blue-50 text-blue-600", green: "bg-emerald-50 text-emerald-600", violet: "bg-violet-50 text-violet-600", orange: "bg-orange-50 text-orange-600", teal: "bg-cyan-50 text-cyan-600" }; return <Card className="border-0 shadow-sm"><CardContent className="flex items-center gap-3 p-3"><div className={`rounded-lg p-2 ${tones[tone]}`}><Icon className="h-5 w-5" /></div><div><div className="text-[10px] text-muted-foreground">{label}</div><div className="text-xl font-bold text-slate-800">{value}</div><div className="text-[10px] text-slate-600">{detail}</div></div></CardContent></Card>; }

function Chart({
  title,
  values,
  labels,
  colors,
}: {
  title: string;
  values: number[];
  labels: string[];
  colors: string[];
}) {
  const total = values.reduce((sum, val) => sum + val, 0);
  const maxVal = Math.max(...values, 1);

  let accumulatedAngle = 0;
  const gradientSegments =
    total > 0
      ? values
          .map((val, idx) => {
            const startAngle = accumulatedAngle;
            const endAngle = accumulatedAngle + (val / total) * 360;
            accumulatedAngle = endAngle;
            return `${colors[idx % colors.length]} ${startAngle}deg ${endAngle}deg`;
          })
          .join(", ")
      : "#e2e8f0 0deg 360deg";

  return (
    <Card className="shadow-sm">
      <CardHeader className="py-3 px-4 border-b">
        <CardTitle className="text-xs font-semibold text-slate-800">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-4 flex items-center justify-between gap-3">
        <div className="relative flex h-28 w-28 shrink-0 items-center justify-center">
          <div
            className="h-full w-full rounded-full transition-all duration-500 shadow-sm"
            style={{ background: `conic-gradient(${gradientSegments})` }}
          />
          <div className="absolute h-16 w-16 rounded-full bg-white shadow-inner" />
        </div>
        <div className="flex-1 space-y-2 text-xs">
          {labels.map((label, index) => {
            const val = values[index] ?? 0;
            const pct = maxVal > 0 ? Math.round((val / maxVal) * 100) : 0;
            return (
              <div key={label} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: colors[index % colors.length] }}
                  />
                  <span className="truncate font-medium text-slate-700 text-[11px]">{label}</span>
                </div>
                <span className="shrink-0 text-[11px] text-slate-800">
                  <span className="font-semibold">{val}</span>{" "}
                  <span className="text-slate-500">({pct}%)</span>
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function TrendChart({ data }: { data: { label: string; value: number }[] }) {
  const svgWidth = 300;
  const svgHeight = 150;
  const marginLeft = 30;
  const marginRight = 15;
  const marginTop = 20;
  const marginBottom = 22;

  const chartWidth = svgWidth - marginLeft - marginRight;
  const chartHeight = svgHeight - marginTop - marginBottom;

  const maxVal = Math.max(...data.map((d) => d.value), 0);
  const maxY = maxVal > 0 ? Math.ceil((maxVal + 2) / 5) * 5 : 10;

  const points = data.map((d, i) => {
    const x = marginLeft + (i / Math.max(data.length - 1, 1)) * chartWidth;
    const y = marginTop + chartHeight - (d.value / maxY) * chartHeight;
    return { x, y, value: d.value, label: d.label };
  });

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${marginTop + chartHeight} L ${points[0].x} ${marginTop + chartHeight} Z`;

  const step = maxY / 5;
  const yTicks = [
    Math.round(maxY),
    Math.round(maxY - step),
    Math.round(maxY - step * 2),
    Math.round(maxY - step * 3),
    Math.round(maxY - step * 4),
    0,
  ];

  return (
    <Card className="shadow-sm">
      <CardHeader className="py-3 px-4 border-b">
        <CardTitle className="text-xs font-semibold text-slate-800">
          Price Updates Trend (This Period)
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3">
        <div className="w-full overflow-hidden">
          <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-auto">
            <defs>
              <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2563eb" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#2563eb" stopOpacity="0.03" />
              </linearGradient>
            </defs>

            {yTicks.map((tick, idx) => {
              const yPos = marginTop + chartHeight - (tick / maxY) * chartHeight;
              return (
                <g key={`${tick}-${idx}`}>
                  <line
                    x1={marginLeft}
                    y1={yPos}
                    x2={svgWidth - marginRight}
                    y2={yPos}
                    stroke="#f1f5f9"
                    strokeWidth="1"
                  />
                  <text
                    x={marginLeft - 6}
                    y={yPos + 3}
                    textAnchor="end"
                    className="text-[9px] fill-slate-400 font-medium"
                  >
                    {tick}
                  </text>
                </g>
              );
            })}

            <path d={areaPath} fill="url(#trendGradient)" />

            <path
              d={linePath}
              fill="none"
              stroke="#2563eb"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {points.map((p, idx) => (
              <g key={idx}>
                <text
                  x={p.x}
                  y={p.y - 6}
                  textAnchor="middle"
                  className="text-[10px] font-bold fill-slate-800"
                >
                  {p.value}
                </text>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r="3.5"
                  fill="#2563eb"
                  stroke="#ffffff"
                  strokeWidth="1.5"
                />
                <text
                  x={p.x}
                  y={marginTop + chartHeight + 15}
                  textAnchor="middle"
                  className="text-[9px] fill-slate-500 font-medium"
                >
                  {p.label}
                </text>
              </g>
            ))}
          </svg>
        </div>
      </CardContent>
    </Card>
  );
}


