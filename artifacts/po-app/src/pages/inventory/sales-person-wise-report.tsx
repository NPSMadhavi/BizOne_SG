import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useListInvoices, useListStockItems, getListInvoicesQueryKey, getListStockItemsQueryKey } from "@workspace/api-client-react";
import { inventoryApi } from "@/lib/inventory-api";
import { useSalesPersons } from "@/hooks/use-sales-persons";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SyncBridgeDatePicker } from "@/components/ui/sync-bridge-date-picker";
import {
  ManagementTableCard,
  ManagementTableContainer,
  ManagementEmptyState,
} from "@/operations-8june/components/layout/ManagementPageUI";
import { usePagination } from "@/hooks/use-pagination";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  ChevronDown,
  FileSpreadsheet,
  FileText,
  Printer,
  Users,
  Package,
  CircleDollarSign,
  Percent,
  Wallet,
  Receipt,
} from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type PrintSection = "summary" | "items" | "invoices";

type Filters = {
  dateFrom: string;
  dateTo: string;
  salesPerson: string;
  warehouseId: string;
  category: string;
  itemId: string;
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
  gst: number;
  netSales: number;
  invoiceValue: number;
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
  const [, setLocation] = useLocation();
  const { salesPersons } = useSalesPersons();
  const [filters, setFilters] = useState<Filters>(() => defaultFilters());
  const [selectedItem, setSelectedItem] = useState<{
    salesPerson: string;
    itemCode: string;
    itemName: string;
  } | null>(null);

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
      if (!inDateRange(date, filters.dateFrom, filters.dateTo)) continue;
      const person = String(inv.salesPerson || "").trim() || "Unassigned";
      if (filters.salesPerson !== "all" && person !== filters.salesPerson) continue;

      const items = Array.isArray(inv.items) ? inv.items : [];
      const invDiscount = Number(inv.discountAmount) || 0;
      const invSubtotal = Number(inv.subtotal) || items.reduce((s: number, it: any) => {
        const q = Number(it.qty) || 0;
        const p = Number(it.unitPrice) || 0;
        return s + q * p;
      }, 0);
      const invTaxable = Math.max(0, invSubtotal - invDiscount);
      const invGst = Number(inv.tax) || 0;

      // Pre-compute line nets so GST can be allocated by share of taxable net
      const lineNets: { it: any; qty: number; unitPrice: number; salesValue: number; lineDiscAmt: number; netSales: number }[] = [];
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
        lineNets.push({ it, qty, unitPrice, salesValue, lineDiscAmt, netSales });
      }
      const sumLineNet = lineNets.reduce((s, l) => s + l.netSales, 0);

      for (const line of lineNets) {
        const { it, qty, unitPrice, salesValue, lineDiscAmt, netSales } = line;
        const gst = sumLineNet > 0 ? (netSales / sumLineNet) * invGst : (invTaxable > 0 ? (netSales / invTaxable) * invGst : 0);
        const invoiceValue = netSales + gst;
        const stockItemId = Number(it.stockItemId) > 0 ? Number(it.stockItemId) : undefined;
        const stock = stockItemId ? itemById.get(String(stockItemId)) : undefined;
        const costUnit = parseFloat(String(stock?.purchasePrice ?? it.purchasePrice ?? 0)) || 0;
        const costValue = costUnit * qty;
        const category = String(stock?.category || it.category || "").trim() || "Uncategorized";
        const warehouseId = Number(it.warehouseId) > 0 ? Number(it.warehouseId) : undefined;
        const warehouseName = String(it.warehouseName || "").trim()
          || (warehouseId ? warehouses.find((w) => Number(w.id) === warehouseId)?.name : "")
          || "";

        if (filters.warehouseId !== "all" && String(warehouseId || "") !== filters.warehouseId) continue;
        if (filters.category !== "all" && category !== filters.category) continue;
        if (filters.itemId !== "all") {
          if (stockItemId) {
            if (String(stockItemId) !== filters.itemId) continue;
          } else {
            const target = itemById.get(filters.itemId);
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
          gst,
          netSales,
          invoiceValue,
          costValue,
          profit: netSales - costValue,
        });
      }
    }

    return rows;
  }, [invoices, filters, itemById, warehouses]);

  const personSummary = useMemo(() => {
    const map = new Map<string, {
      salesPerson: string;
      invoiceIds: Set<string>;
      qtySold: number;
      grossSales: number;
      discount: number;
      gst: number;
      netSales: number;
      invoiceValue: number;
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
          gst: 0,
          netSales: 0,
          invoiceValue: 0,
          costValue: 0,
        };
        map.set(key, row);
      }
      row.invoiceIds.add(`${f.invoiceNo}|${f.invoiceDate}`);
      row.qtySold += f.qty;
      row.grossSales += f.salesValue;
      row.discount += f.discount;
      row.gst += f.gst;
      row.netSales += f.netSales;
      row.invoiceValue += f.invoiceValue;
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
          gst: r.gst,
          netSales: r.netSales,
          invoiceValue: r.invoiceValue,
          costValue: r.costValue,
          grossProfit,
          margin,
        };
      })
      .sort((a, b) => b.invoiceValue - a.invoiceValue);
  }, [facts]);

  const itemDetails = useMemo(() => {
    const map = new Map<string, {
      salesPerson: string;
      itemCode: string;
      itemName: string;
      qtySold: number;
      salesValue: number;
      discount: number;
      gst: number;
      netSales: number;
      invoiceValue: number;
      costValue: number;
    }>();
    for (const f of facts) {
      const key = `${f.salesPerson}|${f.itemCode || f.itemName}`;
      let row = map.get(key);
      if (!row) {
        row = {
          salesPerson: f.salesPerson,
          itemCode: f.itemCode,
          itemName: f.itemName,
          qtySold: 0,
          salesValue: 0,
          discount: 0,
          gst: 0,
          netSales: 0,
          invoiceValue: 0,
          costValue: 0,
        };
        map.set(key, row);
      }
      row.qtySold += f.qty;
      row.salesValue += f.salesValue;
      row.discount += f.discount;
      row.gst += f.gst;
      row.netSales += f.netSales;
      row.invoiceValue += f.invoiceValue;
      row.costValue += f.costValue;
    }
    return Array.from(map.values())
      .map((r) => {
        const profit = r.netSales - r.costValue;
        const margin = r.netSales > 0 ? (profit / r.netSales) * 100 : 0;
        return { ...r, profit, margin };
      })
      .sort((a, b) => b.invoiceValue - a.invoiceValue || a.salesPerson.localeCompare(b.salesPerson));
  }, [facts]);

  const invoiceDetails = useMemo(() => {
    let rows = facts;
    const active =
      selectedItem ??
      (itemDetails[0]
        ? {
            salesPerson: itemDetails[0].salesPerson,
            itemCode: itemDetails[0].itemCode,
            itemName: itemDetails[0].itemName,
          }
        : null);
    if (active) {
      const itemKey = active.itemCode || active.itemName;
      rows = facts.filter(
        (f) =>
          f.salesPerson === active.salesPerson &&
          (f.itemCode || f.itemName) === itemKey,
      );
    } else {
      rows = [];
    }
    return rows
      .map((f) => ({
        invoiceId: f.invoiceId,
        invoiceNo: f.invoiceNo,
        invoiceDate: f.invoiceDate,
        customerName: f.customerName,
        salesPerson: f.salesPerson,
        itemCode: f.itemCode,
        itemName: f.itemName,
        qty: f.qty,
        unitPrice: f.unitPrice,
        salesValue: f.salesValue,
        discount: f.discount,
        gst: f.gst,
        netAmount: f.netSales,
        invoiceValue: f.invoiceValue,
      }))
      .sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate) || a.invoiceNo.localeCompare(b.invoiceNo));
  }, [facts, selectedItem, itemDetails]);

  const kpis = useMemo(() => {
    const persons = new Set(personSummary.map((p) => p.salesPerson));
    const qtySold = personSummary.reduce((s, r) => s + r.qtySold, 0);
    const grossSales = personSummary.reduce((s, r) => s + r.grossSales, 0);
    const discount = personSummary.reduce((s, r) => s + r.discount, 0);
    const gst = personSummary.reduce((s, r) => s + r.gst, 0);
    const invoiceValue = personSummary.reduce((s, r) => s + r.invoiceValue, 0);
    const netSales = personSummary.reduce((s, r) => s + r.netSales, 0);
    return { persons: persons.size, qtySold, grossSales, discount, gst, invoiceValue, netSales };
  }, [personSummary]);

  const personPager = usePagination(personSummary, 10);
  const itemPager = usePagination(itemDetails, 10);
  const invoicePager = usePagination(invoiceDetails, 10);

  // Auto-select first item so Invoice Details is never empty when data exists
  useEffect(() => {
    if (itemDetails.length === 0) {
      setSelectedItem(null);
      return;
    }
    setSelectedItem((prev) => {
      if (prev) {
        const stillThere = itemDetails.some(
          (r) =>
            r.salesPerson === prev.salesPerson &&
            (r.itemCode || r.itemName) === (prev.itemCode || prev.itemName),
        );
        if (stillThere) return prev;
      }
      const first = itemDetails[0];
      return {
        salesPerson: first.salesPerson,
        itemCode: first.itemCode,
        itemName: first.itemName,
      };
    });
  }, [itemDetails]);

  function openItem(salesPerson: string, itemCode: string, itemName: string) {
    setSelectedItem({ salesPerson, itemCode, itemName });
    requestAnimationFrame(() => {
      document.getElementById("sp-invoices")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function openInvoice(invoiceId: number) {
    if (!invoiceId || invoiceId <= 0) {
      toast({ title: "Invoice not found", description: "This row is not linked to a tax invoice.", variant: "destructive" });
      return;
    }
    setLocation(`/invoices/${invoiceId}`);
  }

  function exportExcel() {
    const wb = XLSX.utils.book_new();
    const summaryData = personSummary.map((r, i) => ({
        "#": i + 1,
        "Sales Person": r.salesPerson,
        "No. of Invoices": r.invoiceCount,
        "Qty Sold": r.qtySold,
        "Gross Sales": r.grossSales,
        Discount: r.discount,
      GST: r.gst,
      "Invoice Value": r.invoiceValue,
        "Cost Value": r.costValue,
        "Gross Profit": r.grossProfit,
        "Margin %": r.margin,
      }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryData), "Summary");

    if (itemDetails.length > 0) {
      const data = itemDetails.map((r, i) => ({
        "#": i + 1,
        "Sales Person": r.salesPerson,
        "Item Code": r.itemCode,
        "Item Name": r.itemName,
        "Qty Sold": r.qtySold,
        "Sales Value": r.salesValue,
        Discount: r.discount,
        GST: r.gst,
        "Invoice Value": r.invoiceValue,
        "Cost Value": r.costValue,
        Profit: r.profit,
        "Margin %": r.margin,
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "Items");
    }
    if (invoiceDetails.length > 0 || facts.length > 0) {
      const exportInvoices = facts
        .map((f) => ({
          invoiceId: f.invoiceId,
          invoiceNo: f.invoiceNo,
          invoiceDate: f.invoiceDate,
          customerName: f.customerName,
          salesPerson: f.salesPerson,
          itemName: f.itemName,
          qty: f.qty,
          unitPrice: f.unitPrice,
          salesValue: f.salesValue,
          discount: f.discount,
          gst: f.gst,
          invoiceValue: f.invoiceValue,
        }))
        .sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate) || a.invoiceNo.localeCompare(b.invoiceNo));
      const data = exportInvoices.map((r, i) => ({
        "#": i + 1,
        "Invoice No": r.invoiceNo,
        "Invoice Date": r.invoiceDate,
        "Customer Name": r.customerName,
        "Sales Person": r.salesPerson,
        Item: r.itemName,
        Qty: r.qty,
        "Unit Price": r.unitPrice,
        "Sales Value": r.salesValue,
        Discount: r.discount,
        GST: r.gst,
        "Invoice Value": r.invoiceValue,
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
    doc.text(`${filters.dateFrom} to ${filters.dateTo}`, 14, 22);

      autoTable(doc, {
        startY: 28,
      head: [["#", "Sales Person", "Invoices", "Qty Sold", "Gross Sales", "Discount", "GST", "Invoice Value", "Cost Value", "Gross Profit", "Margin %"]],
        body: personSummary.map((r, i) => [
          i + 1,
          r.salesPerson,
          r.invoiceCount,
          qtyFmt(r.qtySold),
          money(r.grossSales),
          money(r.discount),
        money(r.gst),
        money(r.invoiceValue),
          money(r.costValue),
          money(r.grossProfit),
          pctFmt(r.margin),
        ]),
      styles: { fontSize: 7 },
        headStyles: { fillColor: [16, 45, 82] },
      });
    doc.save(`sales-person-wise-report-${todayIso()}.pdf`);
  }

  function printReportSection(section: PrintSection) {
    const sectionId =
      section === "summary" ? "sp-summary" : section === "items" ? "sp-items" : "sp-invoices";
    const titles: Record<PrintSection, string> = {
      summary: "Sales Person Summary",
      items: "Sales Person Wise – Item Details",
      invoices: "Invoice Details",
    };
    const el = document.getElementById(sectionId);
    if (!el) {
      toast({ title: "Nothing to print", description: "Open the section first, then try again.", variant: "destructive" });
      return;
    }

    // Clone section and strip UI chrome that shouldn't appear on paper
    const clone = el.cloneNode(true) as HTMLElement;
    clone.querySelectorAll(".sp-no-print").forEach((n) => n.remove());
    clone.querySelectorAll("nav, [class*='pagination']").forEach((n) => n.remove());
    // ManagementTableCard footer pagination
    clone.querySelectorAll("button").forEach((n) => {
      const text = (n as HTMLElement).textContent?.trim() || "";
      if (text === "Previous" || text === "Next" || /^\d+$/.test(text)) {
        const footer = (n as HTMLElement).closest(".border-t, .flex");
        if (footer && (footer.textContent || "").includes("Previous")) {
          footer.remove();
          return;
        }
      }
      const span = document.createElement("span");
      span.textContent = text;
      n.replaceWith(span);
    });
    // Remove leftover empty pagination bars
    Array.from(clone.querySelectorAll("div")).forEach((n) => {
      const t = (n.textContent || "").trim();
      if (t.includes("Previous") && t.includes("Next")) n.remove();
    });

    const iframe = document.createElement("iframe");
    iframe.setAttribute(
      "style",
      "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;",
    );
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) {
      iframe.remove();
      toast({ title: "Print failed", variant: "destructive" });
      return;
    }

    const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
      .map((n) => n.outerHTML)
      .join("\n");

    const subtitle = `${filters.dateFrom} to ${filters.dateTo}`;

    doc.open();
    doc.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${titles[section]}</title>
${styles}
<style>
  @page { size: A4 landscape; margin: 10mm; }
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  }
  .print-header {
    margin-bottom: 12px;
  }
  .print-header h1 {
    margin: 0;
    font-size: 16px;
    color: #132D52;
  }
  .print-header p {
    margin: 4px 0 0;
    font-size: 11px;
    color: #6B7280;
  }
  .print-section {
    max-width: none !important;
    width: 100% !important;
    margin: 0 !important;
    border: 1px solid #E5E7EB !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    overflow: visible !important;
  }
  .print-section .overflow-x-auto {
    overflow: visible !important;
  }
  .print-section table {
    width: 100% !important;
    min-width: 0 !important;
    table-layout: auto !important;
    font-size: 9px !important;
  }
  .print-section th,
  .print-section td {
    padding: 4px 5px !important;
    white-space: nowrap;
  }
  .print-section thead {
    background: #102D52 !important;
    color: #fff !important;
  }
  .print-section thead th {
    color: #fff !important;
  }
</style>
</head>
<body>
  <div class="print-header">
    <h1>${titles[section]}</h1>
    <p>${subtitle}</p>
  </div>
  <div class="print-section">${clone.innerHTML}</div>
</body>
</html>`);
    doc.close();

    const win = iframe.contentWindow;
    const cleanup = () => {
      setTimeout(() => {
        try {
          iframe.remove();
        } catch {
          // ignore
        }
      }, 800);
    };

    if (!win) {
      iframe.remove();
      return;
    }

    win.onafterprint = cleanup;
    setTimeout(() => {
      win.focus();
      win.print();
      cleanup();
    }, 300);
  }

  return (
    <div className="min-h-full space-y-5 bg-[#F6F8FC] p-1">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#132D52]">Sales Person Wise Stock Report</h1>
        <p className="mt-1 text-sm text-[#6B7280]">View sales and stock movement details based on Sales Person.</p>
      </div>

      {/* Filters */}
      <section className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <FilterField label="From Date">
            <SyncBridgeDatePicker
              value={filters.dateFrom}
              onChange={(v) => setFilters((f) => ({ ...f, dateFrom: v || f.dateFrom }))}
              placeholder="From"
              max={filters.dateTo || undefined}
            />
          </FilterField>
          <FilterField label="To Date">
            <SyncBridgeDatePicker
              value={filters.dateTo}
              onChange={(v) => setFilters((f) => ({ ...f, dateTo: v || f.dateTo }))}
              placeholder="To"
              min={filters.dateFrom || undefined}
            />
          </FilterField>
          <FilterField label="Sales Person">
            <Select value={filters.salesPerson} onValueChange={(v) => setFilters((f) => ({ ...f, salesPerson: v }))}>
              <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {salesPersons.map((sp) => (
                  <SelectItem key={sp.id} value={sp.name}>{sp.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="Warehouse">
            <Select value={filters.warehouseId} onValueChange={(v) => setFilters((f) => ({ ...f, warehouseId: v }))}>
              <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {warehouses.map((w) => (
                  <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="Item Category">
            <Select value={filters.category} onValueChange={(v) => setFilters((f) => ({ ...f, category: v }))}>
              <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="Item">
            <Select value={filters.itemId} onValueChange={(v) => setFilters((f) => ({ ...f, itemId: v }))}>
              <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {activeItems.map((i) => (
                  <SelectItem key={i.id} value={String(i.id)}>{i.code} - {i.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
        </div>

        <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button type="button" className="gap-2 bg-[#16A34A] hover:bg-[#15803D]" onClick={exportExcel}>
              <FileSpreadsheet className="h-4 w-4" /> Excel
            </Button>
            <Button type="button" className="gap-2 bg-[#DC2626] hover:bg-[#B91C1C]" onClick={exportPdf}>
              <FileText className="h-4 w-4" /> PDF
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="secondary" className="gap-2">
              <Printer className="h-4 w-4" /> Print
                  <ChevronDown className="h-3.5 w-3.5 opacity-70" />
            </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuItem onClick={() => printReportSection("summary")}>
                  Sales Person Summary
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => printReportSection("items")}>
                  Sales Person Wise – Item Details
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => printReportSection("invoices")}>
                  Invoice Details
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
        </div>
      </section>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Sales Persons" value={String(kpis.persons)} icon={Users} iconBg="bg-[#DBEAFE]" iconColor="text-[#2563EB]" />
        <KpiCard label="Total Qty Sold" value={qtyFmt(kpis.qtySold)} icon={Package} iconBg="bg-[#DCFCE7]" iconColor="text-[#16A34A]" />
        <KpiCard label="Gross Sales" value={money(kpis.grossSales)} icon={CircleDollarSign} iconBg="bg-[#EDE9FE]" iconColor="text-[#7C3AED]" />
        <KpiCard label="Discount" value={money(kpis.discount)} icon={Percent} iconBg="bg-[#FFEDD5]" iconColor="text-[#EA580C]" />
        <KpiCard label="GST" value={money(kpis.gst)} icon={Receipt} iconBg="bg-[#FEF3C7]" iconColor="text-[#D97706]" />
        <KpiCard label="Invoice Value" value={money(kpis.invoiceValue)} icon={Wallet} iconBg="bg-[#CCFBF1]" iconColor="text-[#0D9488]" />
      </div>

      {/* Summary table */}
      <div id="sp-summary" className="space-y-2">
            <h2 className="text-sm font-semibold text-[#111827]">Sales Person Summary</h2>
        <ManagementTableCard
          pagination={{
            page: personPager.page,
            totalPages: personPager.totalPages,
            onPageChange: personPager.setPage,
          }}
        >
                {personPager.paginatedItems.length === 0 ? (
            <ManagementEmptyState
              title="No sales data"
              description="No sales data for selected filters."
            />
          ) : (
            <ManagementTableContainer>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Sales Person</TableHead>
                    <TableHead className="text-right">No. of Invoices</TableHead>
                    <TableHead className="text-right">Qty Sold</TableHead>
                    <TableHead className="text-right">Gross Sales</TableHead>
                    <TableHead className="text-right">Discount</TableHead>
                    <TableHead className="text-right">GST</TableHead>
                    <TableHead className="text-right">Invoice Value</TableHead>
                    <TableHead className="text-right">Cost Value</TableHead>
                    <TableHead className="text-right">Gross Profit</TableHead>
                    <TableHead className="text-right">Margin %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {personPager.paginatedItems.map((r, idx) => (
                    <TableRow key={r.salesPerson}>
                      <TableCell className="text-[#6B7280]">
                        {(personPager.page - 1) * personPager.pageSize + idx + 1}
                      </TableCell>
                      <TableCell className="font-medium text-[#111827]">{r.salesPerson}</TableCell>
                      <TableCell className="text-right">{r.invoiceCount}</TableCell>
                      <TableCell className="text-right">{qtyFmt(r.qtySold)}</TableCell>
                      <TableCell className="text-right">{money(r.grossSales)}</TableCell>
                      <TableCell className="text-right">{money(r.discount)}</TableCell>
                      <TableCell className="text-right">{money(r.gst)}</TableCell>
                      <TableCell className="text-right font-medium text-[#111827]">{money(r.invoiceValue)}</TableCell>
                      <TableCell className="text-right">{money(r.costValue)}</TableCell>
                      <TableCell className="text-right">{money(r.grossProfit)}</TableCell>
                      <TableCell className="text-right">{pctFmt(r.margin)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              {personSummary.length > 0 && (
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={2} className="font-semibold">Total</TableCell>
                      <TableCell className="text-right font-semibold">
                        {personSummary.reduce((s, r) => s + r.invoiceCount, 0)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">{qtyFmt(kpis.qtySold)}</TableCell>
                      <TableCell className="text-right font-semibold">{money(kpis.grossSales)}</TableCell>
                      <TableCell className="text-right font-semibold">{money(kpis.discount)}</TableCell>
                      <TableCell className="text-right font-semibold">{money(kpis.gst)}</TableCell>
                      <TableCell className="text-right font-semibold">{money(kpis.invoiceValue)}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {money(personSummary.reduce((s, r) => s + r.costValue, 0))}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {money(personSummary.reduce((s, r) => s + r.grossProfit, 0))}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                      {pctFmt(kpis.netSales > 0
                        ? (personSummary.reduce((s, r) => s + r.grossProfit, 0) / kpis.netSales) * 100
                        : 0)}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </ManagementTableContainer>
          )}
        </ManagementTableCard>
          </div>

      {/* Item details */}
      <div id="sp-items" className="space-y-2">
        <h2 className="text-sm font-semibold text-[#111827]">Sales Person Wise – Item Details</h2>
        <ManagementTableCard
          pagination={{
            page: itemPager.page,
            totalPages: itemPager.totalPages,
            onPageChange: itemPager.setPage,
          }}
        >
                {itemPager.paginatedItems.length === 0 ? (
            <ManagementEmptyState
              title="No item sales"
              description="No item sales for selected filters."
            />
          ) : (
            <ManagementTableContainer>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Sales Person</TableHead>
                    <TableHead>Item Code</TableHead>
                    <TableHead>Item Name</TableHead>
                    <TableHead className="text-right">Qty Sold</TableHead>
                    <TableHead className="text-right">Sales Value</TableHead>
                    <TableHead className="text-right">Discount</TableHead>
                    <TableHead className="text-right">GST</TableHead>
                    <TableHead className="text-right">Invoice Value</TableHead>
                    <TableHead className="text-right">Cost Value</TableHead>
                    <TableHead className="text-right">Profit</TableHead>
                    <TableHead className="text-right">Margin %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itemPager.paginatedItems.map((r, idx) => {
                    const itemKey = r.itemCode || r.itemName;
                    const active =
                      selectedItem ??
                      (itemDetails[0]
                        ? {
                            salesPerson: itemDetails[0].salesPerson,
                            itemCode: itemDetails[0].itemCode,
                            itemName: itemDetails[0].itemName,
                          }
                        : null);
                    const isSelected =
                      !!active &&
                      active.salesPerson === r.salesPerson &&
                      (active.itemCode || active.itemName) === itemKey;
                    return (
                    <TableRow
                      key={`${r.salesPerson}-${r.itemCode}-${r.itemName}`}
                      className={isSelected ? "bg-[#EFF6FF]" : undefined}
                    >
                      <TableCell className="text-[#6B7280]">
                        {(itemPager.page - 1) * itemPager.pageSize + idx + 1}
                      </TableCell>
                      <TableCell className="text-[#111827]">{r.salesPerson}</TableCell>
                      <TableCell>
                        <button
                          type="button"
                          className="font-medium text-[#2563EB] hover:underline"
                          onClick={() => openItem(r.salesPerson, r.itemCode, r.itemName)}
                        >
                          {r.itemCode || "—"}
                        </button>
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          className="text-[#2563EB] hover:underline"
                          onClick={() => openItem(r.salesPerson, r.itemCode, r.itemName)}
                        >
                          {r.itemName}
                        </button>
                      </TableCell>
                      <TableCell className="text-right">{qtyFmt(r.qtySold)}</TableCell>
                      <TableCell className="text-right">{money(r.salesValue)}</TableCell>
                      <TableCell className="text-right">{money(r.discount)}</TableCell>
                      <TableCell className="text-right">{money(r.gst)}</TableCell>
                      <TableCell className="text-right font-medium text-[#111827]">{money(r.invoiceValue)}</TableCell>
                      <TableCell className="text-right">{money(r.costValue)}</TableCell>
                      <TableCell className="text-right">{money(r.profit)}</TableCell>
                      <TableCell className="text-right">{pctFmt(r.margin)}</TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              {itemDetails.length > 0 && (
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={4} className="font-semibold">Total</TableCell>
                      <TableCell className="text-right font-semibold">{qtyFmt(itemDetails.reduce((s, r) => s + r.qtySold, 0))}</TableCell>
                      <TableCell className="text-right font-semibold">{money(itemDetails.reduce((s, r) => s + r.salesValue, 0))}</TableCell>
                      <TableCell className="text-right font-semibold">{money(itemDetails.reduce((s, r) => s + r.discount, 0))}</TableCell>
                      <TableCell className="text-right font-semibold">{money(itemDetails.reduce((s, r) => s + r.gst, 0))}</TableCell>
                      <TableCell className="text-right font-semibold">{money(itemDetails.reduce((s, r) => s + r.invoiceValue, 0))}</TableCell>
                      <TableCell className="text-right font-semibold">{money(itemDetails.reduce((s, r) => s + r.costValue, 0))}</TableCell>
                      <TableCell className="text-right font-semibold">{money(itemDetails.reduce((s, r) => s + r.profit, 0))}</TableCell>
                      <TableCell className="text-right font-semibold">—</TableCell>
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </ManagementTableContainer>
          )}
        </ManagementTableCard>
          </div>

      {/* Invoice details */}
      <div id="sp-invoices" className="space-y-2">
        <h2 className="text-sm font-semibold text-[#111827]">
          Invoice Details
          {(selectedItem || itemDetails[0]) ? (
            <span className="ml-2 font-normal text-[#6B7280]">
              ({(selectedItem || itemDetails[0])!.itemName || (selectedItem || itemDetails[0])!.itemCode})
            </span>
          ) : null}
        </h2>
        <ManagementTableCard
          pagination={{
            page: invoicePager.page,
            totalPages: invoicePager.totalPages,
            onPageChange: invoicePager.setPage,
          }}
        >
                {invoicePager.paginatedItems.length === 0 ? (
            <ManagementEmptyState
              title="No invoices"
              description="No invoices for this item."
            />
          ) : (
            <ManagementTableContainer>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Invoice No</TableHead>
                    <TableHead>Invoice Date</TableHead>
                    <TableHead>Customer Name</TableHead>
                    <TableHead>Sales Person</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Unit Price</TableHead>
                    <TableHead className="text-right">Sales Value</TableHead>
                    <TableHead className="text-right">Discount</TableHead>
                    <TableHead className="text-right">GST</TableHead>
                    <TableHead className="text-right">Invoice Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoicePager.paginatedItems.map((r, idx) => (
                    <TableRow key={`${r.invoiceId}-${r.invoiceNo}-${idx}`}>
                      <TableCell className="text-[#6B7280]">
                        {(invoicePager.page - 1) * invoicePager.pageSize + idx + 1}
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          className="font-medium text-[#2563EB] hover:underline"
                          onClick={() => openInvoice(r.invoiceId)}
                        >
                          {r.invoiceNo || "—"}
                        </button>
                      </TableCell>
                      <TableCell className="text-[#444651]">{r.invoiceDate}</TableCell>
                      <TableCell className="text-[#111827]">{r.customerName}</TableCell>
                      <TableCell className="text-[#111827]">{r.salesPerson}</TableCell>
                      <TableCell className="text-[#111827]">{r.itemName}</TableCell>
                      <TableCell className="text-right">{qtyFmt(r.qty)}</TableCell>
                      <TableCell className="text-right">{money(r.unitPrice)}</TableCell>
                      <TableCell className="text-right">{money(r.salesValue)}</TableCell>
                      <TableCell className="text-right">{money(r.discount)}</TableCell>
                      <TableCell className="text-right">{money(r.gst)}</TableCell>
                      <TableCell className="text-right font-medium text-[#111827]">{money(r.invoiceValue)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ManagementTableContainer>
          )}
        </ManagementTableCard>
          </div>
    </div>
  );
}
