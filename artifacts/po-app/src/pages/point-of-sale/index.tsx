import { useEffect, useMemo, useState, type ComponentType } from "react";
import { useListStockItems, getListStockItemsQueryKey, useGetSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { usePagination } from "@/hooks/use-pagination";
import { ListPagination } from "@/components/list-pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ShoppingCart,
  ShoppingBag,
  FileText,
  Tag,
  Minus,
  Plus,
  Trash2,
  ArrowRight,
  ArrowLeft,
  Banknote,
  CreditCard,
  Smartphone,
  Ticket,
  Search,
  ChevronLeft,
  ChevronRight,
  Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PdfPreviewModal } from "@/components/pdf-preview-modal";
import { generatePOS_PDF } from "@/lib/pdf";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type CatalogTab = "all" | "category" | "favourites";
type PaymentMethod = "Cash" | "NETS" | "Credit Card" | "PayNow" | "Voucher";

const PAYMENT_METHODS: { label: string; method: PaymentMethod }[] = [
  { label: "Cash", method: "Cash" },
  { label: "NETS", method: "NETS" },
  { label: "Credit Card", method: "Credit Card" },
  { label: "PayNow", method: "PayNow" },
  { label: "Voucher", method: "Voucher" },
];

const STANDARD_PAYMENT_METHODS: {
  label: string;
  method: PaymentMethod;
  icon: typeof Banknote;
}[] = [
  { label: "Cash", method: "Cash", icon: Banknote },
  { label: "NETS", method: "NETS", icon: CreditCard },
  { label: "PayNow", method: "PayNow", icon: Smartphone },
  { label: "Voucher", method: "Voucher", icon: Ticket },
];

import { useAuth } from "@/contexts/auth-context";
import { useSalesPersons } from "@/hooks/use-sales-persons";

type CartLine = {
  id: number;
  code: string;
  name: string;
  unitPrice: number;
  qty: number;
};

type PaymentTender = {
  method: PaymentMethod;
  amount: number;
};

type PosSaleRecord = {
  id: string;
  posNumber: string;
  createdAt: string;
  items: CartLine[];
  itemCount: number;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  payments: PaymentTender[];
  salesPerson?: string;
  note: string;
  status: "paid";
};

const PAGE_SIZE = 12;
const GST_FALLBACK = 9;
const POS_SALES_KEY = "pos-sales-v1";

