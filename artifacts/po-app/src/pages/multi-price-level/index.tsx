import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useLocation } from "wouter";
import { useListStockItems } from "@workspace/api-client-react";
import { StockItemPickerDialog, type StockItemSelection } from "@/components/stock-item-picker-dialog";
import { PdfPreviewModal } from "@/components/pdf-preview-modal";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { ArrowLeft, BarChart3, CalendarDays, Check, ChevronRight, Download, FileDown, FileSpreadsheet, FileText, Layers3, Package, Pencil, Plus, Printer, Search, ShieldCheck, Trash2, Upload, UserCheck, UserRound, UsersRound } from "lucide-react";
import { useSalesPersons } from "@/hooks/use-sales-persons";

type PriceLevel = { id: string; name: string; description: string; color: string; active: boolean };
type PriceMap = Record<string, Record<string, string>>;

const defaultLevels: PriceLevel[] = [
  { id: "retail", name: "Retail Price", description: "Standard retail selling price", color: "bg-orange-500", active: true },
  { id: "wholesale", name: "Wholesale Price", description: "For wholesale customers", color: "bg-amber-500", active: true },
  { id: "dealer", name: "Dealer Price", description: "For dealers", color: "bg-blue-500", active: true },
  { id: "distributor", name: "Distributor Price", description: "For distributors", color: "bg-emerald-500", active: true },
];

const tabs = ["Dashboard", "Price Level Reports"];

