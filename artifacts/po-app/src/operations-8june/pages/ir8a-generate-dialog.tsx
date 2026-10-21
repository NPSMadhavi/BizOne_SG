import { AlertCircle, Check, Download, Eye, FileText, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type Ir8aAttentionRow = {
  id: number;
  name: string;
  nric: string;
  issue: string;
};

const YEARS = [2024, 2025, 2026, 2027, 2028];

function GenerateStepper() {
  const steps = [
    { key: "review", label: "Review Data", state: "done" },
    { key: "generate", label: "Generate IR8A", state: "current" },
    { key: "completed", label: "Completed", state: "upcoming" },
  ] as const;

  return (
    <div className="flex flex-wrap items-center justify-center gap-y-3 px-2 py-2">
      {steps.map((step, index) => (
        <div key={step.key} className="flex items-center">
          {index > 0 ? <div className="mx-3 h-px w-8 bg-[#D6DEEA] sm:w-14" /> : null}
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold",
                step.state === "upcoming" ? "bg-[#E8EDF5] text-[#94A3B8]" : "bg-[#2563EB] text-white",
              )}
            >
              {step.state === "done" ? <Check className="h-4 w-4" strokeWidth={3} /> : index + 1}
            </span>
            <span className={cn("text-sm font-medium", step.state === "upcoming" ? "text-[#94A3B8]" : "text-[#2563EB]")}>
              {step.label}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function Ir8aGenerateDialog({
  open,
  onOpenChange,
  year,
  onYearChange,
  phase,
  processed,
  total,
  percent,
  successCount,
  attention,
  checkedIds,
  onToggle,
  onToggleAll,
  onView,
  onDownload,
  onUpdate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  year: string;
  onYearChange: (year: string) => void;
  phase: "running" | "done";
  processed: number;
  total: number;
  percent: number;
  successCount: number;
  attention: Ir8aAttentionRow[];
  checkedIds: number[];
  onToggle: (id: number) => void;
  onToggleAll: (checked: boolean) => void;
  onView: () => void;
  onDownload: () => void;
  onUpdate: (id: number) => void;
}) {
  const allChecked = attention.length > 0 && attention.every((row) => checkedIds.includes(row.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94vh] w-[min(980px,calc(100vw-1rem))] max-w-none overflow-y-auto border-[#E5E7EB] bg-[#F7F9FC] p-5 sm:p-7 [&>button]:z-20 [&>button]:flex [&>button]:h-8 [&>button]:w-8 [&>button]:items-center [&>button]:justify-center [&>button]:rounded-md [&>button]:bg-white [&>button]:text-[#334155] [&>button]:opacity-100 [&>button]:shadow-sm [&>button]:hover:bg-[#F1F5F9] [&>button>svg]:h-5 [&>button>svg]:w-5">
        {phase === "running" ? (
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-4 pr-10">
              <h2 className="text-[28px] font-bold tracking-tight text-[#1E3A5F]">Generate IR8A</h2>
              <div className="flex items-center gap-2">
                <span className="text-sm text-[#64748B]">Year of Assessment</span>
                <Select value={year} onValueChange={onYearChange}>
                  <SelectTrigger className="h-10 w-[110px] bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {YEARS.map((value) => (
                      <SelectItem key={value} value={String(value)}>{value}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <GenerateStepper />

            <div className="rounded-2xl border border-[#E2EAF5] bg-white px-6 py-10 shadow-sm">
              <div className="mx-auto flex max-w-xl flex-col items-center text-center">
                <svg className="h-24 w-24 animate-spin" viewBox="0 0 100 100" aria-hidden>
                  <circle cx="50" cy="50" r="38" fill="none" stroke="#E8EEF5" strokeWidth="10" />
                  <circle
                    cx="50"
                    cy="50"
                    r="38"
                    fill="none"
                    stroke="#2563EB"
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray="180 240"
                  />
                </svg>
                <h3 className="mt-6 text-2xl font-bold text-[#1E3A5F]">Generating IR8A...</h3>
                <p className="mt-2 text-sm text-[#64748B]">Please wait while we process the data. This may take a few moments.</p>
              </div>
              <div className="mx-auto mt-8 max-w-3xl">
                <div className="h-2.5 overflow-hidden rounded-full bg-[#E5E7EB]">
                  <div className="h-full rounded-full bg-[#2563EB] transition-[width] duration-150" style={{ width: `${percent}%` }} />
                </div>
                <div className="mt-2 flex items-center justify-between text-sm text-[#64748B]">
                  <span>Processing {processed} of {total} employees...</span>
                  <span className="font-semibold text-[#334155]">{percent}%</span>
                </div>
                <div className="mt-6 flex gap-3 rounded-xl border border-[#D6E6FA] bg-[#F3F8FF] px-4 py-3 text-left text-sm text-[#475569]">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#2563EB] text-white">
                    <Info className="h-3 w-3" />
                  </span>
                  <p>The system is calculating employment income, CPF contributions and IR8A for all selected employees.</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-2xl border border-[#D1FAE5] bg-gradient-to-b from-[#ECFDF5] to-white px-5 py-5">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#22C55E] text-white">
                  <Check className="h-6 w-6" strokeWidth={3} />
                </span>
                <div>
                  <h2 className="text-2xl font-bold text-[#1E3A5F]">IR8A Generated Successfully</h2>
                  <p className="mt-1 text-sm text-[#64748B]">
                    {successCount} employee records have been generated for Year of Assessment {year}.
                  </p>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button type="button" className="h-10 gap-2 bg-[#2563EB] hover:bg-[#1D4ED8]" onClick={onView}>
                  <Eye className="h-4 w-4" /> View IR8A
                </Button>
                <Button type="button" variant="outline" className="h-10 gap-2 border-[#2563EB] bg-white text-[#2563EB] hover:bg-[#EFF6FF]" onClick={onDownload}>
                  <Download className="h-4 w-4" /> Download PDF
                </Button>
              </div>
            </div>

            <div className="rounded-xl border border-[#E5E7EB] bg-white">
              <div className="flex items-center gap-2 border-b border-[#E5E7EB] px-4 py-3 text-sm font-semibold text-[#1E3A5F]">
                <FileText className="h-4 w-4 text-[#2563EB]" /> Summary
              </div>
              <div className="grid sm:grid-cols-3">
                <div className="px-5 py-4">
                  <p className="text-sm text-[#64748B]">Total Employees</p>
                  <p className="mt-1 text-3xl font-bold text-[#1E3A5F]">{total}</p>
                </div>
                <div className="border-t border-[#E5E7EB] px-5 py-4 sm:border-l sm:border-t-0">
                  <p className="text-sm text-[#64748B]">Successfully Generated</p>
                  <p className="mt-1 text-3xl font-bold text-[#1E3A5F]">{successCount}</p>
                </div>
                <div className="border-t border-[#E5E7EB] px-5 py-4 sm:border-l sm:border-t-0">
                  <p className="text-sm text-[#64748B]">Need Attention</p>
                  <p className="mt-1 text-3xl font-bold text-[#DC2626]">{attention.length}</p>
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white">
              <div className="flex items-center gap-2 border-b border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm font-semibold text-[#DC2626]">
                <AlertCircle className="h-4 w-4" /> Need Attention ({attention.length} Employees)
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-[#F3F8FF] text-left text-[#64748B]">
                      <th className="w-12 px-4 py-3">
                        <Checkbox
                          checked={allChecked}
                          onCheckedChange={(value) => onToggleAll(value === true)}
                          aria-label="Select all employees that need attention"
                        />
                      </th>
                      <th className="px-3 py-3 font-medium">Employee Name</th>
                      <th className="px-3 py-3 font-medium">NRIC / FIN</th>
                      <th className="px-3 py-3 font-medium">Issue</th>
                      <th className="px-4 py-3 text-right font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attention.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-[#64748B]">All employee records are complete.</td>
                      </tr>
                    ) : (
                      attention.map((row) => (
                        <tr key={row.id} className="border-b border-[#F3F4F6] last:border-b-0">
                          <td className="px-4 py-3">
                            <Checkbox
                              checked={checkedIds.includes(row.id)}
                              onCheckedChange={() => onToggle(row.id)}
                              aria-label={`Select ${row.name}`}
                            />
                          </td>
                          <td className="px-3 py-3 font-medium text-[#1E293B]">{row.name}</td>
                          <td className="px-3 py-3 text-[#475569]">{row.nric}</td>
                          <td className="px-3 py-3 text-[#B45309]">{row.issue}</td>
                          <td className="px-4 py-3 text-right">
                            <Button
                              type="button"
                              variant="outline"
                              className="h-8 border-[#2563EB] px-3 text-[#2563EB] hover:bg-[#EFF6FF]"
                              onClick={() => onUpdate(row.id)}
                            >
                              Update
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
