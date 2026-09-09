import { useState } from "react";
import { Calendar as CalendarIcon, ChevronDown, Lock } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { SyncBridgeDatePicker } from "@/components/ui/sync-bridge-date-picker";
import {
  PERIOD_PRESETS,
  type PeriodPreset,
  toInputDate,
  fromInputDate,
  fmtRangeLabel,
  rangeForPreset,
} from "@/lib/date-range";

/** Existing Dashboard Date Range filter — reused (no duplicate component logic). */
export function DateRangeFilter({
  preset,
  rangeFrom,
  rangeTo,
  onApply,
  showCloseFyButton,
  onCloseFyClick,
}: {
  preset: PeriodPreset;
  rangeFrom: Date;
  rangeTo: Date;
  onApply: (preset: PeriodPreset, from: Date, to: Date) => void;
  showCloseFyButton?: boolean;
  onCloseFyClick?: (from: string, to: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draftPreset, setDraftPreset] = useState<PeriodPreset>(preset);
  const [draftFrom, setDraftFrom] = useState(toInputDate(rangeFrom));
  const [draftTo, setDraftTo] = useState(toInputDate(rangeTo));

  function openPopover(next: boolean) {
    if (next) {
      setDraftPreset(preset);
      setDraftFrom(toInputDate(rangeFrom));
      setDraftTo(toInputDate(rangeTo));
    }
    setOpen(next);
  }

  function selectPreset(id: PeriodPreset) {
    setDraftPreset(id);
    if (id === "custom") return;
    const { from, to } = rangeForPreset(id, rangeFrom, rangeTo);
    setDraftFrom(toInputDate(from));
    setDraftTo(toInputDate(to));
  }

  function resolveDraft() {
    const from = fromInputDate(draftFrom) ?? rangeFrom;
    const to = fromInputDate(draftTo) ?? rangeTo;
    if (draftPreset === "custom") {
      return {
        from: from <= to ? from : to,
        to: from <= to ? to : from,
      };
    }
    return rangeForPreset(draftPreset, from, to);
  }

  function apply() {
    const resolved = resolveDraft();
    onApply(draftPreset, resolved.from, resolved.to);
    setOpen(false);
  }

  function handleCloseFy() {
    const resolved = resolveDraft();
    onApply(draftPreset, resolved.from, resolved.to);
    setOpen(false);
    onCloseFyClick?.(toInputDate(resolved.from), toInputDate(resolved.to));
  }

  return (
    <Popover open={open} onOpenChange={openPopover}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-xl border border-[#e8edf5] bg-white px-4 py-2.5 text-[13px] font-medium text-[#101828] shadow-sm transition hover:bg-[#f8fafc]"
        >
          <CalendarIcon size={16} className="text-[#64748b]" />
          {fmtRangeLabel(rangeFrom, rangeTo)}
          <ChevronDown size={14} className={`text-[#94a3b8] transition ${open ? "rotate-180" : ""}`} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[340px] p-3 space-y-3">
        <p className="text-[12px] font-semibold text-[#64748b] uppercase tracking-wide">Date range</p>
        <div className="grid grid-cols-2 gap-1.5">
          {PERIOD_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => selectPreset(p.id)}
              className={`rounded-lg px-2.5 py-2 text-left text-[12px] font-medium transition ${
                draftPreset === p.id
                  ? "bg-[#1a73e8] text-white shadow-sm"
                  : "bg-[#f8fafc] text-[#475569] hover:bg-[#f0f4ff] hover:text-[#1a73e8]"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1 min-w-0">
            <label className="text-[11px] font-medium text-[#64748b]">From</label>
            <SyncBridgeDatePicker
              mode="date"
              value={draftFrom}
              placeholder="DD/MM/YYYY"
              className="h-9"
              onChange={(iso) => {
                setDraftPreset("custom");
                setDraftFrom(iso || toInputDate(rangeFrom));
              }}
            />
          </div>
          <div className="space-y-1 min-w-0">
            <label className="text-[11px] font-medium text-[#64748b]">To</label>
            <SyncBridgeDatePicker
              mode="date"
              value={draftTo}
              placeholder="DD/MM/YYYY"
              className="h-9"
              onChange={(iso) => {
                setDraftPreset("custom");
                setDraftTo(iso || toInputDate(rangeTo));
              }}
            />
          </div>
        </div>

        {showCloseFyButton && (
          <div className="space-y-1.5 border-t border-[#e8edf5] pt-3">
            <Button
              type="button"
              className="w-full h-9 gap-1.5 bg-[#2563EB] hover:bg-[#1d4ed8] text-[12px] font-semibold"
              onClick={handleCloseFy}
            >
              <Lock className="h-3.5 w-3.5" />
              Close FY & Start Next FY
            </Button>
            <p className="text-[10px] leading-snug text-[#64748b]">
              Uses current range ({draftFrom} → {draftTo})
            </p>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={apply}>
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export type DateRangeCloseFyCtx = {
  draftFrom: string;
  draftTo: string;
  draftPreset: PeriodPreset;
  applyDraft: () => void;
  closePopover: () => void;
};