async function generatePdfForInvoice(invoice: any, opts?: { returnBase64?: boolean }): Promise<string | void> {
  if (!invoice) return;
  const doc = new jsPDF();

  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(37, 99, 235);
  doc.text("SALES INVOICE", 14, 20);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  doc.text(`Price Level: ${invoice.priceLevel || "Standard"}`, 14, 28);
  doc.text(`Date: ${invoice.invoiceDate || new Date().toISOString().slice(0, 10)}`, 14, 34);
  doc.text(`Payment Terms: ${invoice.paymentTerms || "30 Days"}`, 14, 40);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(30);
  doc.text("Bill To:", 130, 28);
  doc.setFont("helvetica", "normal");
  doc.text(invoice.customer || "Customer Name", 130, 34);
  doc.text(`Currency: ${invoice.currency || "SGD"}`, 130, 40);

  const rows = invoice.rows || [];
  const tableData = rows.map((r: any, idx: number) => {
    const qty = Number(r.quantity) || 0;
    const price = Number(r.unitPrice) || 0;
    const disc = Number(r.discount) || 0;
    const tax = Number(r.taxRate) || 9;
    const amt = price * qty * (1 - disc / 100);
    return [
      idx + 1,
      r.code || "-",
      r.name || "-",
      qty,
      r.uom || "PCS",
      price.toFixed(2),
      `${disc}%`,
      `${tax}%`,
      amt.toFixed(2),
    ];
  });

  autoTable(doc, {
    head: [["#", "Item Code", "Item Name", "Qty", "UOM", "Unit Price", "Discount", "GST", "Amount (SGD)"]],
    body: tableData,
    startY: 48,
    theme: "striped",
    headStyles: { fillColor: [16, 45, 82], textColor: 255, fontStyle: "bold" },
  });

  const finalY = (doc as any).lastAutoTable?.finalY || 100;

  const subtotal = Number(invoice.subtotal ?? invoice.taxable ?? 0);
  const gst = Number(invoice.gst ?? 0);
  const total = Number(invoice.total ?? (subtotal + gst));

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(50);
  doc.text("Subtotal:", 130, finalY + 12);
  doc.text(`SGD ${subtotal.toFixed(2)}`, 190, finalY + 12, { align: "right" });

  doc.text("GST (9%):", 130, finalY + 18);
  doc.text(`SGD ${gst.toFixed(2)}`, 190, finalY + 18, { align: "right" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(37, 99, 235);
  doc.text("Total:", 130, finalY + 26);
  doc.text(`SGD ${total.toFixed(2)}`, 190, finalY + 26, { align: "right" });

  if (opts?.returnBase64) {
    const dataUri = doc.output("datauristring");
    return dataUri.split(",")[1];
  } else {
    doc.save(`Sales_Invoice_${invoice.customer || "Customer"}_${invoice.invoiceDate || "date"}.pdf`);
  }
}

export default function MultiPriceLevelPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { data: stockItems = [], isLoading } = useListStockItems({} as any);
  const { data: customers = [] } = useQuery<any[]>({
    queryKey: ["customers", "multi-price-level-voucher"],
    queryFn: async () => {
      const response = await fetch("/api/customers", { credentials: "include" });
      return response.ok ? response.json() : [];
    },
  });
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [showManagement, setShowManagement] = useState(false);
  const [search, setSearch] = useState("");
  const [levels, setLevels] = useState<PriceLevel[]>(defaultLevels);
  const [prices, setPrices] = useState<PriceMap>({});
  const [savedInvoices, setSavedInvoices] = useState<any[]>([]);
  const [savedLevels, setSavedLevels] = useState<any[]>([]);
  const [editingInvoiceIndex, setEditingInvoiceIndex] = useState<number | null>(null);
  const [editingInvoice, setEditingInvoice] = useState<any | null>(null);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewInvoice, setPreviewInvoice] = useState<any | null>(null);
  const [previewInvoiceIndex, setPreviewInvoiceIndex] = useState<number | null>(null);

  useEffect(() => {
    const loadData = () => {
      try {
        const savedLevels = window.localStorage.getItem("multi-price-levels-v1");
        const savedPrices = window.localStorage.getItem("multi-price-prices-v1");
        if (savedLevels) setLevels(JSON.parse(savedLevels));
        if (savedPrices) setPrices(JSON.parse(savedPrices));
        const savedInvoiceData = window.localStorage.getItem("multi-price-invoices-v1") || window.localStorage.getItem("multi-price-invoice-v1");
        if (savedInvoiceData) {
          const parsed = JSON.parse(savedInvoiceData);
          setSavedInvoices(Array.isArray(parsed) ? parsed : [parsed]);
        }
        const savedPriceLevels = window.localStorage.getItem("multi-price-levels-v1");
        if (savedPriceLevels) setSavedLevels(JSON.parse(savedPriceLevels));
      } catch { /* use defaults when browser storage is unavailable */ }
    };
    loadData();
    window.addEventListener("multi-price-invoices-updated", loadData);
    return () => window.removeEventListener("multi-price-invoices-updated", loadData);
  }, []);

  const deleteInvoice = (indexToDelete: number) => {
    const updated = savedInvoices.filter((_, idx) => idx !== indexToDelete);
    setSavedInvoices(updated);
    window.localStorage.setItem("multi-price-invoices-v1", JSON.stringify(updated));
    window.dispatchEvent(new Event("multi-price-invoices-updated"));
    toast({
      title: "Invoice deleted",
      description: "The saved sales invoice has been deleted successfully."
    });
  };

  const handleEditInvoice = (invoice: any, index: number) => {
    setEditingInvoiceIndex(index);
    setEditingInvoice(invoice);
    setShowManagement(true);
  };

  const handlePreviewInvoice = (invoice: any, index?: number) => {
    setPreviewInvoice(invoice);
    setPreviewInvoiceIndex(index !== undefined ? index : null);
    setPreviewOpen(true);
  };

  const filteredItems = useMemo(() => (stockItems as any[]).filter(item => {
    const term = search.toLowerCase();
    return !term || String(item.code).toLowerCase().includes(term) || String(item.name).toLowerCase().includes(term);
  }), [stockItems, search]);

  const mappedCount = useMemo(() => {
    const itemIds = new Set(Object.keys(prices));
    return (stockItems as any[]).filter(item => itemIds.has(String(item.id))).length;
  }, [prices, stockItems]);

  const updatePrice = (itemId: string, levelId: string, value: string) => {
    const next = { ...prices, [itemId]: { ...(prices[itemId] || {}), [levelId]: value } };
    setPrices(next);
    window.localStorage.setItem("multi-price-prices-v1", JSON.stringify(next));
  };

  return (
    <div className="min-h-full space-y-5 bg-[#f6f8fc] p-1 animate-in fade-in duration-500">
      {!showManagement && (
        <SavedInvoiceTable
          invoices={savedInvoices}
          onManagement={() => { setEditingInvoiceIndex(null); setEditingInvoice(null); setShowManagement(true); }}
          onDelete={deleteInvoice}
          onEdit={handleEditInvoice}
          onPreview={handlePreviewInvoice}
        />
      )}
      {showManagement && <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2"><Button variant="ghost" size="icon" title="Back to saved invoice table" onClick={() => { setShowManagement(false); setEditingInvoiceIndex(null); setEditingInvoice(null); }}><ArrowLeft className="h-4 w-4" /></Button><div><h1 className="text-2xl font-bold tracking-tight text-[#132d52]">Price Management</h1><p className="text-sm text-muted-foreground">Manage multiple price levels, item prices and quantity pricing</p></div></div>
        <Button className="gap-2 bg-[#1265d8] hover:bg-[#0d55b8]" onClick={() => setLocation("/multi-price-level/new")}><Plus className="h-4 w-4" /> New Price Level</Button>
      </div>}

      {showManagement && <div className="flex gap-5 overflow-x-auto border-b border-slate-200 bg-white px-3 pt-1 shadow-sm">
        {tabs.map(tab => <button key={tab} onClick={() => tab === "Price Level Reports" ? setLocation("/multi-price-level/reports") : setActiveTab(tab)} className={`whitespace-nowrap border-b-2 px-2 py-3 text-xs font-medium transition-colors ${activeTab === tab ? "border-[#1265d8] text-[#1265d8]" : "border-transparent text-slate-600 hover:text-[#1265d8]"}`}>{tab}</button>)}
      </div>}

      {showManagement && activeTab === "Dashboard" && <>
        <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr_0.95fr]">
          <Card><CardHeader className="border-b py-3"><CardTitle className="flex items-center gap-2 text-sm"><Layers3 className="h-4 w-4 text-[#1265d8]" /> Price Levels</CardTitle></CardHeader><CardContent className="p-3"><div className="grid grid-cols-[32px_1fr_1.2fr_58px] items-center gap-2 border-b px-2 pb-2 text-[10px] font-semibold uppercase text-muted-foreground"><span>#</span><span>Level Name</span><span>Description</span><span>Status</span></div>{levels.map((level, index) => <div key={level.id} className="grid grid-cols-[32px_1fr_1.2fr_58px] items-center gap-2 border-b px-2 py-2 last:border-0"><span className={`flex h-5 w-5 items-center justify-center rounded text-[11px] font-bold text-white ${level.color}`}>{index + 1}</span><span className="text-xs font-medium">{level.name}</span><span className="text-[11px] text-muted-foreground">{level.description}</span><Badge className="justify-center bg-emerald-50 px-1.5 text-[10px] text-emerald-700 hover:bg-emerald-50">Active</Badge></div>)}<Button variant="link" className="mt-2 h-auto px-2 text-xs text-[#1265d8]" onClick={() => setLocation("/multi-price-level/reports")}>View Price Level Reports <ChevronRight className="h-3 w-3" /></Button></CardContent></Card>
          <Card><CardHeader className="border-b py-3"><CardTitle className="flex items-center gap-2 text-sm"><BarChart3 className="h-4 w-4 text-[#1265d8]" /> Price Level Summary</CardTitle></CardHeader><CardContent className="grid grid-cols-2 gap-3 p-3"><Metric icon={UsersRound} value={levels.filter(level => level.active).length} label="Active Price Levels" /><Metric icon={Package} value={mappedCount || (stockItems as any[]).length} label="Items Mapped" /><Metric icon={UserRound} value={0} label="Customers Mapped" /><Metric icon={CalendarDays} value={0} label="Price Updates (This Month)" /></CardContent></Card>
          <Card><CardHeader className="border-b py-3"><CardTitle className="text-sm">Quick Actions</CardTitle></CardHeader><CardContent className="divide-y p-2">{[[Plus, "Create New Price Level", () => setLocation("/multi-price-level/new")], [BarChart3, "View Price Level Reports", () => setLocation("/multi-price-level/reports")]].map(([Icon, label, action]: any) => <button key={label} onClick={action} className="flex w-full items-center gap-3 px-2 py-2.5 text-left text-xs font-medium hover:bg-blue-50"><Icon className="h-4 w-4 text-[#1265d8]" />{label}<ChevronRight className="ml-auto h-3.5 w-3.5 text-muted-foreground" /></button>)}</CardContent></Card>
        </div>
        <InvoicePreview
          levels={levels}
          items={stockItems as any[]}
          customers={customers}
          initialData={editingInvoice}
          editingIndex={editingInvoiceIndex}
          onSaved={updatedInvoices => { setSavedInvoices(updatedInvoices); setEditingInvoiceIndex(null); setEditingInvoice(null); }}
          onSaveAndPrint={(inv, idx) => handlePreviewInvoice(inv, idx)}
          onReturn={() => { setShowManagement(false); setEditingInvoiceIndex(null); setEditingInvoice(null); }}
        />
      </>}

      {activeTab !== "Dashboard" && <SectionView tab={activeTab} levels={levels} items={filteredItems} isLoading={isLoading} search={search} setSearch={setSearch} prices={prices} updatePrice={updatePrice} />}

      {previewInvoice && (
        <PdfPreviewModal
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          title={`Sales Invoice - ${previewInvoice.customer || "Invoice"}`}
          generatePdf={(opts) => generatePdfForInvoice(previewInvoice, opts)}
          pdfFilename={`Sales_Invoice_${previewInvoice.customer || "draft"}.pdf`}
          defaultEmailTo={previewInvoice.customerEmail || ""}
          defaultEmailSubject={`Sales Invoice from BizOne - ${previewInvoice.customer}`}
          defaultEmailBody={`Dear ${previewInvoice.customer || "Customer"},\n\nPlease find attached your Sales Invoice.\n\nThank you for your business!`}
          onEdit={() => {
            setPreviewOpen(false);
            if (previewInvoiceIndex !== null && previewInvoiceIndex >= 0) {
              handleEditInvoice(previewInvoice, previewInvoiceIndex);
            } else {
              setShowManagement(true);
            }
          }}
        />
      )}

    </div>
  );
}