function money(n: number) {
  return `S$ ${n.toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function loadPosSales(): PosSaleRecord[] {
  try {
    const raw = localStorage.getItem(POS_SALES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function savePosSales(list: PosSaleRecord[]) {
  try {
    localStorage.setItem(POS_SALES_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

function formatStamp(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-SG", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function paymentsLabel(payments: PaymentTender[]) {
  if (!payments.length) return "—";
  return payments.map((p) => `${p.method} ${money(p.amount)}`).join(" · ");
}

function paymentAmount(payments: PaymentTender[], methods: string | string[]) {
  const list = Array.isArray(methods) ? methods : [methods];
  const sum = payments
    .filter((p) => list.includes(p.method) || (list.includes("Voucher") && (p.method as string) === "Other"))
    .reduce((s, p) => s + p.amount, 0);
  return sum > 0 ? money(sum) : "—";
}

function tenderTotalByMethod(tenders: PaymentTender[], method: PaymentMethod) {
  return Math.round(
    tenders.filter((t) => t.method === method).reduce((s, t) => s + t.amount, 0) * 100,
  ) / 100;
}

function normalizePayments(payments: PaymentTender[] = []): PaymentTender[] {
  return payments.map((p) => ({
    ...p,
    method: (p.method === ("Other" as string) ? "Voucher" : p.method) as PaymentMethod,
  }));
}

function KpiCard({
  label,
  value,
  icon: Icon,
  iconClass,
}: {
  label: string;
  value: string;
  icon: ComponentType<{ className?: string }>;
  iconClass: string;
}) {
  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-white px-4 py-3.5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-[#6B7280]">{label}</p>
          <p className="mt-1 text-xl font-bold tracking-tight text-[#111827]">{value}</p>
        </div>
        <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg", iconClass)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

export default function PointOfSalePage() {
  const { toast } = useToast();
  const { selectedCompany } = useAuth();
  const { salesPersons } = useSalesPersons();
  const [mode, setMode] = useState<"list" | "pos">("list");
  const [salesList, setSalesList] = useState<PosSaleRecord[]>(() => loadPosSales());
  const [listSearch, setListSearch] = useState("");
  const [editingSale, setEditingSale] = useState<PosSaleRecord | null>(null);
  const [tab, setTab] = useState<CatalogTab>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [salesPerson, setSalesPerson] = useState("");
  const [discount, setDiscount] = useState(0);
  const [discountType, setDiscountType] = useState("manual");
  const [note, setNote] = useState("");
  const [favourites, setFavourites] = useState<number[]>(() => {
    try {
      const raw = localStorage.getItem("pos-favourites");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [tenders, setTenders] = useState<PaymentTender[]>([]);
  const [baselinePayments, setBaselinePayments] = useState<PaymentTender[]>([]);
  const [payOpen, setPayOpen] = useState(false);
  const [payMethod, setPayMethod] = useState<PaymentMethod>("Cash");
  const [payAmount, setPayAmount] = useState(0);
  const [pendingPayByMethod, setPendingPayByMethod] = useState<Partial<Record<PaymentMethod, number>>>({});
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewSale, setPreviewSale] = useState<PosSaleRecord | null>(null);

  const { data: settings } = useGetSettings({ query: { queryKey: getGetSettingsQueryKey() } });
  const gstRate = Number((settings as any)?.gstRate ?? GST_FALLBACK) || GST_FALLBACK;

  const stockParams = { type: "product" } as any;
  const { data: stockItems = [], isLoading } = useListStockItems(stockParams, {
    query: { queryKey: getListStockItemsQueryKey(stockParams), refetchOnWindowFocus: false },
  });

  const products = useMemo(() => {
    return (stockItems as any[])
      .filter((i) => i.isActive !== false)
      .map((i) => ({
        id: i.id as number,
        code: String(i.code || `ITEM${i.id}`),
        name: String(i.name || "Item"),
        unitPrice: Number(i.unitPrice) || 0,
        uom: String(i.uom || "Pcs"),
      }));
  }, [stockItems]);

  const filtered = useMemo(() => {
    let rows = products;
    if (tab === "favourites") rows = rows.filter((p) => favourites.includes(p.id));
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (p) => p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q),
      );
    }
    return rows;
  }, [products, tab, favourites, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const showingFrom = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const showingTo = Math.min(currentPage * PAGE_SIZE, filtered.length);

  useEffect(() => {
    setPage(1);
  }, [tab, search]);

  const subtotal = cart.reduce((sum, line) => sum + line.unitPrice * line.qty, 0);
  // Manual = flat SGD amount; Percent = % of subtotal
  const rawDiscount = Math.max(0, Number(discount) || 0);
  const discountAmt =
    discountType === "percent"
      ? Math.min(subtotal, (subtotal * rawDiscount) / 100)
      : Math.min(subtotal, rawDiscount);
  const taxable = Math.max(0, subtotal - discountAmt);
  // GST exclusive: tax is added on top of taxable amount
  const gstAmt = (taxable * gstRate) / 100;
  const total = taxable + gstAmt;
  const baselinePaid = baselinePayments.reduce((s, t) => s + t.amount, 0);
  const sessionPaid = tenders.reduce((s, t) => s + t.amount, 0);
  const paidSoFar = baselinePaid + sessionPaid;
  const balanceDue = Math.max(0, Math.round((total - paidSoFar) * 100) / 100);
  const alreadyPaidTenders = editingSale ? baselinePayments : tenders;
  const alreadyPaidTotal = alreadyPaidTenders.reduce((s, t) => s + t.amount, 0);

  const listStats = useMemo(() => {
    // KPIs match the transactions list (all saved POS sales), not a today-only filter.
    const sales = salesList.reduce((s, r) => s + (Number(r.total) || 0), 0);
    const transactions = salesList.length;
    const itemsSold = salesList.reduce(
      (s, r) => s + (Number(r.itemCount) || r.items?.reduce((n, i) => n + (Number(i.qty) || 0), 0) || 0),
      0,
    );
    const avgSale = transactions > 0 ? sales / transactions : 0;
    return { sales, transactions, itemsSold, avgSale };
  }, [salesList]);

  function addToCart(product: { id: number; code: string; name: string; unitPrice: number }) {
    setCart((prev) => {
      const existing = prev.find((l) => l.id === product.id);
      if (existing) {
        return prev.map((l) => (l.id === product.id ? { ...l, qty: l.qty + 1 } : l));
      }
      return [
        ...prev,
        {
          id: product.id,
          code: product.code,
          name: product.name,
          unitPrice: 0,
          qty: 1,
        },
      ];
    });
  }

  function updateUnitPrice(id: number, unitPrice: number) {
    setCart((prev) =>
      prev.map((l) => (l.id === id ? { ...l, unitPrice: Math.max(0, unitPrice) } : l)),
    );
  }

  function updateQty(id: number, qty: number, removeIfZero = false) {
    setCart((prev) => {
      const next = prev.map((l) => (l.id === id ? { ...l, qty: Math.max(0, qty) } : l));
      return removeIfZero ? next.filter((l) => l.qty > 0) : next;
    });
  }

  function removeLine(id: number) {
    setCart((prev) => prev.filter((l) => l.id !== id));
  }

  function clearCart() {
    setCart([]);
    setSalesPerson("");
    setDiscount(0);
    setDiscountType("manual");
    setNote("");
    setTenders([]);
    setBaselinePayments([]);
    setPendingPayByMethod({});
  }

  function startNewPos() {
    setEditingSale(null);
    clearCart();
    setMode("pos");
  }

  function loadSaleForEdit(sale: PosSaleRecord) {
    setEditingSale(sale);
    setCart(sale.items.map((i) => ({ ...i })));
    setSalesPerson(sale.salesPerson || "");
    setDiscount(sale.discount || 0);
    setDiscountType("manual");
    setNote(sale.note || "");
    setBaselinePayments(normalizePayments(sale.payments || []));
    setTenders([]);
    setPendingPayByMethod({});
    setMode("pos");
  }

  function deleteEditingSale() {
    if (!editingSale) return;
    const next = salesList.filter((x) => x.id !== editingSale.id);
    setSalesList(next);
    savePosSales(next);
    toast({ title: "POS sale deleted" });
    setEditingSale(null);
    clearCart();
    setMode("list");
  }

  function switchToPayMethod(nextMethod: PaymentMethod) {
    if (nextMethod === payMethod) return;

    const raw = Math.max(0, Number(payAmount) || 0);

    setPendingPayByMethod((prev) => {
      const next = { ...prev };
      if (raw > 0) next[payMethod] = raw;
      else delete next[payMethod];

      const pendingTotal = PAYMENT_METHODS.reduce((s, { method }) => s + (next[method] || 0), 0);
      const remaining = Math.max(0, Math.round((total - paidSoFar - pendingTotal) * 100) / 100);

      if (next[nextMethod] != null && next[nextMethod]! > 0) {
        setPayAmount(next[nextMethod]!);
      } else if (raw > 0) {
        // Only auto-fill remaining when leaving a method with a typed amount
        setPayAmount(remaining);
      } else {
        setPayAmount(0);
      }
      return next;
    });
    setPayMethod(nextMethod);
  }

  function openPayment(method: PaymentMethod = "Cash", options?: { allowZeroBalance?: boolean }) {
    if (cart.length === 0) {
      toast({ title: "Cart is empty", description: "Add items before taking payment." });
      return;
    }
    if (cart.some((l) => !l.unitPrice || l.unitPrice <= 0)) {
      toast({ title: "Enter price", description: "Set a price for each line item before payment." });
      return;
    }
    if (balanceDue <= 0 && !options?.allowZeroBalance) {
      toast({ title: "Already paid", description: "No balance remaining on this sale." });
      return;
    }
    setPayMethod(method);
    setPayAmount(0);
    setPendingPayByMethod({});
    setPayOpen(true);
  }

  function allCommittedPayments(): PaymentTender[] {
    return editingSale ? [...baselinePayments, ...tenders] : [...tenders];
  }

  function buildSaleRecord(allTenders: PaymentTender[], existing?: PosSaleRecord | null): PosSaleRecord {
    const itemsSold = cart.reduce((s, l) => s + l.qty, 0);
    return {
      id: existing?.id || `pos-${Date.now()}`,
      posNumber: existing?.posNumber || `POS-${String(salesList.length + 1).padStart(4, "0")}`,
      createdAt: existing?.createdAt || new Date().toISOString(),
      items: cart.map((c) => ({ ...c })),
      itemCount: itemsSold,
      subtotal,
      discount: discountAmt,
      tax: gstAmt,
      total,
      payments: allTenders,
      salesPerson: salesPerson || undefined,
      note,
      status: "paid",
    };
  }

  function finalizeSale(allTenders: PaymentTender[], options?: { showPreview?: boolean }) {
    const existing = editingSale;
    let record: PosSaleRecord;

    if (existing) {
      record = buildSaleRecord(allTenders, existing);
      const nextList = salesList.map((s) => (s.id === existing.id ? record : s));
      setSalesList(nextList);
      savePosSales(nextList);
      if (!options?.showPreview) {
        toast({
          title: "POS updated",
          description: `${record.posNumber} · ${paymentsLabel(allTenders)}`,
        });
      }
    } else {
      record = buildSaleRecord(allTenders, null);
      const nextList = [record, ...salesList];
      setSalesList(nextList);
      savePosSales(nextList);
    }

    setEditingSale(null);
    clearCart();
    setBaselinePayments([]);
    setTenders([]);
    setPendingPayByMethod({});
    setPayOpen(false);

    if (options?.showPreview) {
      setPreviewSale(record);
      setPreviewOpen(true);
    } else {
      setMode("list");
    }
  }

  function stagedPaymentTotals() {
    const otherPending = PAYMENT_METHODS.reduce(
      (s, { method }) => (method !== payMethod ? s + (pendingPayByMethod[method] || 0) : s),
      0,
    );
    const received = Math.max(0, Number(payAmount) || 0);
    const due = Math.max(0, Math.round((total - paidSoFar - otherPending) * 100) / 100);
    const thisPayApplied =
      payMethod === "Cash" ? received : Math.min(received, due);
    const stagedTotal = otherPending + thisPayApplied;
    const paidTotal = Math.round((paidSoFar + stagedTotal) * 100) / 100;
    const remainingAfter = Math.max(0, Math.round((total - paidTotal) * 100) / 100);
    return { otherPending, received, due, thisPayApplied, stagedTotal, paidTotal, remainingAfter };
  }

  function buildTendersFromStaged(): PaymentTender[] {
    const { thisPayApplied } = stagedPaymentTotals();
    const next = [...allCommittedPayments()];
    for (const { method } of PAYMENT_METHODS) {
      if (method === payMethod) continue;
      const amt = pendingPayByMethod[method];
      if (amt && amt > 0) {
        next.push({ method, amount: Math.round(amt * 100) / 100 });
      }
    }
    if (thisPayApplied > 0) {
      next.push({ method: payMethod, amount: thisPayApplied });
    }
    return next;
  }

  function saveEditingSale() {
    if (!editingSale) return;
    if (cart.length === 0) {
      toast({ title: "Cart is empty", description: "Add at least one item." });
      return;
    }
    if (cart.some((l) => !l.unitPrice || l.unitPrice <= 0)) {
      toast({ title: "Enter price", description: "Set a price for each line item before saving." });
      return;
    }
    openPayment("Cash", { allowZeroBalance: true });
  }

  function paymentDisplayTotals() {
    const pendingTotal = PAYMENT_METHODS.reduce(
      (s, { method }) => s + (pendingPayByMethod[method] || 0),
      0,
    );
    const thisPayRaw = Math.max(0, Number(payAmount) || 0);
    const dueForInput = Math.max(
      0,
      Math.round((total - paidSoFar - pendingTotal) * 100) / 100,
    );
    const thisPayApplied =
      payMethod === "Cash" ? thisPayRaw : Math.min(thisPayRaw, dueForInput);
    const displayedPaid = Math.round((paidSoFar + pendingTotal + thisPayApplied) * 100) / 100;
    const remainingAfter = Math.max(
      0,
      Math.round((total - paidSoFar - pendingTotal - thisPayApplied) * 100) / 100,
    );
    const cashChange =
      payMethod === "Cash" && thisPayRaw > dueForInput + 0.001
        ? Math.round((thisPayRaw - dueForInput) * 100) / 100
        : 0;
    return {
      pendingTotal,
      thisPayRaw,
      dueForInput,
      thisPayApplied,
      displayedPaid,
      remainingAfter,
      cashChange,
    };
  }

  function pendingPayByMethodHasValue() {
    return PAYMENT_METHODS.some(({ method }) => (pendingPayByMethod[method] || 0) > 0);
  }

  function amountForMethod(method: PaymentMethod, thisPayApplied: number) {
    const saved =
      tenderTotalByMethod(alreadyPaidTenders, method) + tenderTotalByMethod(tenders, method);
    const pending = pendingPayByMethod[method] || 0;
    const unstaged = method === payMethod ? thisPayApplied : 0;
    return Math.round((saved + pending + unstaged) * 100) / 100;
  }

  function savePayment() {
    const { due, received, thisPayApplied, remainingAfter } = stagedPaymentTotals();

    // Fully covered (saved + staged) — complete and show preview
    if (remainingAfter <= 0.001) {
      const finalTenders =
        thisPayApplied > 0 || Object.keys(pendingPayByMethod).length > 0
          ? buildTendersFromStaged()
          : allCommittedPayments();
      setPayOpen(false);
      finalizeSale(finalTenders, { showPreview: true });
      return;
    }

    if (received <= 0) {
      toast({ title: "Enter amount", description: "Payment amount must be greater than zero." });
      return;
    }

    // Cash may exceed due (change); other methods cannot exceed balance
    if (payMethod !== "Cash" && received > due + 0.001) {
      toast({ title: "Amount too high", description: `Balance due is ${money(due)}.` });
      return;
    }

    const tenderAmt = thisPayApplied;

    setTenders((prev) => {
      const nextTenders = [...prev, { method: payMethod, amount: tenderAmt }];
      const sessionPaid = nextTenders.reduce((s, t) => s + t.amount, 0);
      const nextPaidSoFar = baselinePaid + sessionPaid;
      const remaining = Math.max(0, Math.round((total - nextPaidSoFar) * 100) / 100);
      const finalTenders = editingSale ? [...baselinePayments, ...nextTenders] : nextTenders;

      if (remaining <= 0.001) {
        queueMicrotask(() => {
          setPayOpen(false);
          finalizeSale(finalTenders, { showPreview: true });
        });
      } else {
        queueMicrotask(() => {
          setPayAmount(remaining);
          setPendingPayByMethod((p) => {
            const next = { ...p };
            delete next[payMethod];
            return next;
          });
          toast({
            title: `${payMethod} added`,
            description: `Paid ${money(tenderAmt)}. Remaining ${money(remaining)} — choose another method.`,
          });
        });
      }

      return nextTenders;
    });
  }

  function completeSale() {
    openPayment("Cash");
  }

  const pageNumbers = useMemo(() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages: (number | "…")[] = [1, 2, 3, 4, 5];
    if (totalPages > 6) pages.push("…", totalPages);
    return pages;
  }, [totalPages]);

  const tabs: { id: CatalogTab; label: string }[] = [
    { id: "all", label: "All Items" },
    { id: "category", label: "Category" },
    { id: "favourites", label: "Favourites" },
  ];

  const filteredSales = useMemo(() => {
    const q = listSearch.trim().toLowerCase();
    if (!q) return salesList;
    return salesList.filter(
      (s) =>
        s.posNumber.toLowerCase().includes(q) ||
        paymentsLabel(s.payments).toLowerCase().includes(q) ||
        s.items.some((i) => i.name.toLowerCase().includes(q) || i.code.toLowerCase().includes(q)),
    );
  }, [salesList, listSearch]);

  const { page: salesPage, setPage: setSalesPage, totalPages: salesTotalPages, paginatedItems: paginatedSales } = usePagination(filteredSales);

  if (mode === "list") {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-[#2563EB]">Point of Sale</h1>
          </div>
          <Button
            type="button"
            className="gap-2 bg-[#2563EB] hover:bg-[#1D4ED8]"
            onClick={startNewPos}
          >
            <Plus className="h-4 w-4" /> Create New POS
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Total Sales"
            value={money(listStats.sales)}
            icon={ShoppingCart}
            iconClass="bg-[#DBEAFE] text-[#2563EB]"
          />
          <KpiCard
            label="Transactions"
            value={String(listStats.transactions)}
            icon={ShoppingBag}
            iconClass="bg-[#EDE9FE] text-[#7C3AED]"
          />
          <KpiCard
            label="Average Sale"
            value={money(listStats.avgSale)}
            icon={FileText}
            iconClass="bg-[#DCFCE7] text-[#16A34A]"
          />
          <KpiCard
            label="Items Sold"
            value={String(listStats.itemsSold)}
            icon={Tag}
            iconClass="bg-[#FFEDD5] text-[#EA580C]"
          />
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by POS number, item, or payment..."
            value={listSearch}
            onChange={(e) => setListSearch(e.target.value)}
          />
        </div>

        <div className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-[#F9FAFB] text-left text-xs uppercase text-[#6B7280]">
                  <th className="px-4 py-3">POS No.</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Items</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Cash</th>
                  <th className="px-4 py-3 text-right">NETS</th>
                  <th className="px-4 py-3 text-right">Credit Card</th>
                  <th className="px-4 py-3 text-right">PayNow</th>
                  <th className="px-4 py-3 text-right">Voucher</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSales.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-12 text-center text-[#6B7280]">
                      No POS sales yet. Click &quot;Create New POS&quot; to start.
                    </td>
                  </tr>
                ) : (
                  paginatedSales.map((sale) => (
                    <tr
                      key={sale.id}
                      className="border-b cursor-pointer hover:bg-[#F8FAFC]"
                      onClick={() => loadSaleForEdit(sale)}
                    >
                      <td className="px-4 py-3 font-mono font-medium">{sale.posNumber}</td>
                      <td className="px-4 py-3 text-[#4B5563]">{formatStamp(sale.createdAt)}</td>
                      <td className="px-4 py-3">{sale.itemCount}</td>
                      <td className="px-4 py-3 text-right font-medium">{money(sale.total)}</td>
                      <td className="px-4 py-3 text-right text-[#4B5563]">{paymentAmount(sale.payments, "Cash")}</td>
                      <td className="px-4 py-3 text-right text-[#4B5563]">{paymentAmount(sale.payments, "NETS")}</td>
                      <td className="px-4 py-3 text-right text-[#4B5563]">{paymentAmount(sale.payments, "Credit Card")}</td>
                      <td className="px-4 py-3 text-right text-[#4B5563]">{paymentAmount(sale.payments, "PayNow")}</td>
                      <td className="px-4 py-3 text-right text-[#4B5563]">{paymentAmount(sale.payments, "Voucher")}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge className="bg-emerald-600 hover:bg-emerald-700">Paid</Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1 text-[#6B7280]">
                          <Pencil className="h-4 w-4" />
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <ListPagination page={salesPage} totalPages={salesTotalPages} onPageChange={setSalesPage} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="-mx-4 -mb-6 flex min-h-[calc(100vh-4rem)] flex-col bg-[#F3F4F6] px-4 pb-0 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="flex-1 space-y-4 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="mt-1 h-9 w-9 shrink-0"
              onClick={() => {
                setEditingSale(null);
                clearCart();
                setMode("list");
              }}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-[#2563EB]">
                {editingSale ? `Edit ${editingSale.posNumber}` : "Create New POS"}
              </h1>
            </div>
          </div>
          {editingSale && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="destructive" size="icon" className="shrink-0" title="Delete">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this POS sale?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete <strong>{editingSale.posNumber}</strong>. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-red-600 hover:bg-red-700"
                    onClick={deleteEditingSale}
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(340px,1fr)]">
          {/* Catalog */}
          <div className="flex min-h-[560px] flex-col rounded-xl border border-[#E5E7EB] bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5E7EB] p-4">
              <div className="flex flex-wrap gap-1.5">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                      tab === t.id
                        ? "bg-[#2563EB] text-white shadow-sm"
                        : "bg-transparent text-[#4B5563] hover:bg-[#F3F4F6]",
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="relative min-w-[180px] flex-1 sm:max-w-xs sm:flex-none">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9CA3AF]" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search items..."
                  className="h-8 pl-8 text-sm"
                />
              </div>
            </div>

            <div className="flex-1 p-4">
              {isLoading ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} className="h-24 animate-pulse rounded-lg bg-[#F3F4F6]" />
                  ))}
                </div>
              ) : pageRows.length === 0 ? (
                <div className="flex h-48 flex-col items-center justify-center text-sm text-[#6B7280]">
                  <PackageEmpty />
                  <p className="mt-2">No stock items found. Add products in Stock Items.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {pageRows.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => addToCart(p)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setFavourites((prev) => {
                          const next = prev.includes(p.id)
                            ? prev.filter((x) => x !== p.id)
                            : [...prev, p.id];
                          try {
                            localStorage.setItem("pos-favourites", JSON.stringify(next));
                          } catch {
                            // ignore
                          }
                          return next;
                        });
                      }}
                      className="rounded-lg border border-[#E5E7EB] bg-white p-3 text-left transition hover:border-[#93C5FD] hover:shadow-sm"
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#2563EB]">
                        {p.code}
                      </p>
                      <p className="mt-1 line-clamp-2 text-sm font-medium text-[#111827]">{p.name}</p>
                      <p className="mt-2 text-sm font-bold text-[#111827]">{money(p.unitPrice)}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3 border-t border-[#E5E7EB] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-[#6B7280]">
                Showing {showingFrom} to {showingTo} of {filtered.length} items
              </p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-md border border-[#E5E7EB] p-1.5 text-[#6B7280] disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {pageNumbers.map((n, idx) =>
                  n === "…" ? (
                    <span key={`e-${idx}`} className="px-1 text-xs text-[#9CA3AF]">
                      …
                    </span>
                  ) : (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setPage(n)}
                      className={cn(
                        "min-w-8 rounded-md px-2 py-1 text-xs font-medium",
                        n === currentPage
                          ? "bg-[#2563EB] text-white"
                          : "border border-[#E5E7EB] text-[#4B5563] hover:bg-[#F9FAFB]",
                      )}
                    >
                      {n}
                    </button>
                  ),
                )}
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="rounded-md border border-[#E5E7EB] p-1.5 text-[#6B7280] disabled:opacity-40"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Current Sale */}
          <div className="flex min-h-[560px] flex-col rounded-xl border border-[#E5E7EB] bg-white shadow-sm">
            <div className="flex items-center justify-between gap-2 border-b border-[#E5E7EB] px-4 py-3">
              <h2 className="text-base font-semibold text-[#111827]">Current Sale</h2>
            </div>

            <div className="grid grid-cols-[1fr_minmax(96px,auto)_64px_64px_28px] gap-2 border-b border-[#E5E7EB] px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-[#9CA3AF]">
              <span>Item</span>
              <span className="text-center">Qty</span>
              <span className="text-right">Price</span>
              <span className="text-right">Total</span>
              <span />
            </div>

            <div className="min-h-[160px] flex-1 overflow-y-auto px-2 py-1">
              {cart.length === 0 ? (
                <div className="flex h-40 flex-col items-center justify-center text-sm text-[#9CA3AF]">
                  <ShoppingCart className="mb-2 h-8 w-8 opacity-40" />
                  Tap an item to add it here
                </div>
              ) : (
                cart.map((line) => (
                  <div
                    key={line.id}
                    className="grid grid-cols-[1fr_minmax(96px,auto)_64px_64px_28px] items-center gap-2 rounded-md px-2 py-2 hover:bg-[#F9FAFB]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-[#111827]">
                        {line.code} / {line.name}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center justify-center gap-0.5">
                      <button
                        type="button"
                        className="shrink-0 rounded border border-[#E5E7EB] p-0.5 text-[#6B7280] hover:bg-white"
                        onClick={() => updateQty(line.id, line.qty - 1, true)}
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <input
                        className="h-7 w-11 min-w-[2.75rem] shrink-0 rounded border border-[#E5E7EB] px-1 text-center text-xs [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        value={line.qty > 0 ? line.qty : ""}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === "") {
                            updateQty(line.id, 0);
                            return;
                          }
                          const n = parseInt(raw, 10);
                          if (!Number.isNaN(n)) updateQty(line.id, n);
                        }}
                        onBlur={() => {
                          setCart((prev) =>
                            prev.map((l) => (l.id === line.id && l.qty <= 0 ? { ...l, qty: 1 } : l)),
                          );
                        }}
                      />
                      <button
                        type="button"
                        className="shrink-0 rounded border border-[#E5E7EB] p-0.5 text-[#6B7280] hover:bg-white"
                        onClick={() => updateQty(line.id, line.qty + 1)}
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      className="h-7 w-full rounded border border-[#E5E7EB] px-1 text-right text-xs"
                      value={line.unitPrice > 0 ? line.unitPrice : ""}
                      placeholder=""
                      onChange={(e) => {
                        const raw = e.target.value;
                        updateUnitPrice(line.id, raw === "" ? 0 : parseFloat(raw) || 0);
                      }}
                    />
                    <p className="text-right text-xs font-semibold text-[#111827]">
                      {money(line.unitPrice * line.qty)}
                    </p>
                    <button
                      type="button"
                      className="justify-self-end text-[#EF4444] hover:text-[#DC2626]"
                      onClick={() => removeLine(line.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="space-y-2.5 border-t border-[#E5E7EB] px-4 py-3 text-sm overflow-hidden">
              <div className="flex items-center justify-between gap-2 text-[#4B5563]">
                <span className="shrink-0">Sales Person</span>
                <Select value={salesPerson} onValueChange={setSalesPerson}>
                  <SelectTrigger className="h-8 flex-1 max-w-[180px] text-sm bg-white border-gray-200">
                    <SelectValue placeholder="Select Sales Person" />
                  </SelectTrigger>
                  <SelectContent>
                    {salesPersons.map((sp) => (
                      <SelectItem key={sp.id} value={sp.name}>
                        {sp.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-between text-[#4B5563]">
                <span>Subtotal</span>
                <span className="font-medium text-[#111827]">{money(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between gap-1.5 min-w-0">
                <span className="shrink-0 text-[#4B5563]">Discount</span>
                <div className="flex items-center gap-1.5 min-w-0 flex-1 justify-end">
                  <Select value={discountType} onValueChange={setDiscountType}>
                    <SelectTrigger className="h-8 w-[105px] text-xs px-2 truncate">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Manual</SelectItem>
                      <SelectItem value="percent">Percent %</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={discount || ""}
                    onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                    className="h-8 w-16 text-xs px-1 text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none shrink-0"
                    placeholder="0.00"
                  />
                  <span className="shrink-0 text-xs font-medium text-[#16A34A] text-right truncate">
                    – {money(discountAmt)}
                  </span>
                </div>
              </div>
              <div className="flex justify-between text-[#4B5563]">
                <span>Taxable Amount</span>
                <span className="font-medium text-[#111827]">{money(taxable)}</span>
              </div>
              <div className="flex justify-between text-[#4B5563]">
                <span>GST {gstRate}%</span>
                <span className="font-medium text-[#111827]">{money(gstAmt)}</span>
              </div>
              <div className="flex items-end justify-between border-t border-[#E5E7EB] pt-2">
                <span className="text-base font-semibold text-[#111827]">Total Amount</span>
                <span className="text-2xl font-bold text-[#2563EB]">{money(total)}</span>
              </div>
              {alreadyPaidTotal > 0 && (
                <>
                  <div className="flex justify-between text-[#4B5563]">
                    <span>Already Paid</span>
                    <span className="font-medium text-[#16A34A]">{money(alreadyPaidTotal)}</span>
                  </div>
                  <div className="space-y-1 rounded-md border border-emerald-100 bg-emerald-50/50 px-2 py-1.5 text-xs text-[#6B7280]">
                    {PAYMENT_METHODS.map(({ label, method }) => {
                      const amt = tenderTotalByMethod(alreadyPaidTenders, method);
                      if (amt <= 0) return null;
                      return (
                        <div key={method} className="flex justify-between text-[#16A34A]">
                          <span>{label}</span>
                          <span className="font-medium">{money(amt)}</span>
                        </div>
                      );
                    })}
                  </div>
                  {sessionPaid > 0 && (
                    <div className="space-y-1 rounded-md border border-[#E5E7EB] bg-[#F9FAFB] px-2 py-1.5 text-xs text-[#6B7280]">
                      <p className="font-medium text-[#2563EB]">New Payment</p>
                      {PAYMENT_METHODS.map(({ label, method }) => {
                        const amt = tenderTotalByMethod(tenders, method);
                        if (amt <= 0) return null;
                        return (
                          <div key={method} className="flex justify-between text-[#2563EB]">
                            <span>{label}</span>
                            <span className="font-medium">{money(amt)}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="flex justify-between font-semibold text-[#111827]">
                    <span>Balance Due</span>
                    <span className="text-[#DC2626]">{money(balanceDue)}</span>
                  </div>
                </>
              )}
            </div>

            <div className="px-4 py-3">
              {editingSale ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 w-full gap-2 text-base font-semibold"
                  onClick={saveEditingSale}
                >
                  Save Changes
                </Button>
              ) : (
                <Button
                  type="button"
                  className="h-12 w-full gap-2 bg-[#2563EB] text-base font-semibold hover:bg-[#1D4ED8]"
                  onClick={completeSale}
                >
                  Pay {money(balanceDue > 0 && balanceDue < total ? balanceDue : total)} <ArrowRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Payment</DialogTitle>
            <DialogDescription>
              Choose a payment method and enter the amount.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {(() => {
              const { thisPayApplied, displayedPaid, remainingAfter, cashChange } =
                paymentDisplayTotals();

              return (
            <div className="rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] px-4 py-3 space-y-2.5 text-sm">
              <div className="flex justify-between">
                <span className="text-[#4B5563]">Total Amount</span>
                <span className="font-semibold text-[#111827]">{money(total)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#4B5563]">Paid Payment</span>
                <span className="font-semibold text-[#16A34A]">{money(displayedPaid)}</span>
              </div>
              <div className="space-y-1 rounded-md border border-[#E5E7EB] bg-white px-2.5 py-2 text-xs text-[#6B7280]">
                {PAYMENT_METHODS.map(({ label, method }) => {
                  const amt = amountForMethod(method, thisPayApplied);
                  const isActive = method === payMethod && thisPayApplied > 0;
                  const isPending = (pendingPayByMethod[method] || 0) > 0;
                  return (
                    <div
                      key={method}
                      className={cn(
                        "flex justify-between",
                        (isActive || isPending) && "font-medium text-[#2563EB]",
                        amt > 0 && !isActive && !isPending && "text-[#16A34A]",
                      )}
                    >
                      <span>{label}</span>
                      <span>{amt > 0 ? money(amt) : "—"}</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between border-t border-[#E5E7EB] pt-2">
                <span className="font-semibold text-[#111827]">
                  {cashChange > 0 ? "Change" : "Remaining"}
                </span>
                <span className="text-lg font-bold text-[#DC2626]">
                  {money(cashChange > 0 ? cashChange : remainingAfter)}
                </span>
              </div>
            </div>
              );
            })()}

            <div className="space-y-2">
              <Label>Payment Method</Label>
              <div className="grid grid-cols-4 gap-2">
                {STANDARD_PAYMENT_METHODS.map((q) => {
                  const creditCardActive = payMethod === "Credit Card";
                  return (
                    <button
                      key={q.method}
                      type="button"
                      disabled={creditCardActive}
                      onClick={() => switchToPayMethod(q.method)}
                      className={cn(
                        "flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-center transition-colors",
                        creditCardActive
                          ? "cursor-not-allowed border-[#E5E7EB] bg-[#F3F4F6] opacity-50"
                          : payMethod === q.method
                            ? "border-[#2563EB] bg-[#EFF6FF] ring-1 ring-[#2563EB]"
                            : "border-[#E5E7EB] hover:border-[#93C5FD] hover:bg-[#EFF6FF]",
                      )}
                    >
                      <q.icon
                        className={cn(
                          "h-4 w-4",
                          creditCardActive
                            ? "text-[#9CA3AF]"
                            : payMethod === q.method
                              ? "text-[#2563EB]"
                              : "text-[#6B7280]",
                        )}
                      />
                      <span className="text-[10px] font-medium leading-tight text-[#374151]">{q.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {balanceDue > 0.001 || pendingPayByMethodHasValue() ? (
            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={() => {
                  if (payMethod === "Credit Card") {
                    switchToPayMethod("Cash");
                    return;
                  }
                  switchToPayMethod("Credit Card");
                }}
                className={cn(
                  "flex shrink-0 flex-col items-center gap-1 rounded-lg border px-3 py-2 text-center transition-colors min-w-[88px]",
                  payMethod === "Credit Card"
                    ? "border-[#2563EB] bg-[#EFF6FF] ring-1 ring-[#2563EB]"
                    : "border-[#E5E7EB] hover:border-[#93C5FD] hover:bg-[#EFF6FF]",
                )}
              >
                <CreditCard
                  className={cn(
                    "h-4 w-4",
                    payMethod === "Credit Card" ? "text-[#2563EB]" : "text-[#6B7280]",
                  )}
                />
                <span className="text-[10px] font-medium leading-tight text-[#374151]">Credit Card</span>
              </button>
              <div className="min-w-0 flex-1 space-y-2">
                <Label htmlFor="pay-amount">
                  {payMethod === "Cash" ? "Cash Received" : "Amount"}
                  <span className="ml-2 font-normal text-[#6B7280]">
                    (remaining {money(paymentDisplayTotals().remainingAfter)})
                  </span>
                </Label>
                <Input
                  id="pay-amount"
                  type="number"
                  min={0}
                  step="0.01"
                  autoFocus
                  value={payAmount || ""}
                  onChange={(e) => setPayAmount(parseFloat(e.target.value) || 0)}
                  className="h-11 text-base [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  placeholder="0.00"
                />
              </div>
            </div>
            ) : alreadyPaidTotal > 0 ? (
              <p className="rounded-md border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-sm text-emerald-700">
                All amounts already paid. Click <strong>Complete Payment</strong> to save and view receipt.
              </p>
            ) : null}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setPayOpen(false)}>
              {paidSoFar > 0 ? "Close" : "Cancel"}
            </Button>
            <Button type="button" className="bg-[#2563EB] hover:bg-[#1D4ED8]" onClick={savePayment}>
              {(() => {
                const { remainingAfter } = stagedPaymentTotals();
                return remainingAfter <= 0.001 ? "Complete Payment" : "Add Payment";
              })()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {previewSale && (
        <PdfPreviewModal
          open={previewOpen}
          onOpenChange={(open) => {
            setPreviewOpen(open);
            if (!open) {
              setPreviewSale(null);
              setMode("list");
            }
          }}
          title={`POS Receipt ${previewSale.posNumber}`}
          generatePdf={(opts) => generatePOS_PDF(previewSale, selectedCompany as any, opts)}
          pdfFilename={`${previewSale.posNumber}.pdf`}
          defaultEmailSubject={`POS Receipt ${previewSale.posNumber}`}
          defaultEmailBody={`Please find attached POS receipt ${previewSale.posNumber}.`}
          onEdit={() => {
            loadSaleForEdit(previewSale);
            setPreviewOpen(false);
            setPreviewSale(null);
          }}
        />
      )}
    </div>
  );
}

function PackageEmpty() {
  return <ShoppingBag className="h-10 w-10 opacity-30" />;
}
