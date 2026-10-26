import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import type { Asset } from "@shared/schema";
import { useAuth } from "@/contexts/auth-context";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ManagementEmptyState,
  ManagementPageHeader,
  ManagementTableCard,
  ManagementTableContainer,
} from "@/operations-8june/components/layout/ManagementPageUI";
import {
  buildDepreciationSchedule,
  formatAssetRegisterId,
  formatSgd,
} from "@/operations-8june/lib/asset-depreciation";

export default function AssetDepreciationPage() {
  const search = useSearch();
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const initialId = Number(params.get("assetId") || "") || null;
  const initialYear = Number(params.get("year") || "") || null;
  const [, setLocation] = useLocation();
  const { selectedCompany, isLoading: authLoading } = useAuth();
  const [assetId, setAssetId] = useState<number | null>(initialId);
  const [year, setYear] = useState<number | "all">(initialYear || "all");

  const { data: assets = [], isLoading } = useQuery<Asset[]>({
    queryKey: ["/api/assets"],
    enabled: !authLoading && !!selectedCompany,
  });

  const list = Array.isArray(assets) ? assets : [];
  const selected = list.find((a) => a.id === assetId) || list[0] || null;

  const schedule = useMemo(
    () => (selected ? buildDepreciationSchedule(selected) : []),
    [selected],
  );

  const yearOptions = useMemo(() => {
    const years = Array.from(new Set(schedule.map((r) => r.year))).sort((a, b) => a - b);
    return years;
  }, [schedule]);

  // When asset/schedule changes, keep year valid (or default to first year / all).
  useEffect(() => {
    if (year === "all") return;
    if (yearOptions.length === 0) {
      setYear("all");
      return;
    }
    if (!yearOptions.includes(year)) {
      setYear(yearOptions[0]);
    }
  }, [year, yearOptions]);

  const filtered = useMemo(() => {
    if (year === "all") return schedule;
    return schedule.filter((r) => r.year === year);
  }, [schedule, year]);

  function updateUrl(nextAssetId: number, nextYear: number | "all") {
    const qs = new URLSearchParams();
    qs.set("assetId", String(nextAssetId));
    if (nextYear !== "all") qs.set("year", String(nextYear));
    setLocation(`/assets/depreciation?${qs.toString()}`);
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <ManagementPageHeader title="Depreciation Schedule" />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="space-y-1.5 min-w-[260px]">
            <label className="text-sm font-medium text-[#1E3A8A]">Asset</label>
            <Select
              value={selected ? String(selected.id) : undefined}
              onValueChange={(v) => {
                const id = Number(v);
                setAssetId(id);
                setYear("all");
                updateUrl(id, "all");
              }}
            >
              <SelectTrigger className="w-full max-w-md bg-white">
                <SelectValue placeholder={isLoading ? "Loading..." : "Select asset"} />
              </SelectTrigger>
              <SelectContent>
                {list.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {a.type} ({formatAssetRegisterId(a)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 min-w-[140px]">
            <label className="text-sm font-medium text-[#1E3A8A]">Year</label>
            <Select
              value={year === "all" ? "all" : String(year)}
              onValueChange={(v) => {
                const next = v === "all" ? "all" : Number(v);
                setYear(next);
                if (selected) updateUrl(selected.id, next);
              }}
              disabled={!selected || schedule.length === 0}
            >
              <SelectTrigger className="w-full bg-white">
                <SelectValue placeholder="Select year" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Years</SelectItem>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {selected && (
          <p className="text-sm text-[#4B5563]">
            <span className="font-semibold text-[#1E3A8A]">
              {selected.type} ({formatAssetRegisterId(selected)})
            </span>
            {selected.depreciationMethod
              ? ` · ${String(selected.depreciationMethod).replace(/\b\w/g, (c) => c.toUpperCase())}`
              : ""}
            {selected.usefulLifeYears ? ` · ${selected.usefulLifeYears} yr` : ""}
          </p>
        )}
      </div>

      <ManagementTableCard>
        <ManagementTableContainer>
          {!selected ? (
            <ManagementEmptyState
              title="No asset selected"
              description="Choose an asset to view its depreciation schedule."
            />
          ) : schedule.length === 0 ? (
            <ManagementEmptyState
              title="Schedule unavailable"
              description="Set Cost, Useful Life, and Depreciation Start Date on the asset to generate the schedule."
            />
          ) : filtered.length === 0 ? (
            <ManagementEmptyState
              title="No periods for this year"
              description="Select another year, or choose All Years."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-[#DBEAFE] hover:bg-[#DBEAFE]">
                  <TableHead className="text-[#1E3A8A] font-semibold">Period</TableHead>
                  <TableHead className="text-[#1E3A8A] font-semibold text-right">Opening NBV (S$)</TableHead>
                  <TableHead className="text-[#1E3A8A] font-semibold text-right">Depreciation (S$)</TableHead>
                  <TableHead className="text-[#1E3A8A] font-semibold text-right">Closing NBV (S$)</TableHead>
                  <TableHead className="text-[#1E3A8A] font-semibold">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => (
                  <TableRow key={row.periodKey} className="even:bg-[#F9FAFB]">
                    <TableCell className="font-medium text-[#111827]">{row.periodLabel}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatSgd(row.openingNbv)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatSgd(row.depreciation)}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{formatSgd(row.closingNbv)}</TableCell>
                    <TableCell>
                      {row.status === "posted" ? (
                        <span className="inline-flex rounded-full bg-[#DEF7EC] px-2.5 py-0.5 text-xs font-medium text-[#057A55]">
                          Posted
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-[#FEF3C7] px-2.5 py-0.5 text-xs font-medium text-[#B45309]">
                          Calculated
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </ManagementTableContainer>
      </ManagementTableCard>
    </div>
  );
}