function SavedInvoiceTable({ invoices, onManagement, onDelete, onEdit, onPreview }: { invoices: any[]; onManagement: () => void; onDelete: (index: number) => void; onEdit: (invoice: any, index: number) => void; onPreview: (invoice: any, index: number) => void }) {
  const { toast } = useToast();

  const exportToExcel = () => {
    if (!invoices.length) {
      toast({ title: "No data", description: "No saved invoices to export." });
      return;
    }
    const exportData = invoices.map((invoice: any) => {
      const rows = invoice.rows || [];
      const totalQuantity = rows.reduce((sum: number, row: any) => sum + Number(row.quantity || 0), 0);
      const subtotal = Number(invoice.subtotal ?? invoice.taxable ?? rows.reduce((sum: number, row: any) => sum + Number(row.amount ?? (Number(row.unitPrice || 0) * Number(row.quantity || 0) * (1 - Number(row.discount || 0) / 100))), 0));
      const gst = Number(invoice.gst ?? rows.reduce((sum: number, row: any) => { const rowAmt = Number(row.amount ?? (Number(row.unitPrice || 0) * Number(row.quantity || 0) * (1 - Number(row.discount || 0) / 100))); const rate = Number(row.taxRate ?? 9); return sum + (rowAmt * rate / 100); }, 0));
      const totalAmount = Number(invoice.total ?? (subtotal + gst));
      return {
        "Customer": invoice.customer || "-",
        "Price Level": invoice.priceLevel || "-",
        "Date": invoice.invoiceDate || "-",
        "Items": rows.length,
        "Total Quantity": totalQuantity,
        "Subtotal (SGD)": subtotal.toFixed(2),
        "GST (SGD)": gst.toFixed(2),
        "Total Amount (SGD)": totalAmount.toFixed(2),
      };
    });
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Saved Sales Invoices");
    XLSX.writeFile(workbook, `Saved_Sales_Invoices_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast({ title: "Excel Exported", description: "Saved sales invoices exported to Excel." });
  };

  const exportToPdf = () => {
    if (!invoices.length) {
      toast({ title: "No data", description: "No saved invoices to export." });
      return;
    }
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Saved Sales Invoices", 14, 15);
    doc.setFontSize(10);
    doc.text(`Generated on: ${new Date().toISOString().slice(0, 10)}`, 14, 22);

    const tableData = invoices.map((invoice: any) => {
      const rows = invoice.rows || [];
      const totalQuantity = rows.reduce((sum: number, row: any) => sum + Number(row.quantity || 0), 0);
      const subtotal = Number(invoice.subtotal ?? invoice.taxable ?? rows.reduce((sum: number, row: any) => sum + Number(row.amount ?? (Number(row.unitPrice || 0) * Number(row.quantity || 0) * (1 - Number(row.discount || 0) / 100))), 0));
      const gst = Number(invoice.gst ?? rows.reduce((sum: number, row: any) => { const rowAmt = Number(row.amount ?? (Number(row.unitPrice || 0) * Number(row.quantity || 0) * (1 - Number(row.discount || 0) / 100))); const rate = Number(row.taxRate ?? 9); return sum + (rowAmt * rate / 100); }, 0));
      const totalAmount = Number(invoice.total ?? (subtotal + gst));
      return [
        invoice.customer || "-",
        invoice.priceLevel || "-",
        invoice.invoiceDate || "-",
        rows.length,
        totalQuantity,
        subtotal.toFixed(2),
        gst.toFixed(2),
        totalAmount.toFixed(2),
      ];
    });

    autoTable(doc, {
      head: [["Customer", "Price Level", "Date", "Items", "Total Qty", "Subtotal (SGD)", "GST (SGD)", "Total (SGD)"]],
      body: tableData,
      startY: 28,
    });

    doc.save(`Saved_Sales_Invoices_${new Date().toISOString().slice(0, 10)}.pdf`);
    toast({ title: "PDF Exported", description: "Saved sales invoices exported to PDF." });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#2563EB]">Saved Sales Invoices</h1>
          <p className="mt-1 text-muted-foreground">Saved sales invoice definitions with price levels.</p>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2 border-slate-300">
                <Download className="h-4 w-4" /> Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={exportToExcel} className="gap-2 cursor-pointer">
                <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Excel
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportToPdf} className="gap-2 cursor-pointer">
                <FileText className="h-4 w-4 text-red-600" /> PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button type="button" className="gap-2 bg-[#2563EB] hover:bg-[#1D4ED8]" onClick={onManagement}>
            Price Management
          </Button>
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-[#F9FAFB] text-left text-xs uppercase text-[#6B7280]">
              <th className="px-4 py-3 font-semibold">CUSTOMER</th>
              <th className="px-4 py-3 font-semibold">SALES PERSON</th>
              <th className="px-4 py-3 font-semibold">PRICE LEVEL</th>
              <th className="px-4 py-3 font-semibold">DATE</th>
              <th className="px-4 py-3 font-semibold">ITEMS</th>
              <th className="px-4 py-3 font-semibold">TOTAL QUANTITY</th>
              <th className="px-4 py-3 text-right font-semibold">SUBTOTAL (SGD)</th>
              <th className="px-4 py-3 text-right font-semibold">GST (SGD)</th>
              <th className="px-4 py-3 text-right font-semibold">TOTAL AMOUNT (SGD)</th>
              <th className="px-4 py-3 text-right font-semibold">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-[#6B7280]">
                  No saved sales invoice available.
                </td>
              </tr>
            ) : (
              invoices.map((invoice: any, index: number) => {
                const rows = invoice.rows || [];
                const totalQuantity = rows.reduce((sum: number, row: any) => sum + Number(row.quantity || 0), 0);
                const subtotal = Number(invoice.subtotal ?? invoice.taxable ?? rows.reduce((sum: number, row: any) => sum + Number(row.amount ?? (Number(row.unitPrice || 0) * Number(row.quantity || 0) * (1 - Number(row.discount || 0) / 100))), 0));
                const gst = Number(invoice.gst ?? rows.reduce((sum: number, row: any) => { const rowAmt = Number(row.amount ?? (Number(row.unitPrice || 0) * Number(row.quantity || 0) * (1 - Number(row.discount || 0) / 100))); const rate = Number(row.taxRate ?? 9); return sum + (rowAmt * rate / 100); }, 0));
                const totalAmount = Number(invoice.total ?? (subtotal + gst));
                return (
                  <tr key={`${invoice.savedAt || invoice.invoiceDate}-${index}`} className="border-b last:border-0 hover:bg-[#F8FAFC]">
                    <td className="px-4 py-3 font-medium">{invoice.customer || "-"}</td>
                    <td className="px-4 py-3 text-[#4B5563]">{invoice.salesPerson || "-"}</td>
                    <td className="px-4 py-3 text-[#4B5563]">{invoice.priceLevel || "-"}</td>
                    <td className="px-4 py-3 text-[#4B5563]">{invoice.invoiceDate || "-"}</td>
                    <td className="px-4 py-3">{rows.length}</td>
                    <td className="px-4 py-3">{totalQuantity}</td>
                    <td className="px-4 py-3 text-right font-medium">{subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="px-4 py-3 text-right font-medium">{gst.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="px-4 py-3 text-right font-medium">{totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-[#6B7280] hover:text-[#2563EB] hover:bg-blue-50" title="Edit invoice" onClick={() => onEdit(invoice, index)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-[#6B7280] hover:text-[#DC2626] hover:bg-red-50" title="Delete invoice" onClick={() => onDelete(index)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Metric({ icon: Icon, value, label }: { icon: any; value: number; label: string }) { return <div className="flex items-center gap-3 rounded border bg-slate-50 p-3"><div className="rounded bg-blue-50 p-2 text-[#1265d8]"><Icon className="h-4 w-4" /></div><div><div className="text-xl font-bold text-slate-800">{value}</div><div className="text-[10px] text-muted-foreground">{label}</div></div></div>; }

function InvoicePreview({ levels, items, customers, initialData, editingIndex, onSaved, onSaveAndPrint, onReturn }: { levels: PriceLevel[]; items: any[]; customers: any[]; initialData?: any; editingIndex?: number | null; onSaved: (updatedInvoices: any[]) => void; onSaveAndPrint: (invoice: any, index?: number) => void; onReturn: () => void }) {
  const { toast } = useToast();
  const { salesPersons } = useSalesPersons();
  const [customer, setCustomer] = useState(initialData?.customer || "");
  const [salesPerson, setSalesPerson] = useState(initialData?.salesPerson || "");
  const [priceLevel, setPriceLevel] = useState(() => {
    if (initialData?.priceLevel) {
      const match = levels.find(l => l.name === initialData.priceLevel);
      if (match) return match.id;
    }
    return levels[1]?.id || levels[0]?.id || "";
  });
  const [invoiceDate, setInvoiceDate] = useState(() => initialData?.invoiceDate || new Date().toISOString().split("T")[0]);
  const [currency, setCurrency] = useState(initialData?.currency || "SGD");
  const [paymentTerms, setPaymentTerms] = useState(initialData?.paymentTerms || "30 Days");
  const [quantities, setQuantities] = useState<Record<string, number | string>>(() => {
    if (initialData?.rows) {
      const map: Record<string, number | string> = {};
      initialData.rows.forEach((r: any) => { map[r.itemId] = r.quantity; });
      return map;
    }
    return {};
  });
  const [discounts, setDiscounts] = useState<Record<string, number>>(() => {
    if (initialData?.rows) {
      const map: Record<string, number> = {};
      initialData.rows.forEach((r: any) => { map[r.itemId] = r.discount; });
      return map;
    }
    return {};
  });
  const [unitPrices, setUnitPrices] = useState<Record<string, number>>(() => {
    if (initialData?.rows) {
      const map: Record<string, number> = {};
      initialData.rows.forEach((r: any) => { map[r.itemId] = r.unitPrice; });
      return map;
    }
    return {};
  });
  const [taxRates, setTaxRates] = useState<Record<string, number>>(() => {
    if (initialData?.rows) {
      const map: Record<string, number> = {};
      initialData.rows.forEach((r: any) => { map[r.itemId] = r.taxRate; });
      return map;
    }
    return {};
  });
  const [uoms, setUoms] = useState<Record<string, string>>(() => {
    if (initialData?.rows) {
      const map: Record<string, string> = {};
      initialData.rows.forEach((r: any) => { map[r.itemId] = r.uom; });
      return map;
    }
    return {};
  });
  const [itemDetails, setItemDetails] = useState<Record<string, { code: string; name: string }>>(() => {
    if (initialData?.rows) {
      const map: Record<string, { code: string; name: string }> = {};
      initialData.rows.forEach((r: any) => { map[r.itemId] = { code: r.code, name: r.name }; });
      return map;
    }
    return {};
  });
  const [removedItems, setRemovedItems] = useState<string[]>([]);
  const [addedItems, setAddedItems] = useState<any[]>([]);
  const [pickerRow, setPickerRow] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (initialData) {
      setCustomer(initialData.customer || "");
      setSalesPerson(initialData.salesPerson || "");
      if (initialData.priceLevel) {
        const match = levels.find(l => l.name === initialData.priceLevel);
        if (match) setPriceLevel(match.id);
      }
      setInvoiceDate(initialData.invoiceDate || new Date().toISOString().split("T")[0]);
      setCurrency(initialData.currency || "SGD");
      setPaymentTerms(initialData.paymentTerms || "30 Days");
      if (initialData.rows) {
        const qMap: Record<string, number | string> = {};
        const dMap: Record<string, number> = {};
        const uMap: Record<string, number> = {};
        const tMap: Record<string, number> = {};
        const uomMap: Record<string, string> = {};
        const detMap: Record<string, { code: string; name: string }> = {};
        initialData.rows.forEach((r: any) => {
          qMap[r.itemId] = r.quantity;
          dMap[r.itemId] = r.discount;
          uMap[r.itemId] = r.unitPrice;
          tMap[r.itemId] = r.taxRate;
          uomMap[r.itemId] = r.uom;
          detMap[r.itemId] = { code: r.code, name: r.name };
        });
        setQuantities(qMap);
        setDiscounts(dMap);
        setUnitPrices(uMap);
        setTaxRates(tMap);
        setUoms(uomMap);
        setItemDetails(detMap);
      }
    }
  }, [initialData, levels]);

  const baseItems = initialData?.rows
  ? initialData.rows.map((r: any) => ({
      id: r.itemId,
      code: r.code,
      name: r.name,
      unitPrice: r.unitPrice,
      uom: r.uom,
    }))
  : [];
  const sample = [...baseItems, ...addedItems].filter((item: any) => !removedItems.includes(String(item.id)));
  const rows = sample.map((item: any) => {
    const itemId = String(item.id);
    const rawQty = quantities[itemId];
    const quantity = rawQty !== undefined && rawQty !== null ? rawQty : "";
    const qtyNum = Number(quantity) || 0;
    const discount = discounts[itemId] ?? 0;
    const unitPrice = unitPrices[itemId] ?? Number(item.unitPrice || 0);
    const taxRate = taxRates[itemId] ?? 9;
    const amount = unitPrice * qtyNum * (1 - discount / 100);
    const uom = uoms[itemId] ?? item.uom ?? "Nos";
    const details = itemDetails[itemId] ?? { code: item.code, name: item.name };
    return { item, itemId, code: details.code, name: details.name, quantity, discount, unitPrice, taxRate, uom, amount };
  });
  const subtotal = rows.reduce((sum, row) => sum + row.unitPrice * (Number(row.quantity) || 0), 0);
  const discount = rows.reduce((sum, row) => sum + row.unitPrice * (Number(row.quantity) || 0) - row.amount, 0);
  const taxable = subtotal - discount;
  const gst = rows.reduce((sum, row) => sum + row.amount * (row.taxRate / 100), 0);
  const total = taxable + gst;
  const deleteIconStyle = `button.text-red-500 { font-size: 0; } button.text-red-500::after { content: "\\1F5D1"; font-size: 14px; }`;
  const handlePickedItem = ({ item, qty }: StockItemSelection) => {
    const selectedQty = qty !== undefined && qty !== null && String(qty).trim() !== "" ? Number(qty) : "";
    if (pickerRow) {
      setItemDetails({ ...itemDetails, [pickerRow]: { code: item.code, name: item.name } });
      setUnitPrices({ ...unitPrices, [pickerRow]: Number(item.unitPrice || 0) });
      setUoms({ ...uoms, [pickerRow]: item.uom || "Nos" });
      setQuantities({ ...quantities, [pickerRow]: selectedQty });
    } else {
      const addedId = `added-${Date.now()}-${item.id}`;
      setAddedItems([...addedItems, { ...item, id: addedId }]);
      setQuantities({ ...quantities, [addedId]: selectedQty });
    }
    setPickerRow(null);
  };
const saveInvoice = (print = false) => {
  const invoice = {
    customer,
    salesPerson,
    priceLevel:
      levels.find(level => level.id === priceLevel)?.name || priceLevel,
    invoiceDate,
    currency,
    paymentTerms,
    rows,
    subtotal: taxable,
    gst,
    total,
    savedAt: new Date().toISOString(),
  };

  const existing = JSON.parse(
    window.localStorage.getItem("multi-price-invoices-v1") || "[]"
  );

  let updatedInvoices: any[] = [];
  let targetIndex = 0;

  if (
    editingIndex !== null &&
    editingIndex !== undefined &&
    editingIndex >= 0 &&
    Array.isArray(existing)
  ) {
    updatedInvoices = [...existing];
    updatedInvoices[editingIndex] = invoice;
    targetIndex = editingIndex;
  } else {
    updatedInvoices = [
      invoice,
      ...(Array.isArray(existing) ? existing : []),
    ];
    targetIndex = 0;
  }

  window.localStorage.setItem(
    "multi-price-invoices-v1",
    JSON.stringify(updatedInvoices)
  );

  if (print) {
    onSaveAndPrint(invoice, targetIndex);
  }

  setQuantities({});
  setDiscounts({});
  setUnitPrices({});
  setTaxRates({});
  setUoms({});
  setItemDetails({});
  setRemovedItems([]);
  setAddedItems([]);

  setCustomer("");
  setSalesPerson("");
  setPriceLevel(levels[1]?.id || levels[0]?.id || "");
  setInvoiceDate(new Date().toISOString().split("T")[0]);
  setCurrency("SGD");
  setPaymentTerms("30 Days");

  onSaved(updatedInvoices);
  window.dispatchEvent(new Event("multi-price-invoices-updated"));

  toast({
    title:
      editingIndex !== null &&
      editingIndex !== undefined
        ? "Sales invoice updated"
        : "Sales invoice saved",
    description:
      "Sales invoice saved successfully. The Sales Invoice table has been cleared.",
  });

  onReturn();
};

  return <><style>{deleteIconStyle}</style><Card className="overflow-hidden"><CardHeader className="border-b py-3"><CardTitle className="flex items-center gap-2 text-sm"><FileDown className="h-4 w-4 text-[#1265d8]" /> Sales Invoice <span className="font-normal text-muted-foreground">(Price Level Auto Apply)</span><Button variant="outline" size="sm" className="ml-auto" onClick={onReturn}>Price Management</Button></CardTitle></CardHeader><CardContent className="space-y-3 p-3">
    <div className="grid gap-3 md:grid-cols-6"><EditableField label="Customer *"><select value={customer} onChange={e => setCustomer(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">Select customer</option>{customers.map((entry: any) => <option key={entry.id} value={entry.name}>{entry.name}</option>)}</select></EditableField><EditableField label="Sales Person"><select value={salesPerson} onChange={e => setSalesPerson(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">Select sales person</option>{salesPersons.map((sp) => <option key={sp.id} value={sp.name}>{sp.name}</option>)}</select></EditableField><EditableField label="Price Level"><select value={priceLevel} onChange={e => setPriceLevel(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">Select price level</option>{levels.map(level => <option key={level.id} value={level.id}>{level.name}</option>)}</select></EditableField><EditableField label="Date *"><Input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} /></EditableField><EditableField label="Currency"><select value={currency} onChange={e => setCurrency(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option>SGD</option><option>USD</option><option>EUR</option></select></EditableField><EditableField label="Payment Terms"><select value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option>Immediate</option><option>30 Days</option><option>60 Days</option></select></EditableField></div>
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_215px]">
      <div className="overflow-x-auto rounded border"><table className="w-full min-w-[700px] text-xs"><thead className="bg-[#102d52] text-left text-white"><tr><th className="px-2 py-2">#</th><th className="px-2 py-2">Item Code</th><th className="px-2 py-2">Item Name</th><th className="px-2 py-2 text-right">Quantity</th><th className="px-2 py-2">UOM</th><th className="px-2 py-2 text-right">Unit Price (SGD)</th><th className="px-2 py-2 text-right">Discount (%)</th><th className="px-2 py-2 text-right">GST %</th><th className="px-2 py-2 text-right">Taxable Value</th><th className="px-2 py-2 text-center">Action</th></tr></thead><tbody className="divide-y">{rows.length ? rows.map((row, index) => <tr key={row.item.id}><td className="px-2 py-2">{index + 1}</td><td className="px-2 py-2"><Input className="h-7 w-20 px-2 font-mono" value={row.code} onChange={e => setItemDetails({ ...itemDetails, [row.itemId]: { code: e.target.value, name: row.name } })} /></td><td className="px-2 py-2"><div className="flex items-center gap-1"><Input className="h-7 w-24 px-2" value={row.name} onChange={e => setItemDetails({ ...itemDetails, [row.itemId]: { code: row.code, name: e.target.value } })} /><Button type="button" variant="outline" size="icon" className="h-7 w-7 shrink-0" title="Select stock item" onClick={() => { setPickerRow(row.itemId); setPickerOpen(true); }}><Package className="h-3.5 w-3.5" /></Button></div></td><td className="px-2 py-2 text-right"><Input className="ml-auto h-7 w-12 px-2 text-right" type="text" inputMode="numeric" value={row.quantity} onChange={e => { const val = e.target.value; const next = { ...quantities }; next[row.itemId] = val === "" ? "" : Number(val.replace(/\D/g, "")); setQuantities(next); }} /></td><td className="px-2 py-2"><Input className="h-7 w-12 px-2" value={row.uom} onChange={e => setUoms({ ...uoms, [row.itemId]: e.target.value })} /></td><td className="px-2 py-2 text-right font-medium text-emerald-700"><Input className="ml-auto h-7 w-20 px-2 text-right" type="text" inputMode="decimal" value={row.unitPrice} onChange={e => setUnitPrices({ ...unitPrices, [row.itemId]: Number(e.target.value.replace(/[^0-9.]/g, "")) || 0 })} /></td><td className="px-2 py-2 text-right"><Input className="ml-auto h-7 w-12 px-2 text-right" type="text" inputMode="decimal" value={row.discount} onChange={e => setDiscounts({ ...discounts, [row.itemId]: Number(e.target.value.replace(/[^0-9.]/g, "")) || 0 })} /></td><td className="px-2 py-2 text-right"><Input className="ml-auto h-7 w-10 px-1 text-right" type="text" inputMode="decimal" value={row.taxRate} onChange={e => setTaxRates({ ...taxRates, [row.itemId]: Number(e.target.value.replace(/[^0-9.]/g, "")) || 0 })} /></td><td className="px-2 py-2 text-right">{row.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td><td className="px-2 py-2 text-center"><Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => setRemovedItems([...removedItems, row.itemId])}>✕</Button></td></tr>) : <tr><td colSpan={10} className="p-5 text-center text-muted-foreground">No stock items available.</td></tr>}</tbody><tfoot><tr><td colSpan={10} className="px-2 py-2"><Button variant="link" size="sm" className="h-auto px-0 text-[#1265d8]" onClick={() => { setPickerRow(null); setPickerOpen(true); }}><Plus className="mr-1 h-3.5 w-3.5" /> Add Item</Button></td></tr></tfoot></table></div>
      <div className="rounded border bg-slate-50 p-3 text-xs"><div className="flex justify-between py-1.5"><span>Sub Total (SGD)</span><span>{subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div><div className="flex justify-between py-1.5"><span>Discount</span><span>{discount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div><div className="flex justify-between py-1.5"><span>Taxable Amount</span><span>{taxable.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div><div className="flex justify-between py-1.5"><span>GST (9%)</span><span>{gst.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div><div className="mt-2 flex justify-between border-t pt-3 text-sm font-bold"><span>Total (SGD)</span><span className="text-lg text-[#1265d8]">{total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div></div>
    </div><div className="flex justify-end gap-2"><Button variant="outline" size="sm" onClick={() => toast({ title: "Invoice changes cancelled" })}>Cancel</Button><Button variant="outline" size="sm" className="gap-1 border-[#9cbce9] text-[#1265d8]" onClick={() => saveInvoice()}><Check className="h-3 w-3" /> Save</Button><Button size="sm" className="gap-1 bg-[#1265d8]" onClick={() => saveInvoice(true)}><FileDown className="h-3 w-3" /> Save & Print</Button></div>
  </CardContent></Card><StockItemPickerDialog open={pickerOpen} onOpenChange={open => { setPickerOpen(open); if (!open) setPickerRow(null); }} onSelect={handlePickedItem} ignoreStockLimit requireWarehouse skipSerialSelection /></>;
}

function Field({ label, value }: { label: string; value: string }) { return <div className="space-y-1"><Label className="text-[10px] text-muted-foreground">{label}</Label><div className="rounded border bg-slate-50 px-3 py-2 text-xs">{value}</div></div>; }
function EditableField({ label, children }: { label: string; children: ReactNode }) { return <div className="space-y-1"><Label className="text-[10px] text-muted-foreground">{label}</Label>{children}</div>; }

function SectionView({ tab, levels, items, isLoading, search, setSearch, prices, updatePrice }: any) {
  if (tab === "Price Level Master") return <Card><CardHeader><CardTitle className="text-base">Price Level Master</CardTitle></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="border-y bg-muted/50 text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-3 text-left">Level</th><th className="px-4 py-3 text-left">Description</th><th className="px-4 py-3 text-left">Customers</th><th className="px-4 py-3 text-left">Status</th></tr></thead><tbody className="divide-y">{levels.map((level: PriceLevel) => <tr key={level.id}><td className="px-4 py-3 font-medium">{level.name}</td><td className="px-4 py-3 text-muted-foreground">{level.description}</td><td className="px-4 py-3">0 customers</td><td className="px-4 py-3"><Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50">Active</Badge></td></tr>)}</tbody></table></div></CardContent></Card>;
  if (tab === "Customer Price Level") return <Card><CardHeader><CardTitle className="text-base">Customer Price Level</CardTitle></CardHeader><CardContent><div className="rounded border border-dashed p-10 text-center text-sm text-muted-foreground"><UsersRound className="mx-auto mb-3 h-8 w-8 text-[#1265d8]" />Customer mappings will appear here. Use this view to assign each customer a default price level.</div></CardContent></Card>;
  if (tab === "Quantity Pricing") return <Card><CardHeader><CardTitle className="text-base">Quantity Pricing</CardTitle></CardHeader><CardContent><div className="rounded border border-dashed p-10 text-center text-sm text-muted-foreground"><BarChart3 className="mx-auto mb-3 h-8 w-8 text-[#1265d8]" />Set quantity breaks for each item and price level.</div></CardContent></Card>;
  if (tab === "Price History" || tab === "Price Approval") return <Card><CardHeader><CardTitle className="text-base">{tab}</CardTitle></CardHeader><CardContent><div className="rounded border border-dashed p-10 text-center text-sm text-muted-foreground"><ShieldCheck className="mx-auto mb-3 h-8 w-8 text-[#1265d8]" />No {tab.toLowerCase()} records yet.</div></CardContent></Card>;
  return <Card><CardHeader className="flex flex-row items-center justify-between"><CardTitle className="text-base">Item Prices</CardTitle><div className="flex gap-2"><div className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="w-64 pl-8" placeholder="Search items..." value={search} onChange={e => setSearch(e.target.value)} /></div><Button variant="outline" className="gap-2"><Upload className="h-4 w-4" /> Import</Button></div></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="border-y bg-muted/50 text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-3 text-left">Item</th>{levels.map((level: PriceLevel) => <th key={level.id} className="px-4 py-3 text-right">{level.name}</th>)}</tr></thead><tbody className="divide-y">{isLoading ? <tr><td colSpan={levels.length + 1} className="p-8 text-center">Loading items...</td></tr> : items.slice(0, 50).map((item: any) => <tr key={item.id}><td className="px-4 py-2"><div className="font-medium">{item.name}</div><div className="font-mono text-xs text-muted-foreground">{item.code}</div></td>{levels.map((level: PriceLevel) => <td key={level.id} className="px-4 py-2 text-right"><Input className="ml-auto h-8 w-28 text-right" placeholder={Number(item.unitPrice || 0).toFixed(2)} value={prices[item.id]?.[level.id] || ""} onChange={e => updatePrice(String(item.id), level.id, e.target.value)} /></td>)}</tr>)}{!isLoading && items.length === 0 && <tr><td colSpan={levels.length + 1} className="p-8 text-center text-muted-foreground">No stock items found.</td></tr>}</tbody></table></div></CardContent></Card>;
}
