import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useListInvoices, useListStockItems, getListInvoicesQueryKey, getListStockItemsQueryKey } from "@workspace/api-client-react";
import { inventoryApi } from "@/lib/inventory-api";
import { useSalesPersons } from "@/hooks/use-sales-persons";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SyncBridgeDatePicker } from "@/components/ui/sync-bridge-date-picker";
import { ListPagination } from "@/components/list-pagination";
import { usePagination } from "@/hooks/use-pagination";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  FileSpreadsheet,
  FileText,
  Printer,
  RotateCcw,
  Search,
  Users,
  Package,
  CircleDollarSign,
  Percent,
  Wallet,
} from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type ReportType = "summary" | "detailed";
type ViewLevel = "summary" | "items" | "invoices";

type Filters = {
  dateFrom: string;
  dateTo: string;
  salesPerson: string;
  warehouseId: string;
  category: string;
  itemId: string;
  reportType: ReportType;
};

type LineFact = {
  salesPerson: string;
  invoiceId: number;
  invoiceNo: string;
  invoiceDate: string;
  customerName: string;
  itemCode: string;
  itemName: string;
  stockItemId?: number;
  category: string;
  warehouseId?: number;
  warehouseName: string;
  qty: number;
  unitPrice: number;
  salesValue: number;
  discount: number;
  netSales: number;
  costValue: number;
  profit: number;
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function defaultFilters(): Filters {
  return {
    dateFrom: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`,
    dateTo: todayIso(),
    salesPerson: "all",
    warehouseId: "all",
    category: "all",
    itemId: "all",
    reportType: "summary",
  };
}

function money(n: number) {
  return n.toLocaleString("en-SG", { style: "currency", currency: "SGD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function qtyFmt(n: number) {
  return n.toLocaleString("en-SG", { maximumFractionDigits: 3 });
}

function pctFmt(n: number) {
  return `${n.toFixed(1)}%`;
}

function plainText(html?: string | null) {
  if (!html) return "";
  return String(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function inDateRange(ymd: string, from: string, to: string) {
  if (!ymd) return false;
  if (from && ymd < from) return false;
  if (to && ymd > to) return false;
  return true;
}

function loadPosSales(): any[] {
  try {
    const raw = localStorage.getItem("pos-sales-v1");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function FilterField({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0 space-y-1.5", className)}>
      <Label className="text-xs font-medium text-[#6B7280]">{label}</Label>
      {children}
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon: Icon,
  iconBg,
  iconColor,
}: {
  label: string;
  value: string;
  icon: typeof Users;
  iconBg: string;
  iconColor: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[#E5E7EB] bg-white px-4 py-3 shadow-sm">
      <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", iconBg)}>
        <Icon className={cn("h-5 w-5", iconColor)} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-[#6B7280]">{label}</p>
        <p className="truncate text-lg font-semibold text-[#111827]">{value}</p>
      </div>
    </div>
  );
}

export default function SalesPersonWiseReportPage() {
  const { toast } = useToast();
  const { salesPersons } = useSalesPersons();
  const [draft, setDraft] = useState<Filters>(() => defaultFilters());
  const [applied, setApplied] = useState<Filters>(() => defaultFilters());
  const [view, setView] = useState<ViewLevel>("summary");
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null);
  const [selectedItemCode, setSelectedItemCode] = useState<string | null>(null);
  const [selectedItemName, setSelectedItemName] = useState<string | null>(null);

  const { data: warehouses = [] } = useQuery<any[]>({
    queryKey: ["sp-wise-warehouses"],
    queryFn: () => inventoryApi.getWarehouses(),
    staleTime: 60_000,
  });

  const { data: stockItems = [] } = useListStockItems(
    {} as any,
    { query: { queryKey: getListStockItemsQueryKey({} as any), refetchOnWindowFocus: false } },
  );

  const { data: invoices = [] } = useListInvoices(
    {} as any,
    { query: { queryKey: getListInvoicesQueryKey(), refetchOnWindowFocus: false } },
  );

  const activeItems = useMemo(
    () => (stockItems as any[]).filter((i) => i.isActive !== false),
    [stockItems],
  );

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const i of activeItems) {
      const c = String(i.category || "").trim();
      if (c) set.add(c);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [activeItems]);

  const itemById = useMemo(() => {
    const map = new Map<string, any>();
    for (const i of activeItems) map.set(String(i.id), i);
    return map;
  }, [activeItems]);

  const facts = useMemo(() => {
    const rows: LineFact[] = [];

    for (const inv of invoices as any[]) {
      const status = String(inv.status || "").toLowerCase();
      if (status === "draft" || status === "void" || status === "cancelled") continue;
      const date = String(inv.issueDate || inv.createdAt || "").slice(0, 10);
      if (!inDateRange(date, applied.dateFrom, applied.dateTo)) continue;
      const person = String(inv.salesPerson || "").trim() || "Unassigned";
      if (applied.salesPerson !== "all" && person !== applied.salesPerson) continue;

      const items = Array.isArray(inv.items) ? inv.items : [];
      const invDiscount = Number(inv.discountAmount) || 0;
      const invSubtotal = Number(inv.subtotal) || items.reduce((s: number, it: any) => {
        const q = Number(it.qty) || 0;
        const p = Number(it.unitPrice) || 0;
        return s + q * p;
      }, 0);

      for (const it of items) {
        if (it?.type === "section") continue;
        const qty = Number(it.qty) || 0;
        if (!(qty > 0)) continue;
        const unitPrice = Number(it.unitPrice) || 0;
        const salesValue = qty * unitPrice;
        const lineDiscPct = Number(it.discount) || 0;
        const lineDiscAmt = lineDiscPct > 0
          ? salesValue * (lineDiscPct / 100)
          : (invSubtotal > 0 ? (salesValue / invSubtotal) * invDiscount : 0);
        const netSales = Math.max(0, salesValue - lineDiscAmt);
        const stockItemId = Number(it.stockItemId) > 0 ? Number(it.stockItemId) : undefined;
        const stock = stockItemId ? itemById.get(String(stockItemId)) : undefined;
        const costUnit = parseFloat(String(stock?.purchasePrice ?? it.purchasePrice ?? 0)) || 0;
        const costValue = costUnit * qty;
        const category = String(stock?.category || it.category || "").trim() || "Uncategorized";
        const warehouseId = Number(it.warehouseId) > 0 ? Number(it.warehouseId) : undefined;
        const warehouseName = String(it.warehouseName || "").trim()
          || (warehouseId ? warehouses.find((w) => Number(w.id) === warehouseId)?.name : "")
          || "";

        if (applied.warehouseId !== "all" && String(warehouseId || "") !== applied.warehouseId) continue;
        if (applied.category !== "all" && category !== applied.category) continue;
        if (applied.itemId !== "all") {
          if (stockItemId) {
            if (String(stockItemId) !== applied.itemId) continue;
          } else {
            const target = itemById.get(applied.itemId);
            if (!target || String(target.code) !== String(it.partNumber || "")) continue;
          }
        }

        rows.push({
          salesPerson: person,
          invoiceId: Number(inv.id),
          invoiceNo: String(inv.invNumber || ""),
          invoiceDate: date,
          customerName: String(inv.customerName || ""),
          itemCode: String(it.partNumber || stock?.code || ""),
          itemName: plainText(it.description) || String(stock?.name || it.partNumber || "Item"),
          stockItemId,
          category,
          warehouseId,
          warehouseName,
          qty,
          unitPrice,
          salesValue,
          discount: lineDiscAmt,
          netSales,
          costValue,
          profit: netSales - costValue,
        });
      }
    }

    // POS sales (local)
    for (const sale of loadPosSales()) {
      const date = String(sale.date || sale.createdAt || "").slice(0, 10);
      if (!inDateRange(date, applied.dateFrom, applied.dateTo)) continue;
      const person = String(sale.salesPerson || "").trim() || "Unassigned";
      if (applied.salesPerson !== "all" && person !== applied.salesPerson) continue;
      const lines = Array.isArray(sale.items) ? sale.items : Array.isArray(sale.lines) ? sale.lines : [];
      for (const it of lines) {
        const qty = Number(it.qty ?? it.quantity) || 0;
        if (!(qty > 0)) continue;
        const unitPrice = Number(it.unitPrice ?? it.price) || 0;
        const salesValue = qty * unitPrice;
        const discount = Number(it.discount) || 0;
        const netSales = Math.max(0, salesValue - discount);
        const stockItemId = Number(it.stockItemId ?? it.id) > 0 ? Number(it.stockItemId ?? it.id) : undefined;
        const stock = stockItemId ? itemById.get(String(stockItemId)) : undefined;
        const costUnit = parseFloat(String(stock?.purchasePrice ?? it.cost ?? 0)) || 0;
        const costValue = costUnit * qty;
        const category = String(stock?.category || "").trim() || "Uncategorized";
        const warehouseId = Number(it.warehouseId) > 0 ? Number(it.warehouseId) : undefined;
        if (applied.warehouseId !== "all" && String(warehouseId || "") !== applied.warehouseId) continue;
        if (applied.category !== "all" && category !== applied.category) continue;
        if (applied.itemId !== "all" && String(stockItemId || "") !== applied.itemId) continue;

        rows.push({
          salesPerson: person,
          invoiceId: Number(sale.id) || 0,
          invoiceNo: String(sale.receiptNo || sale.number || `POS-${sale.id || ""}`),
          invoiceDate: date,
          customerName: String(sale.customerName || "Walk-in"),
          itemCode: String(it.code || it.partNumber || stock?.code || ""),
          itemName: String(it.name || stock?.name || "Item"),
          stockItemId,
          category,
          warehouseId,
          warehouseName: String(it.warehouseName || ""),
          qty,
          unitPrice,
          salesValue,
          discount,
          netSales,
          costValue,
          profit: netSales - costValue,
        });
      }
    }

    return rows;
  }, [invoices, applied, itemById, warehouses]);

  const personSummary = useMemo(() => {
    const map = new Map<string, {
      salesPerson: string;
      invoiceIds: Set<string>;
      qtySold: number;
      grossSales: number;
      discount: number;
      netSales: number;
      costValue: number;
    }>();
    for (const f of facts) {
      const key = f.salesPerson;
      let row = map.get(key);
      if (!row) {
        row = {
          salesPerson: key,
          invoiceIds: new Set(),
          qtySold: 0,
          grossSales: 0,
          discount: 0,
          netSales: 0,
          costValue: 0,
        };
        map.set(key, row);
      }
      row.invoiceIds.add(`${f.invoiceNo}|${f.invoiceDate}`);
      row.qtySold += f.qty;
      row.grossSales += f.salesValue;
      row.discount += f.discount;
      row.netSales += f.netSales;
      row.costValue += f.costValue;
    }
    return Array.from(map.values())
      .map((r) => {
        const grossProfit = r.netSales - r.costValue;
        const margin = r.netSales > 0 ? (grossProfit / r.netSales) * 100 : 0;
        return {
          salesPerson: r.salesPerson,
          invoiceCount: r.invoiceIds.size,
          qtySold: r.qtySold,
          grossSales: r.grossSales,
          discount: r.discount,
          netSales: r.netSales,
          costValue: r.costValue,
          grossProfit,
          margin,
        };
      })
      .sort((a, b) => b.netSales - a.netSales);
  }, [facts]);

  const itemDetails = useMemo(() => {
    if (!selectedPerson) return [];
    const map = new Map<string, {
      itemCode: string;
      itemName: string;
      qtySold: number;
      salesValue: number;
      discount: number;
      netSales: number;
      costValue: number;
    }>();
    for (const f of facts) {
      if (f.salesPerson !== selectedPerson) continue;
      const key = f.itemCode || f.itemName;
      let row = map.get(key);
      if (!row) {
        row = {
          itemCode: f.itemCode,
          itemName: f.itemName,
          qtySold: 0,
          salesValue: 0,
          discount: 0,
          netSales: 0,
          costValue: 0,
        };
        map.set(key, row);
      }
      row.qtySold += f.qty;
      row.salesValue += f.salesValue;
      row.discount += f.discount;
      row.netSales += f.netSales;
      row.costValue += f.costValue;
    }
    return Array.from(map.values())
      .map((r) => {
        const profit = r.netSales - r.costValue;
        const margin = r.netSales > 0 ? (profit / r.netSales) * 100 : 0;
        return { ...r, profit, margin };
      })
      .sort((a, b) => b.netSales - a.netSales);
  }, [facts, selectedPerson]);

  const invoiceDetails = useMemo(() => {
    if (!selectedPerson || !selectedItemCode) return [];
    return facts
      .filter((f) => f.salesPerson === selectedPerson && (f.itemCode || f.itemName) === selectedItemCode)
      .map((f) => ({
        invoiceNo: f.invoiceNo,
        invoiceDate: f.invoiceDate,
        customerName: f.customerName,
        qty: f.qty,
        unitPrice: f.unitPrice,
        salesValue: f.salesValue,
        discount: f.discount,
        netAmount: f.netSales,
      }))
      .sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate) || a.invoiceNo.localeCompare(b.invoiceNo));
  }, [facts, selectedPerson, selectedItemCode]);

  const kpis = useMemo(() => {
    const persons = new Set(personSummary.map((p) => p.salesPerson));
    const qtySold = personSummary.reduce((s, r) => s + r.qtySold, 0);
    const grossSales = personSummary.reduce((s, r) => s + r.grossSales, 0);
    const discount = personSummary.reduce((s, r) => s + r.discount, 0);
    const netSales = personSummary.reduce((s, r) => s + r.netSales, 0);
    return { persons: persons.size, qtySold, grossSales, discount, netSales };
  }, [personSummary]);

  const personPager = usePagination(personSummary, 10);
  const itemPager = usePagination(itemDetails, 10);
  const invoicePager = usePagination(invoiceDetails, 10);

  const selectedPersonRow = personSummary.find((r) => r.salesPerson === selectedPerson) || null;

  useEffect(() => {
    if (personSummary.length === 0) {
      if (selectedPerson) setSelectedPerson(null);
      return;
    }
    if (!selectedPerson || !personSummary.some((r) => r.salesPerson === selectedPerson)) {
      setSelectedPerson(personSummary[0].salesPerson);
    }
  }, [personSummary, selectedPerson]);

  useEffect(() => {
    if (!selectedPerson || itemDetails.length === 0) {
      if (selectedItemCode) {
        setSelectedItemCode(null);
        setSelectedItemName(null);
      }
      return;
    }
    const match = itemDetails.find((r) => (r.itemCode || r.itemName) === selectedItemCode);
    if (!match) {
      const first = itemDetails[0];
      setSelectedItemCode(first.itemCode || first.itemName);
      setSelectedItemName(first.itemName);
    }
  }, [itemDetails, selectedPerson, selectedItemCode]);

  function search() {
    setApplied({ ...draft });
    setView("summary");
    setSelectedPerson(null);
    setSelectedItemCode(null);
    setSelectedItemName(null);
    toast({ title: "Report updated" });
  }

  function reset() {
    const next = defaultFilters();
    setDraft(next);
    setApplied(next);
    setView("summary");
    setSelectedPerson(null);
    setSelectedItemCode(null);
    setSelectedItemName(null);
  }

  function openPerson(name: string) {
    setSelectedPerson(name);
    setSelectedItemCode(null);
    setSelectedItemName(null);
    setView("items");
  }

  function openItem(code: string, name: string) {
    setSelectedItemCode(code || name);
    setSelectedItemName(name);
    setView("invoices");
  }

  function exportExcel() {
    const wb = XLSX.utils.book_new();
    if (view === "summary" || applied.reportType === "summary") {
      const data = personSummary.map((r, i) => ({
        "#": i + 1,
        "Sales Person": r.salesPerson,
        "No. of Invoices": r.invoiceCount,
        "Qty Sold": r.qtySold,
        "Gross Sales": r.grossSales,
        Discount: r.discount,
        "Net Sales": r.netSales,
        "Cost Value": r.costValue,
        "Gross Profit": r.grossProfit,
        "Margin %": r.margin,
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "Summary");
    }
    if (view === "items" || applied.reportType === "detailed") {
      const data = itemDetails.map((r, i) => ({
        "#": i + 1,
        "Item Code": r.itemCode,
        "Item Name": r.itemName,
        "Qty Sold": r.qtySold,
        "Sales Value": r.salesValue,
        Discount: r.discount,
        "Net Sales": r.netSales,
        "Cost Value": r.costValue,
        Profit: r.profit,
        "Margin %": r.margin,
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), selectedPerson || "Items");
    }
    if (view === "invoices") {
      const data = invoiceDetails.map((r, i) => ({
        "#": i + 1,
        "Invoice No": r.invoiceNo,
        "Invoice Date": r.invoiceDate,
        "Customer Name": r.customerName,
        Qty: r.qty,
        "Unit Price": r.unitPrice,
        "Sales Value": r.salesValue,
        Discount: r.discount,
        "Net Amount": r.netAmount,
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "Invoices");
    }
    XLSX.writeFile(wb, `sales-person-wise-report-${todayIso()}.xlsx`);
  }

  function exportPdf() {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(14);
    doc.text("Sales Person Wise Stock Report", 14, 16);
    doc.setFontSize(9);
    doc.text(`${applied.dateFrom} to ${applied.dateTo}`, 14, 22);

    if (view === "summary") {
      autoTable(doc, {
        startY: 28,
        head: [["#", "Sales Person", "Invoices", "Qty Sold", "Gross Sales", "Discount", "Net Sales", "Cost Value", "Gross Profit", "Margin %"]],
        body: personSummary.map((r, i) => [
          i + 1,
          r.salesPerson,
          r.invoiceCount,
          qtyFmt(r.qtySold),
          money(r.grossSales),
          money(r.discount),
          money(r.netSales),
          money(r.costValue),
          money(r.grossProfit),
          pctFmt(r.margin),
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [16, 45, 82] },
      });
    } else if (view === "items") {
      autoTable(doc, {
        startY: 28,
        head: [["#", "Item Code", "Item Name", "Qty Sold", "Sales Value", "Discount", "Net Sales", "Cost Value", "Profit", "Margin %"]],
        body: itemDetails.map((r, i) => [
          i + 1,
          r.itemCode,
          r.itemName,
          qtyFmt(r.qtySold),
          money(r.salesValue),
          money(r.discount),
          money(r.netSales),
          money(r.costValue),
          money(r.profit),
          pctFmt(r.margin),
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [16, 45, 82] },
      });
    } else {
      autoTable(doc, {
        startY: 28,
        head: [["#", "Invoice No", "Date", "Customer", "Qty", "Unit Price", "Sales Value", "Discount", "Net Amount"]],
        body: invoiceDetails.map((r, i) => [
          i + 1,
          r.invoiceNo,
          r.invoiceDate,
          r.customerName,
          qtyFmt(r.qty),
          money(r.unitPrice),
          money(r.salesValue),
          money(r.discount),
          money(r.netAmount),
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [16, 45, 82] },
      });
    }
    doc.save(`sales-person-wise-report-${todayIso()}.pdf`);
  }

  function printReport() {
    window.print();
  }

  return (
    <div className="min-h-full space-y-5 bg-[#F6F8FC] p-1 print:bg-white">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#132D52]">Sales Person Wise Stock Report</h1>
        <p className="mt-1 text-sm text-[#6B7280]">View sales and stock movement details based on Sales Person.</p>
      </div>

      {/* Filters */}
      <section className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm print:hidden">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <FilterField label="From Date">
            <SyncBridgeDatePicker
              value={draft.dateFrom}
              onChange={(v) => setDraft((f) => ({ ...f, dateFrom: v || f.dateFrom }))}
              placeholder="From"
              max={draft.dateTo || undefined}
            />
          </FilterField>
          <FilterField label="To Date">
            <SyncBridgeDatePicker
              value={draft.dateTo}
              onChange={(v) => setDraft((f) => ({ ...f, dateTo: v || f.dateTo }))}
              placeholder="To"
              min={draft.dateFrom || undefined}
            />
          </FilterField>
          <FilterField label="Sales Person">
            <Select value={draft.salesPerson} onValueChange={(v) => setDraft((f) => ({ ...f, salesPerson: v }))}>
              <SelectTrigger className="h-10 bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {salesPersons.map((sp) => (
                  <SelectItem key={sp.id} value={sp.name}>{sp.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="Warehouse">
            <Select value={draft.warehouseId} onValueChange={(v) => setDraft((f) => ({ ...f, warehouseId: v }))}>
              <SelectTrigger className="h-10 bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {warehouses.map((w) => (
                  <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="Item Category">
            <Select value={draft.category} onValueChange={(v) => setDraft((f) => ({ ...f, category: v }))}>
              <SelectTrigger className="h-10 bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="Item">
            <Select value={draft.itemId} onValueChange={(v) => setDraft((f) => ({ ...f, itemId: v }))}>
              <SelectTrigger className="h-10 bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {activeItems.map((i) => (
                  <SelectItem key={i.id} value={String(i.id)}>{i.code} - {i.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
        </div>

        <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
          <FilterField label="Report Type" className="w-auto">
            <RadioGroup
              value={draft.reportType}
              onValueChange={(v) => setDraft((f) => ({ ...f, reportType: v as ReportType }))}
              className="flex h-10 items-center gap-4"
            >
              <label className="flex items-center gap-2 text-sm text-[#111827]">
                <RadioGroupItem value="summary" /> Summary
              </label>
              <label className="flex items-center gap-2 text-sm text-[#111827]">
                <RadioGroupItem value="detailed" /> Detailed
              </label>
            </RadioGroup>
          </FilterField>

          <div className="flex flex-wrap gap-2">
            <Button type="button" className="gap-2 bg-[#2563EB] hover:bg-[#1D4ED8]" onClick={search}>
              <Search className="h-4 w-4" /> Search
            </Button>
            <Button type="button" variant="outline" className="gap-2" onClick={reset}>
              <RotateCcw className="h-4 w-4" /> Reset
            </Button>
            <Button type="button" className="gap-2 bg-[#16A34A] hover:bg-[#15803D]" onClick={exportExcel}>
              <FileSpreadsheet className="h-4 w-4" /> Excel
            </Button>
            <Button type="button" className="gap-2 bg-[#DC2626] hover:bg-[#B91C1C]" onClick={exportPdf}>
              <FileText className="h-4 w-4" /> PDF
            </Button>
            <Button type="button" variant="secondary" className="gap-2" onClick={printReport}>
              <Printer className="h-4 w-4" /> Print
            </Button>
          </div>
        </div>
      </section>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard label="Sales Persons" value={String(kpis.persons)} icon={Users} iconBg="bg-[#DBEAFE]" iconColor="text-[#2563EB]" />
        <KpiCard label="Total Qty Sold" value={qtyFmt(kpis.qtySold)} icon={Package} iconBg="bg-[#DCFCE7]" iconColor="text-[#16A34A]" />
        <KpiCard label="Gross Sales" value={money(kpis.grossSales)} icon={CircleDollarSign} iconBg="bg-[#EDE9FE]" iconColor="text-[#7C3AED]" />
        <KpiCard label="Discount" value={money(kpis.discount)} icon={Percent} iconBg="bg-[#FFEDD5]" iconColor="text-[#EA580C]" />
        <KpiCard label="Net Sales" value={money(kpis.netSales)} icon={Wallet} iconBg="bg-[#CCFBF1]" iconColor="text-[#0D9488]" />
      </div>

      {/* Summary table */}
      <section id="sp-summary" className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-sm">
          <div className="border-b border-[#E5E7EB] px-4 py-3">
            <h2 className="text-sm font-semibold text-[#111827]">Sales Person Summary</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="bg-[#102D52] text-left text-white">
                <tr>
                  <th className="px-3 py-2.5 font-medium">#</th>
                  <th className="px-3 py-2.5 font-medium">Sales Person</th>
                  <th className="px-3 py-2.5 font-medium text-right">No. of Invoices</th>
                  <th className="px-3 py-2.5 font-medium text-right">Qty Sold</th>
                  <th className="px-3 py-2.5 font-medium text-right">Gross Sales</th>
                  <th className="px-3 py-2.5 font-medium text-right">Discount</th>
                  <th className="px-3 py-2.5 font-medium text-right">Net Sales</th>
                  <th className="px-3 py-2.5 font-medium text-right">Cost Value</th>
                  <th className="px-3 py-2.5 font-medium text-right">Gross Profit</th>
                  <th className="px-3 py-2.5 font-medium text-right">Margin %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB]">
                {personPager.paginatedItems.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-3 py-10 text-center text-[#6B7280]">No sales data for selected filters.</td>
                  </tr>
                ) : (
                  personPager.paginatedItems.map((r, idx) => (
                    <tr key={r.salesPerson} className={cn("odd:bg-white even:bg-[#F8FAFC] hover:bg-[#EFF6FF]/60", selectedPerson === r.salesPerson && "bg-[#EFF6FF]")}>
                      <td className="px-3 py-2.5 text-[#6B7280]">{(personPager.page - 1) * personPager.pageSize + idx + 1}</td>
                      <td className="px-3 py-2.5">
                        <button
                          type="button"
                          className="font-medium text-[#2563EB] hover:underline"
                          onClick={() => openPerson(r.salesPerson)}
                        >
                          {r.salesPerson}
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-right">{r.invoiceCount}</td>
                      <td className="px-3 py-2.5 text-right">{qtyFmt(r.qtySold)}</td>
                      <td className="px-3 py-2.5 text-right">{money(r.grossSales)}</td>
                      <td className="px-3 py-2.5 text-right">{money(r.discount)}</td>
                      <td className="px-3 py-2.5 text-right font-medium">{money(r.netSales)}</td>
                      <td className="px-3 py-2.5 text-right">{money(r.costValue)}</td>
                      <td className="px-3 py-2.5 text-right">{money(r.grossProfit)}</td>
                      <td className="px-3 py-2.5 text-right">{pctFmt(r.margin)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              {personSummary.length > 0 && (
                <tfoot className="border-t-2 border-[#102D52] bg-[#F1F5F9] font-semibold">
                  <tr>
                    <td className="px-3 py-2.5" colSpan={2}>Total</td>
                    <td className="px-3 py-2.5 text-right">{personSummary.reduce((s, r) => s + r.invoiceCount, 0)}</td>
                    <td className="px-3 py-2.5 text-right">{qtyFmt(kpis.qtySold)}</td>
                    <td className="px-3 py-2.5 text-right">{money(kpis.grossSales)}</td>
                    <td className="px-3 py-2.5 text-right">{money(kpis.discount)}</td>
                    <td className="px-3 py-2.5 text-right">{money(kpis.netSales)}</td>
                    <td className="px-3 py-2.5 text-right">{money(personSummary.reduce((s, r) => s + r.costValue, 0))}</td>
                    <td className="px-3 py-2.5 text-right">{money(personSummary.reduce((s, r) => s + r.grossProfit, 0))}</td>
                    <td className="px-3 py-2.5 text-right">
                      {pctFmt(kpis.netSales > 0
                        ? (personSummary.reduce((s, r) => s + r.grossProfit, 0) / kpis.netSales) * 100
                        : 0)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <div className="border-t border-[#E5E7EB] px-3 py-2">
            <ListPagination
              page={personPager.page}
              totalPages={personPager.totalPages}
              onPageChange={personPager.setPage}
            />
          </div>
        </section>

      {/* Item drill-down */}
      <section id="sp-items" className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E5E7EB] px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-[#111827]">Sales Person Wise – Item Details (Drill Down)</h2>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => document.getElementById("sp-summary")?.scrollIntoView({ behavior: "smooth" })}
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to Summary
            </Button>
          </div>
          {selectedPersonRow ? (
            <div className="flex flex-wrap gap-x-6 gap-y-1 border-b border-[#BFDBFE] bg-[#EFF6FF] px-4 py-2 text-xs text-[#1E3A5F]">
              <span>Sales Person : <button type="button" className="font-semibold text-[#2563EB]" onClick={() => document.getElementById("sp-summary")?.scrollIntoView({ behavior: "smooth" })}>{selectedPersonRow.salesPerson}</button></span>
              <span>No. of Invoices : <strong>{selectedPersonRow.invoiceCount}</strong></span>
              <span>Qty Sold : <strong>{qtyFmt(selectedPersonRow.qtySold)}</strong></span>
              <span>Net Sales : <strong>{money(selectedPersonRow.netSales)}</strong></span>
            </div>
          ) : null}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead className="bg-[#102D52] text-left text-white">
                <tr>
                  <th className="px-3 py-2.5 font-medium">#</th>
                  <th className="px-3 py-2.5 font-medium">Item Code</th>
                  <th className="px-3 py-2.5 font-medium">Item Name</th>
                  <th className="px-3 py-2.5 font-medium text-right">Qty Sold</th>
                  <th className="px-3 py-2.5 font-medium text-right">Sales Value</th>
                  <th className="px-3 py-2.5 font-medium text-right">Discount</th>
                  <th className="px-3 py-2.5 font-medium text-right">Net Sales</th>
                  <th className="px-3 py-2.5 font-medium text-right">Cost Value</th>
                  <th className="px-3 py-2.5 font-medium text-right">Profit</th>
                  <th className="px-3 py-2.5 font-medium text-right">Margin %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB]">
                {itemPager.paginatedItems.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-3 py-10 text-center text-[#6B7280]">No item sales for this sales person.</td>
                  </tr>
                ) : (
                  itemPager.paginatedItems.map((r, idx) => (
                    <tr key={`${r.itemCode}-${r.itemName}`} className="odd:bg-white even:bg-[#F8FAFC]">
                      <td className="px-3 py-2.5 text-[#6B7280]">{(itemPager.page - 1) * itemPager.pageSize + idx + 1}</td>
                      <td className="px-3 py-2.5">
                        <button type="button" className="font-medium text-[#2563EB] hover:underline" onClick={() => openItem(r.itemCode || r.itemName, r.itemName)}>
                          {r.itemCode || "—"}
                        </button>
                      </td>
                      <td className="px-3 py-2.5">
                        <button type="button" className="text-[#2563EB] hover:underline" onClick={() => openItem(r.itemCode || r.itemName, r.itemName)}>
                          {r.itemName}
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-right">{qtyFmt(r.qtySold)}</td>
                      <td className="px-3 py-2.5 text-right">{money(r.salesValue)}</td>
                      <td className="px-3 py-2.5 text-right">{money(r.discount)}</td>
                      <td className="px-3 py-2.5 text-right font-medium">{money(r.netSales)}</td>
                      <td className="px-3 py-2.5 text-right">{money(r.costValue)}</td>
                      <td className="px-3 py-2.5 text-right">{money(r.profit)}</td>
                      <td className="px-3 py-2.5 text-right">{pctFmt(r.margin)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              {itemDetails.length > 0 && (
                <tfoot className="border-t-2 border-[#102D52] bg-[#F1F5F9] font-semibold">
                  <tr>
                    <td className="px-3 py-2.5" colSpan={3}>Total</td>
                    <td className="px-3 py-2.5 text-right">{qtyFmt(itemDetails.reduce((s, r) => s + r.qtySold, 0))}</td>
                    <td className="px-3 py-2.5 text-right">{money(itemDetails.reduce((s, r) => s + r.salesValue, 0))}</td>
                    <td className="px-3 py-2.5 text-right">{money(itemDetails.reduce((s, r) => s + r.discount, 0))}</td>
                    <td className="px-3 py-2.5 text-right">{money(itemDetails.reduce((s, r) => s + r.netSales, 0))}</td>
                    <td className="px-3 py-2.5 text-right">{money(itemDetails.reduce((s, r) => s + r.costValue, 0))}</td>
                    <td className="px-3 py-2.5 text-right">{money(itemDetails.reduce((s, r) => s + r.profit, 0))}</td>
                    <td className="px-3 py-2.5 text-right">—</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <div className="border-t border-[#E5E7EB] px-3 py-2">
            <ListPagination
              page={itemPager.page}
              totalPages={itemPager.totalPages}
              onPageChange={itemPager.setPage}
            />
          </div>
        </section>

      {/* Invoice drill-down */}
      <section className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E5E7EB] px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-[#111827]">Invoice Details (Item Drill Down)</h2>
              <p className="text-xs text-[#6B7280]">
                Sales Person : {selectedPerson} &gt; Item : {selectedItemName || selectedItemCode}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => document.getElementById("sp-items")?.scrollIntoView({ behavior: "smooth" })}
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to Items
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-[#102D52] text-left text-white">
                <tr>
                  <th className="px-3 py-2.5 font-medium">#</th>
                  <th className="px-3 py-2.5 font-medium">Invoice No</th>
                  <th className="px-3 py-2.5 font-medium">Invoice Date</th>
                  <th className="px-3 py-2.5 font-medium">Customer Name</th>
                  <th className="px-3 py-2.5 font-medium text-right">Qty</th>
                  <th className="px-3 py-2.5 font-medium text-right">Unit Price</th>
                  <th className="px-3 py-2.5 font-medium text-right">Sales Value</th>
                  <th className="px-3 py-2.5 font-medium text-right">Discount</th>
                  <th className="px-3 py-2.5 font-medium text-right">Net Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB]">
                {invoicePager.paginatedItems.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-10 text-center text-[#6B7280]">No invoices for this item.</td>
                  </tr>
                ) : (
                  invoicePager.paginatedItems.map((r, idx) => (
                    <tr key={`${r.invoiceNo}-${idx}`} className="odd:bg-white even:bg-[#F8FAFC]">
                      <td className="px-3 py-2.5 text-[#6B7280]">{(invoicePager.page - 1) * invoicePager.pageSize + idx + 1}</td>
                      <td className="px-3 py-2.5 font-medium text-[#2563EB]">{r.invoiceNo}</td>
                      <td className="px-3 py-2.5">{r.invoiceDate}</td>
                      <td className="px-3 py-2.5">{r.customerName}</td>
                      <td className="px-3 py-2.5 text-right">{qtyFmt(r.qty)}</td>
                      <td className="px-3 py-2.5 text-right">{money(r.unitPrice)}</td>
                      <td className="px-3 py-2.5 text-right">{money(r.salesValue)}</td>
                      <td className="px-3 py-2.5 text-right">{money(r.discount)}</td>
                      <td className="px-3 py-2.5 text-right font-medium">{money(r.netAmount)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="border-t border-[#E5E7EB] px-3 py-2">
            <ListPagination
              page={invoicePager.page}
              totalPages={invoicePager.totalPages}
              onPageChange={invoicePager.setPage}
            />
          </div>
        </section>
    </div>
  );
}
