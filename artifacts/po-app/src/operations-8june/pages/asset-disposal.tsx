import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Asset } from "@shared/schema";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/operations-8june/components/ui/date-picker";
import {
  Package, TrendingDown, TrendingUp, X, Loader2,
  Pencil, List, Save, Calculator, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ManagementPageHeader } from "@/operations-8june/components/layout/ManagementPageUI";
import { resolveAssetImageSrc } from "@/operations-8june/lib/asset-attachments";
import {
  buildDepreciationSchedule,
  calcAssetBookValues,
  formatAssetRegisterId,
  formatSgd,
} from "@/operations-8june/lib/asset-depreciation";
import { apiRequest, parseApiResponse } from "@/operations-8june/lib/queryClient";

const DISPOSAL_TYPES = [
  { value: "sale", label: "Sale" },
  { value: "scrap", label: "Scrap" },
  { value: "write_off", label: "Write-off" },
  { value: "donation", label: "Donation" },
] as const;

function money(n: number) {
  const abs = Math.abs(n);
  const formatted = new Intl.NumberFormat("en-SG", {
    minimumFractionDigits: Number.isInteger(abs) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(abs);
  return `S$ ${formatted}`;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function todayDate() {
  return new Date();
}

function toIsoDate(d: Date | undefined) {
  if (!d || Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function AssetDisposalPage() {
  const search = useSearch();
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const initialId = Number(params.get("assetId") || "") || null;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { selectedCompany, isLoading: authLoading } = useAuth();

  const [assetId, setAssetId] = useState<number | null>(initialId);
  const [disposalDate, setDisposalDate] = useState<Date | undefined>(todayDate);
  const [disposalType, setDisposalType] = useState("sale");
  const [saleAmount, setSaleAmount] = useState("");
  const [remarks, setRemarks] = useState("");
  const [saleEdited, setSaleEdited] = useState(false);

  const { data: assets = [], isLoading } = useQuery<Asset[]>({
    queryKey: ["/api/assets"],
    enabled: !authLoading && !!selectedCompany,
  });

  const activeAssets = useMemo(() => {
    const list = Array.isArray(assets) ? assets : [];
    return list.filter((a) => {
      const s = String(a.status || "").toLowerCase();
      return s !== "retired" && s !== "disposed";
    });
  }, [assets]);

  const selected = useMemo(() => {
    if (assetId != null) {
      return activeAssets.find((a) => a.id === assetId) || activeAssets[0] || null;
    }
    return activeAssets[0] || null;
  }, [activeAssets, assetId]);

  const asOf = disposalDate && !Number.isNaN(disposalDate.getTime()) ? disposalDate : new Date();

  const books = useMemo(
    () => (selected ? calcAssetBookValues(selected, asOf) : null),
    [selected, asOf],
  );

  useEffect(() => {
    if (!books || saleEdited) return;
    setSaleAmount(books.nbv > 0 ? books.nbv.toFixed(2) : "");
  }, [books, selected?.id, saleEdited]);

  const schedule = useMemo(
    () => (selected ? buildDepreciationSchedule(selected, asOf) : []),
    [selected, asOf],
  );

  const yearHistory = useMemo(() => {
    const byYear = new Map<number, { depreciation: number; bookValue: number }>();
    for (const row of schedule) {
      const prev = byYear.get(row.year) || { depreciation: 0, bookValue: 0 };
      prev.depreciation = round2(prev.depreciation + row.depreciation);
      prev.bookValue = row.closingNbv;
      byYear.set(row.year, prev);
    }
    return Array.from(byYear.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([year, v], idx) => ({
        label: `Year ${idx + 1}`,
        year,
        depreciation: v.depreciation,
        bookValue: round2(v.bookValue + (books?.residual || 0)),
      }));
  }, [schedule, books?.residual]);

  const sale = Math.max(0, parseFloat(saleAmount) || 0);
  const cost = books?.cost || 0;
  const accDep = books?.accDep || 0;
  const nbv = books?.nbv || 0;
  const gainLoss = round2(sale - nbv);
  const isGain = gainLoss >= 0;
  const gainLossAbs = Math.abs(gainLoss);

  const journalLines = useMemo(() => {
    const lines: { account: string; debit: number; credit: number }[] = [];
    if (sale > 0) lines.push({ account: "Bank", debit: sale, credit: 0 });
    if (accDep > 0) lines.push({ account: "Accumulated Depreciation", debit: accDep, credit: 0 });
    if (!isGain && gainLossAbs > 0) {
      lines.push({ account: "Loss on Disposal", debit: gainLossAbs, credit: 0 });
    }
    if (isGain && gainLossAbs > 0) {
      lines.push({ account: "Gain on Disposal", debit: 0, credit: gainLossAbs });
    }
    const assetLabel = selected
      ? `Fixed Asset – ${selected.type || "Asset"}`
      : "Fixed Asset";
    if (cost > 0) lines.push({ account: assetLabel, debit: 0, credit: cost });
    return lines;
  }, [sale, accDep, isGain, gainLossAbs, cost, selected]);

  const journalTotals = useMemo(() => {
    return journalLines.reduce(
      (acc, l) => ({ debit: round2(acc.debit + l.debit), credit: round2(acc.credit + l.credit) }),
      { debit: 0, credit: 0 },
    );
  }, [journalLines]);

  const usefulLifeLabel = useMemo(() => {
    if (!selected) return "—";
    const life = Number(selected.usefulLifeYears) || 0;
    const unit = String((selected as any).usefulLifeUnit || "Years");
    if (!life) return "—";
    return `${life} ${unit}`;
  }, [selected]);

  const methodLabel = useMemo(() => {
    const m = String(selected?.depreciationMethod || "Straight Line");
    return m.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }, [selected?.depreciationMethod]);

  const imageSrc = selected
    ? resolveAssetImageSrc(selected.id, (selected as any).assetImage ?? (selected as any).asset_image)
    : "";

  const postMutation = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Select an asset to dispose.");
      if (!disposalDate || Number.isNaN(disposalDate.getTime())) {
        throw new Error("Disposal date is required.");
      }
      if (!disposalType) throw new Error("Disposal type is required.");
      if (disposalType === "sale" && sale <= 0) throw new Error("Sale amount is required for a sale.");

      const purchaseRaw = selected.purchaseDate || (selected as any).purchase_date;
      const startRaw =
        selected.depreciationStartDate || (selected as any).depreciation_start_date;
      const disposalIso = toIsoDate(disposalDate);
      const disposalTs = new Date(`${disposalIso}T00:00:00`).getTime();

      for (const check of [
        { label: "Purchase Date", value: purchaseRaw },
        { label: "Available-for-use Date", value: startRaw },
      ]) {
        if (!check.value) continue;
        const baseIso = String(check.value).slice(0, 10);
        const baseTs = new Date(`${baseIso}T00:00:00`).getTime();
        if (!Number.isNaN(baseTs) && disposalTs <= baseTs) {
          throw new Error(`Disposal Date must be after the ${check.label} (${baseIso}).`);
        }
      }
      if (!purchaseRaw && !startRaw) {
        throw new Error(
          "Asset is missing Purchase Date / Available-for-use Date. Update the asset before disposing.",
        );
      }

      const res = await apiRequest("POST", `/api/assets/${selected.id}/dispose`, {
        disposalDate: disposalIso,
        disposalType,
        saleAmount: sale,
        remarks: remarks.trim() || undefined,
      });
      const json = await res.json();
      return parseApiResponse(json);
    },
    onSuccess: () => {
      toast({
        title: "Disposal saved",
        description:
          `${selected?.type || "Asset"} status set to Disposed. Balance Sheet updated; depreciation stopped from next period.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      queryClient.invalidateQueries({ queryKey: ["journal-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/journal-entries"] });
      queryClient.invalidateQueries({ queryKey: ["balance-sheet"] });
      queryClient.invalidateQueries({ queryKey: ["/api/balance-sheet"] });
      setSaleAmount("");
      setRemarks("");
      setSaleEdited(false);
      setAssetId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Disposal failed", description: err.message, variant: "destructive" });
    },
  });

  function selectAsset(v: string) {
    setAssetId(Number(v));
    setSaleEdited(false);
    setLocation(`/assets/disposal?assetId=${v}`);
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-300 pb-16 bg-[#F8FAFC] -mx-1 px-1 rounded-lg">
      <ManagementPageHeader
        title="Fixed Asset Disposal"
        action={
          <Select
            value={selected ? String(selected.id) : undefined}
            onValueChange={selectAsset}
          >
            <SelectTrigger className="h-9 w-full sm:w-[320px] border-[#E2E8F0] bg-white text-[#334155] shadow-sm">
              <SelectValue placeholder={isLoading ? "Loading..." : "Select asset to dispose"} />
            </SelectTrigger>
            <SelectContent>
              {activeAssets.map((a) => (
                <SelectItem key={a.id} value={String(a.id)}>
                  {a.type} – {formatAssetRegisterId(a)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {/* Asset Details — exact 5-column card */}
      <section className="overflow-hidden rounded-[10px] border border-[#BFDBFE] bg-white shadow-sm">
        <div className="flex items-center gap-2 bg-[#E8F1FF] px-4 py-2.5 border-b border-[#BFDBFE]">
          <Package className="h-4 w-4 text-[#1E3A8A]" />
          <h2 className="text-sm font-bold text-[#1E3A8A]">Asset Details</h2>
        </div>

        {!selected ? (
          <div className="px-5 py-8 text-sm text-[#94A3B8] text-center">
            Select an asset from the dropdown above to dispose.
          </div>
        ) : (
          <div className="grid grid-cols-1 divide-y divide-[#E5E7EB] lg:grid-cols-[1.4fr_repeat(4,minmax(0,1fr))] lg:divide-y-0 lg:divide-x">
            {/* Col 1 — identity */}
            <div className="flex items-center gap-3.5 px-5 py-4 min-w-0">
              {imageSrc ? (
                <img
                  src={imageSrc}
                  alt={selected.type}
                  className="h-14 w-14 rounded-md border border-[#E5E7EB] object-cover shrink-0"
                />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-md border border-[#DBEAFE] bg-[#EFF6FF] shrink-0">
                  <Package className="h-6 w-6 text-[#2563EB]" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[16px] font-bold text-[#0F172A] truncate">
                  {selected.type} – {formatAssetRegisterId(selected)}
                </p>
                <p className="mt-0.5 text-xs text-[#64748B] truncate">{selected.category || "—"}</p>
                <div className="mt-1.5">
                  <span className="inline-flex items-center rounded-full bg-[#EAF8EF] px-2.5 py-0.5 text-[11px] font-semibold text-[#1E8E3E] whitespace-nowrap">
                    Active Asset
                  </span>
                </div>
              </div>
            </div>

            {/* Cols 2–5 — metrics */}
            {[
              { label: "Purchase Cost", value: money(cost) },
              { label: "Useful Life", value: usefulLifeLabel },
              { label: "Residual Value", value: money(books?.residual || 0) },
              { label: "Depreciation Method", value: methodLabel },
            ].map((item) => (
              <div key={item.label} className="flex flex-col justify-center px-6 py-4">
                <p className="text-[13px] text-[#64748B] leading-none">{item.label}</p>
                <p className="mt-2 text-[16px] font-bold text-[#0F172A] leading-none">{item.value}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Main 2-column layout */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* Left Column: Disposal Information */}
        <div className="space-y-4">
          {/* Disposal Information Card */}
          <section className="overflow-hidden rounded-lg border border-[#DCE7F6] bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b border-[#DCE7F6] bg-[#EEF4FF] px-4 py-2.5">
              <Pencil className="h-4 w-4 text-[#2563EB]" />
              <h2 className="text-sm font-bold text-[#1E40AF]">Disposal Information</h2>
            </div>
            <div className="p-4 space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-[#334155]">
                    Disposal Date <span className="text-[#EF4444]">*</span>
                  </Label>
                  <DatePicker
                    date={disposalDate}
                    setDate={(d) => setDisposalDate(d || undefined)}
                    className="bg-white border-[#D1D5DB]"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-[#334155]">
                    Disposal Type <span className="text-[#EF4444]">*</span>
                  </Label>
                  <Select value={disposalType} onValueChange={setDisposalType}>
                    <SelectTrigger className="bg-white border-[#D1D5DB]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DISPOSAL_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-[#334155]">
                    Sale Amount (S$) {disposalType === "sale" && <span className="text-[#EF4444]">*</span>}
                  </Label>
                  <Input
                    inputMode="decimal"
                    className="bg-white border-[#D1D5DB]"
                    value={saleAmount}
                    onChange={(e) => {
                      setSaleEdited(true);
                      setSaleAmount(e.target.value.replace(/[^0-9.]/g, ""));
                    }}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-[#334155]">
                    Remarks <span className="text-[#94A3B8] font-normal">(Optional)</span>
                  </Label>
                  <Input
                    className="bg-white border-[#D1D5DB]"
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder="e.g. Sold to ABC Trading Co."
                  />
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Right Column: Journal Entries Preview */}
        <div className="space-y-4">
          <section className="overflow-hidden rounded-lg border border-[#DCE7F6] bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b border-[#DCE7F6] bg-[#EEF4FF] px-4 py-2.5">
              <List className="h-4 w-4 text-[#2563EB]" />
              <h2 className="text-sm font-bold text-[#1E40AF]">Journal Entries Preview</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#E5E7EB] bg-white">
                    <th className="px-4 py-3 text-left font-bold text-[#0F172A]">Account</th>
                    <th className="px-4 py-3 text-right font-bold text-[#0F172A]">Debit (S$)</th>
                    <th className="px-4 py-3 text-right font-bold text-[#0F172A]">Credit (S$)</th>
                  </tr>
                </thead>
                <tbody>
                  {journalLines.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-10 text-center text-[#94A3B8]">
                        Select an asset to preview journal entries.
                      </td>
                    </tr>
                  ) : (
                    journalLines.map((line) => (
                      <tr key={line.account} className="border-b border-[#F1F5F9]">
                        <td className="px-4 py-2.5 font-medium text-[#0F172A]">{line.account}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-[#0F172A]">
                          {line.debit > 0 ? formatSgd(line.debit).replace(/\.00$/, "") : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-[#0F172A]">
                          {line.credit > 0 ? formatSgd(line.credit).replace(/\.00$/, "") : "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {journalLines.length > 0 && (
                  <tfoot>
                    <tr className="border-t border-[#E2E8F0] bg-white font-bold">
                      <td className="px-4 py-2.5 font-bold text-[#0F172A]">Total</td>
                      <td className="px-4 py-2.5 text-right font-bold tabular-nums text-[#0F172A]">
                        {formatSgd(journalTotals.debit).replace(/\.00$/, "")}
                      </td>
                      <td className="px-4 py-2.5 text-right font-bold tabular-nums text-[#0F172A]">
                        {formatSgd(journalTotals.credit).replace(/\.00$/, "")}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </section>
        </div>
      </div>

      {/* Calculation Summary + Depreciation History — side by side */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 mt-4">
        <section className="overflow-hidden rounded-lg border border-[#DCE7F6] bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-[#DCE7F6] bg-[#EEF4FF] px-4 py-2.5">
            <Calculator className="h-4 w-4 text-[#2563EB]" />
            <h2 className="text-sm font-bold text-[#1E40AF]">Calculation Summary</h2>
          </div>
          <div className="p-4 space-y-2.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[#475569]">Accumulated Depreciation (till date)</span>
              <span className="font-bold tabular-nums text-[#0F172A]">{money(accDep)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-[#475569]">Net Book Value</span>
              <span className="font-bold tabular-nums text-[#0F172A]">{money(nbv)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-[#475569]">Sale Amount</span>
              <span className="font-bold tabular-nums text-[#0F172A]">{money(sale)}</span>
            </div>

            <div
              className={cn(
                "flex items-center justify-between rounded-md px-3.5 py-2.5 mt-2",
                gainLoss < 0
                  ? "bg-[#FEE2E2] text-[#DC2626]"
                  : gainLoss > 0
                  ? "bg-[#DCFCE7] text-[#16A34A]"
                  : "bg-[#F1F5F9] text-[#475569]"
              )}
            >
              <div className="flex items-center gap-2">
                {gainLoss < 0 ? (
                  <TrendingDown className="h-4 w-4 text-[#DC2626]" />
                ) : gainLoss > 0 ? (
                  <TrendingUp className="h-4 w-4 text-[#16A34A]" />
                ) : null}
                <span className="text-sm font-bold">
                  {gainLoss < 0 ? "Loss on Disposal" : gainLoss > 0 ? "Gain on Disposal" : "Break Even"}
                </span>
              </div>
              <span className="text-sm font-bold tabular-nums">
                {money(gainLossAbs)}
              </span>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-[#DCE7F6] bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-[#DCE7F6] bg-[#EEF4FF] px-4 py-2.5">
            <Clock className="h-4 w-4 text-[#2563EB]" />
            <h2 className="text-sm font-bold text-[#0F172A]">Depreciation History (for reference)</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E5E7EB] bg-[#F8FAFC]">
                  <th className="px-4 py-2 text-left font-semibold text-[#475569]">Year</th>
                  <th className="px-4 py-2 text-right font-semibold text-[#475569]">Depreciation</th>
                  <th className="px-4 py-2 text-right font-semibold text-[#475569]">Book Value</th>
                </tr>
              </thead>
              <tbody>
                {yearHistory.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-[#94A3B8]">
                      No depreciation history yet.
                    </td>
                  </tr>
                ) : (
                  yearHistory.map((row) => (
                    <tr key={row.year} className="border-b border-[#F1F5F9]">
                      <td className="px-4 py-2.5 font-medium text-[#0F172A]">{row.label}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{money(row.depreciation)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{money(row.bookValue)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Save / Cancel — bottom right */}
      <div className="flex items-center justify-end gap-3 pt-4 pb-2">
        <Button
          type="button"
          variant="outline"
          className="h-10 gap-2 border-[#D1D5DB] bg-white text-[#334155] hover:bg-[#F8FAFC] font-medium px-5 rounded-lg shadow-sm"
          onClick={() => setLocation("/assets/register")}
        >
          <X className="h-4 w-4" />
          Cancel
        </Button>
        <Button
          type="button"
          className="h-10 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-medium px-5 rounded-lg gap-2 shadow-sm"
          disabled={!selected || postMutation.isPending}
          onClick={() => postMutation.mutate()}
        >
          {postMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Save
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
