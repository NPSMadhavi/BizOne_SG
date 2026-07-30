import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Building2, Users2, Search, CheckCircle2, MapPin, Plus, ArrowLeft, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useGetSettings } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

interface DirectoryEntry {
  id: number;
  name: string;
  address: string | null;
  postalCode: string | null;
  country: string | null;
  contactPerson: string | null;
  contactEmail: string | null;
  phone: string | null;
  currency: string | null;
  gstRegistered: boolean;
  gstNo: string | null;
  shipToAddress: string | null;
  quotationTerms: string | null;
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
  currency: string;
  shipToAddress: string;
  quotationTerms: string;
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

interface CreateForm {
  name: string;
  country: string;
  address: string;
  postalCode: string;
  contactPerson: string;
  contactEmail: string;
  phone: string;
  currency: string;
}

const defaultCreate: CreateForm = {
  name: "", country: "", address: "", postalCode: "",
  contactPerson: "", contactEmail: "", phone: "", currency: "SGD",
};

export function DirectoryPickerButton({ type, onSelect, label }: DirectoryPickerButtonProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<"pick" | "create">("pick");
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(defaultCreate);
  const { selectedCompany } = useAuth();
  const { data: settings } = useGetSettings({});
  const { toast } = useToast();
  const qc = useQueryClient();
  const companyGstRate = settings?.gstRate ?? 9;
  const companyCountry = selectedCompany?.country ?? "";

  const queryKey = type === "vendor" ? "vendors" : "customers";

  const { data: entries = [] } = useQuery({
    queryKey: [queryKey],
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
      currency: entry.currency || "",
      shipToAddress: entry.shipToAddress || "",
      quotationTerms: entry.quotationTerms || "",
    });
    setSearch("");
    setOpen(false);
  }

  async function handleCreate() {
    if (!createForm.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      const url = type === "vendor" ? "/api/vendors" : "/api/customers";
      const body: Record<string, any> = {
        name: createForm.name.trim(),
        country: createForm.country.trim() || null,
        address: createForm.address.trim() || null,
        postalCode: createForm.postalCode.trim() || null,
        contactPerson: createForm.contactPerson.trim() || null,
        contactEmail: createForm.contactEmail.trim() || null,
        phone: createForm.phone.trim() || null,
        currency: createForm.currency || "SGD",
        isActive: true,
      };
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({ title: "Failed to create", description: err.error || "Unknown error", variant: "destructive" });
        return;
      }
      const created: DirectoryEntry = await res.json();
      await qc.invalidateQueries({ queryKey: [queryKey] });
      toast({ title: `${type === "vendor" ? "Vendor" : "Customer"} created`, description: created.name });
      // Auto-select the newly created entry
      const effectiveGstRate = 0; // new entries default to no GST
      onSelect({
        name: created.name,
        address: created.address || "",
        postalCode: created.postalCode || "",
        contactPerson: created.contactPerson || "",
        contactEmail: created.contactEmail || "",
        phone: created.phone || "",
        effectiveGstRate,
        gstNo: created.gstNo || "",
        country: created.country || "",
        fullAddress: buildFullAddress(created),
        currency: created.currency || createForm.currency || "SGD",
        shipToAddress: created.shipToAddress || "",
        quotationTerms: created.quotationTerms || "",
      });
      setCreateForm(defaultCreate);
      setMode("pick");
      setOpen(false);
    } finally {
      setCreating(false);
    }
  }

  function handleClose(v: boolean) {
    if (!v) { setOpen(false); setSearch(""); setMode("pick"); setCreateForm(defaultCreate); }
    else setOpen(true);
  }

  const Icon = type === "vendor" ? Building2 : Users2;
  const btnLabel = label ?? (type === "vendor" ? "Pick from Vendors" : "Pick from Customers");
  const entityLabel = type === "vendor" ? "Vendor" : "Customer";

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

      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {mode === "create" ? (
                <>
                  <Plus className="h-4 w-4" />
                  New {entityLabel}
                </>
              ) : (
                <>
                  <Icon className="h-4 w-4" />
                  Select {entityLabel}
                </>
              )}
            </DialogTitle>
          </DialogHeader>

          {mode === "pick" ? (
            <>
              <div className="flex gap-2 mt-1">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    autoFocus
                    placeholder={`Search by name, address or postal code…`}
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-8 h-9 text-sm"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5 text-xs whitespace-nowrap"
                  onClick={() => setMode("create")}
                >
                  <Plus className="h-3.5 w-3.5" />
                  New {entityLabel}
                </Button>
              </div>

              <div className="flex-1 overflow-y-auto mt-2 space-y-1 min-h-0">
                {filtered.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground text-sm">
                    <Icon className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    {entries.length === 0
                      ? `No active ${type}s in your directory.`
                      : "No matches found."}
                    <div className="mt-3">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs"
                        onClick={() => setMode("create")}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Create new {type}
                      </Button>
                    </div>
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
            </>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-3 mt-2 pr-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1.5 text-xs -ml-1 mb-1"
                onClick={() => { setMode("pick"); setCreateForm(defaultCreate); }}
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to list
              </Button>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Name <span className="text-red-500">*</span></Label>
                  <Input
                    autoFocus
                    placeholder={`${entityLabel} name`}
                    value={createForm.name}
                    onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))}
                    className="h-9 text-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Country</Label>
                    <Input
                      placeholder="e.g. Singapore"
                      value={createForm.country}
                      onChange={e => setCreateForm(f => ({ ...f, country: e.target.value }))}
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Currency</Label>
                    <Input
                      placeholder="SGD"
                      value={createForm.currency}
                      onChange={e => setCreateForm(f => ({ ...f, currency: e.target.value.toUpperCase() }))}
                      className="h-9 text-sm"
                      maxLength={3}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Address</Label>
                  <Input
                    placeholder="Street address"
                    value={createForm.address}
                    onChange={e => setCreateForm(f => ({ ...f, address: e.target.value }))}
                    className="h-9 text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Postal Code</Label>
                  <Input
                    placeholder="Postal / ZIP code"
                    value={createForm.postalCode}
                    onChange={e => setCreateForm(f => ({ ...f, postalCode: e.target.value }))}
                    className="h-9 text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Contact Person</Label>
                  <Input
                    placeholder="Full name"
                    value={createForm.contactPerson}
                    onChange={e => setCreateForm(f => ({ ...f, contactPerson: e.target.value }))}
                    className="h-9 text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Contact Email</Label>
                  <Input
                    type="email"
                    placeholder="email@example.com"
                    value={createForm.contactEmail}
                    onChange={e => setCreateForm(f => ({ ...f, contactEmail: e.target.value }))}
                    className="h-9 text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Phone</Label>
                  <Input
                    placeholder="+65 1234 5678"
                    value={createForm.phone}
                    onChange={e => setCreateForm(f => ({ ...f, phone: e.target.value }))}
                    className="h-9 text-sm"
                  />
                </div>

                <div className="pt-2 flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => { setMode("pick"); setCreateForm(defaultCreate); }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    className="flex-1"
                    disabled={creating || !createForm.name.trim()}
                    onClick={handleCreate}
                  >
                    {creating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                    Create & Select
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
