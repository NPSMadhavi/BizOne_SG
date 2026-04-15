import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Building2, Users2, Search, CheckCircle2, MapPin } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useGetSettings } from "@workspace/api-client-react";

interface DirectoryEntry {
  id: number;
  name: string;
  address: string | null;
  postalCode: string | null;
  country: string | null;
  contactPerson: string | null;
  contactEmail: string | null;
  phone: string | null;
  gstRegistered: boolean;
  gstNo: string | null;
  isActive: boolean;
}

export interface PickedEntry {
  name: string;
  address: string;
  postalCode: string;
  contactPerson: string;
  contactEmail: string;
  phone: string;
  effectiveGstRate: number;
  gstNo: string;
  country: string;
  fullAddress: string;
}

interface DirectoryPickerButtonProps {
  type: "vendor" | "customer";
  onSelect: (entry: PickedEntry) => void;
  label?: string;
}

async function fetchEntries(type: "vendor" | "customer"): Promise<DirectoryEntry[]> {
  const url = type === "vendor" ? "/api/vendors" : "/api/customers";
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) return [];
  const all: DirectoryEntry[] = await res.json();
  return all.filter(e => e.isActive);
}

function buildFullAddress(entry: DirectoryEntry): string {
  const lines: string[] = [];
  if (entry.address) lines.push(entry.address);
  const cityLine = [entry.country, entry.postalCode].filter(Boolean).join(" ");
  if (cityLine) lines.push(cityLine);
  return lines.join("\n");
}

export function DirectoryPickerButton({ type, onSelect, label }: DirectoryPickerButtonProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { selectedCompany } = useAuth();
  const { data: settings } = useGetSettings({});
  const companyGstRate = settings?.gstRate ?? 9;
  const companyCountry = selectedCompany?.country ?? "";

  const { data: entries = [] } = useQuery({
    queryKey: [type === "vendor" ? "vendors" : "customers"],
    queryFn: () => fetchEntries(type),
    enabled: open,
  });

  const filtered = entries.filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    (e.country || "").toLowerCase().includes(search.toLowerCase()) ||
    (e.postalCode || "").includes(search) ||
    (e.address || "").toLowerCase().includes(search.toLowerCase())
  );

  function computeEffectiveGst(entry: DirectoryEntry): number {
    if (!entry.gstRegistered) return 0;
    const entryCountry = (entry.country || "").toLowerCase();
    const coCountry = companyCountry.toLowerCase();
    if (!entryCountry || !coCountry || entryCountry !== coCountry) return 0;
    return companyGstRate;
  }

  function handlePick(entry: DirectoryEntry) {
    const effectiveGstRate = computeEffectiveGst(entry);
    onSelect({
      name: entry.name,
      address: entry.address || "",
      postalCode: entry.postalCode || "",
      contactPerson: entry.contactPerson || "",
      contactEmail: entry.contactEmail || "",
      phone: entry.phone || "",
      effectiveGstRate,
      gstNo: entry.gstNo || "",
      country: entry.country || "",
      fullAddress: buildFullAddress(entry),
    });
    setSearch("");
    setOpen(false);
  }

  const Icon = type === "vendor" ? Building2 : Users2;
  const btnLabel = label ?? (type === "vendor" ? "Pick from Vendors" : "Pick from Customers");

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5 text-xs h-8"
        onClick={() => setOpen(true)}
      >
        <Icon className="h-3.5 w-3.5" />
        {btnLabel}
      </Button>

      <Dialog open={open} onOpenChange={v => { setOpen(v); setSearch(""); }}>
        <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Icon className="h-4 w-4" />
              {type === "vendor" ? "Select Vendor" : "Select Customer"}
            </DialogTitle>
          </DialogHeader>

          <div className="relative mt-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              autoFocus
              placeholder={`Search by name, address or postal code…`}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-9 text-sm"
            />
          </div>

          <div className="flex-1 overflow-y-auto mt-2 space-y-1 min-h-0">
            {filtered.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm">
                <Icon className="h-8 w-8 mx-auto mb-2 opacity-30" />
                {entries.length === 0 ? `No active ${type}s in your directory.` : "No matches found."}
              </div>
            ) : (
              filtered.map(entry => {
                const effectiveGst = computeEffectiveGst(entry);
                const isLocal = (entry.country || "").toLowerCase() === companyCountry.toLowerCase();
                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => handlePick(entry)}
                    className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-accent transition-colors border border-transparent hover:border-border"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">{entry.name}</div>
                        {(entry.address || entry.postalCode) && (
                          <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <MapPin className="h-2.5 w-2.5 shrink-0" />
                            <span className="truncate">
                              {[entry.address, entry.postalCode].filter(Boolean).join(", ")}
                            </span>
                          </div>
                        )}
                        {entry.contactEmail && (
                          <div className="text-xs text-muted-foreground">{entry.contactEmail}</div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {entry.country && (
                          <Badge variant="outline" className="text-xs font-normal">{entry.country}</Badge>
                        )}
                        {entry.gstRegistered ? (
                          <Badge className={isLocal ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100 text-xs" : "bg-orange-100 text-orange-700 hover:bg-orange-100 text-xs"}>
                            <CheckCircle2 className="h-2.5 w-2.5 mr-1" />
                            GST {effectiveGst}%{!isLocal && " (overseas)"}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">No GST</Badge>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
