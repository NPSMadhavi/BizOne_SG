import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { AddressAutocomplete } from "@/components/address-autocomplete";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit2, Trash2, MapPin, Globe, Info, ChevronsUpDown, Check } from "lucide-react";
import {
  ManagementPageHeader,
  ManagementSearchBar,
  ManagementTableCard,
  ManagementTableContainer,
  ManagementEmptyState,
  ManagementStatusPill,
  ManagementIconAction,
} from "@/operations-8june/components/layout/ManagementPageUI";
import { CountrySelect } from "@/operations-8june/components/forms/CountrySelect";
import { useGetSettings } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth-context";
import { CURRENCIES } from "@/lib/currencies";
import { isInternationalParty } from "@/lib/countries";
import { usePagination } from "@/hooks/use-pagination";

interface Vendor {
  id: number;
  companyId: number;
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
  isActive: boolean;
  createdAt: string;
}

const blank = (): Partial<Vendor> => ({
  name: "", address: "", postalCode: "", country: "", contactPerson: "",
  contactEmail: "", phone: "", currency: "", gstRegistered: false, gstNo: "", isActive: true,
});

async function fetchVendors(): Promise<Vendor[]> {
  const res = await fetch("/api/vendors", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch vendors");
  return res.json();
}

async function saveVendor(data: Partial<Vendor>, id?: number): Promise<Vendor> {
  const url = id ? `/api/vendors/${id}` : "/api/vendors";
  const res = await fetch(url, {
    method: id ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Failed to save"); }
  return res.json();
}

async function deleteVendor(id: number) {
  const res = await fetch(`/api/vendors/${id}`, { method: "DELETE", credentials: "include" });
  if (!res.ok) throw new Error("Failed to delete");
}

function formatAddress(vendor: Vendor): string {
  const parts = [vendor.address, vendor.postalCode].filter(Boolean);
  return parts.join(", ") || "—";
}

export default function VendorsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [form, setForm] = useState<Partial<Vendor>>(blank());
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [currencyOpen, setCurrencyOpen] = useState(false);

  const { selectedCompany, canManage } = useAuth();
  const companyCountry = selectedCompany?.country ?? "";

  const { data: settings } = useGetSettings({});
  const companyGstRate = settings?.gstRate ?? 9;
  const taxLabel = (settings as any)?.taxLabel ?? "GST";

  const isInternational = isInternationalParty(form.country, companyCountry);

  const { data: vendors = [], isLoading } = useQuery({
    queryKey: ["vendors"],
    queryFn: fetchVendors,
  });

  const mutation = useMutation({
    mutationFn: (data: Partial<Vendor>) => saveVendor(data, editing?.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendors"] });
      setDialogOpen(false);
      toast({ title: editing ? "Updated" : "Created", description: `Vendor ${editing ? "updated" : "created"} successfully.` });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteVendor,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendors"] });
      setDeleteId(null);
      toast({ title: "Deleted", description: "Vendor removed." });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const openNew = () => { setEditing(null); setForm(blank()); setDialogOpen(true); };
  const openEdit = (v: Vendor) => { setEditing(v); setForm({ ...v }); setDialogOpen(true); };
  const setField = (k: keyof Vendor, val: any) => setForm(p => ({ ...p, [k]: val }));

  const filtered = useMemo(() => vendors.filter(v =>
    v.name.toLowerCase().includes(search.toLowerCase()) ||
    (v.country || "").toLowerCase().includes(search.toLowerCase()) ||
    (v.contactEmail || "").toLowerCase().includes(search.toLowerCase()) ||
    (v.postalCode || "").includes(search)
  ), [vendors, search]);

  const { page, setPage, totalPages, paginatedItems } = usePagination(filtered);

  const effectiveGst = (v: Vendor) => {
    if (!v.gstRegistered) return "0%";
    return `${companyGstRate}%`;
  };

  return (
    <>
      <ManagementPageHeader
        title="Vendors"
        action={
          <Button
            className="gap-2 bg-[#2563EB] text-white shadow-sm hover:bg-[#2563EB]"
            onClick={openNew}
          >
            <Plus className="h-4 w-4" /> New Vendor
          </Button>
        }
      />

      <div className="mb-6 flex items-center justify-between gap-2">
        <div className="w-full max-w-md [&>div]:mb-0">
          <ManagementSearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search..."
          />
        </div>
      </div>

      <ManagementTableCard pagination={{ page, totalPages, onPageChange: setPage }}>
        {isLoading ? (
          <p className="py-16 text-center text-sm text-[#6B7280]">Loading...</p>
        ) : filtered.length > 0 ? (
          <ManagementTableContainer>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>{taxLabel}</TableHead>
                  <TableHead>GST No</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-px text-left">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedItems.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-medium text-[#111827]">
                      <div>{v.name}</div>
                      {(v.address || v.postalCode) && (
                        <div className="mt-0.5 flex items-center gap-1 text-xs text-[#6B7280]">
                          <MapPin className="h-2.5 w-2.5 shrink-0" />
                          <span className="max-w-[200px] truncate">{formatAddress(v)}</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-[#444651]">{v.country || "—"}</TableCell>
                    <TableCell>
                      {v.currency
                        ? <Badge variant="outline" className="font-mono text-xs">{v.currency}</Badge>
                        : <span className="text-xs text-[#6B7280]">—</span>}
                    </TableCell>
                    <TableCell>
                      <div className="text-xs text-[#111827]">{v.contactPerson || "—"}</div>
                      <div className="text-xs text-[#6B7280]">{v.contactEmail || ""}</div>
                    </TableCell>
                    <TableCell>
                      {v.gstRegistered
                        ? <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">{effectiveGst(v)}</Badge>
                        : <Badge variant="outline">0% (N/A)</Badge>}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-[#444651]">{v.gstNo || "—"}</TableCell>
                    <TableCell>
                      <ManagementStatusPill active={v.isActive} />
                    </TableCell>
                    <TableCell className="w-px whitespace-nowrap">
                      <div className="flex items-center justify-start gap-2">
                        <ManagementIconAction label="Edit vendor" onClick={() => openEdit(v)}>
                          <Edit2 className="h-4 w-4" />
                        </ManagementIconAction>
                        {canManage && (
                          <ManagementIconAction
                            variant="delete"
                            label="Delete vendor"
                            onClick={() => setDeleteId(v.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </ManagementIconAction>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ManagementTableContainer>
        ) : (
          <ManagementEmptyState
            title={search ? "No results found" : "No vendors yet"}
            description={
              search
                ? "Try adjusting your search terms."
                : "Add your first vendor to start auto-filling purchase orders."
            }
            action={
              !search ? (
                <Button
                  className="bg-[#2563EB] text-white shadow-sm hover:bg-[#2563EB]"
                  onClick={openNew}
                >
                  <Plus className="mr-2 h-4 w-4" /> New Vendor
                </Button>
              ) : undefined
            }
          />
        )}
      </ManagementTableCard>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Vendor" : "New Vendor"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Company Name <span className="text-destructive">*</span></Label>
              <Input value={form.name || ""} onChange={e => setField("name", e.target.value)} placeholder="Vendor company name" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Country</Label>
                <CountrySelect
                  value={form.country || ""}
                  onChange={v => {
                    const intl = isInternationalParty(v, companyCountry);
                    setForm(p => ({ ...p, country: v, gstRegistered: intl ? false : p.gstRegistered, gstNo: intl ? "" : p.gstNo }));
                  }}
                  singleChevron
                  className="h-9 shadow-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={form.phone || ""} onChange={e => setField("phone", e.target.value)} placeholder="+65 xxxx xxxx" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Address</Label>
              <AddressAutocomplete
                value={form.address || ""}
                onChange={v => setField("address", v)}
                onPostalCodeChange={v => setField("postalCode", v)}
                country={form.country || undefined}
                placeholder="Start typing to search address…"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Postal Code</Label>
                <Input
                  value={form.postalCode || ""}
                  onChange={e => setField("postalCode", e.target.value)}
                  placeholder="e.g. 408564 (SG) or 530007 (IN)"
                />
                <p className="text-[11px] text-muted-foreground">Auto-filled when you select an address suggestion above.</p>
              </div>
              <div className="space-y-1.5">
                <Label>Default Currency</Label>
                <Popover open={currencyOpen} onOpenChange={setCurrencyOpen} modal={false}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={currencyOpen}
                      className="w-full justify-between font-normal"
                    >
                      <span className={form.currency ? "text-foreground" : "text-muted-foreground"}>
                        {form.currency
                          ? CURRENCIES.find(c => c.code === form.currency)?.label ?? form.currency
                          : "Select currency (optional)"}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search currency…" />
                      <CommandList>
                        <CommandEmpty>No currency found.</CommandEmpty>
                        <CommandGroup>
                          {CURRENCIES.map(c => (
                            <CommandItem
                              key={c.code}
                              value={c.label}
                              onSelect={() => {
                                setField("currency", c.code);
                                setCurrencyOpen(false);
                              }}
                            >
                              <Check className={`mr-2 h-4 w-4 ${form.currency === c.code ? "opacity-100" : "opacity-0"}`} />
                              {c.label}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <p className="text-[11px] text-muted-foreground">Used to auto-fill currency when creating documents for this vendor.</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Contact Person</Label>
                <Input value={form.contactPerson || ""} onChange={e => setField("contactPerson", e.target.value)} placeholder="Name" />
              </div>
              <div className="space-y-1.5">
                <Label>Contact Email</Label>
                <Input type="email" value={form.contactEmail || ""} onChange={e => setField("contactEmail", e.target.value)} placeholder="email@vendor.com" />
              </div>
            </div>

            {isInternational ? (
              <div className="border rounded-lg p-4 bg-blue-50 border-blue-200 flex gap-3">
                <Globe className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-blue-800">International Vendor — GST Not Applicable</p>
                  <p className="text-xs text-blue-700 mt-1">
                    This vendor is based in <strong>{form.country}</strong>, which is outside your company's country ({companyCountry}).
                    Under local {taxLabel} regulations, imports and cross-border purchases from overseas suppliers are treated as <strong>zero-rated (0%)</strong> — you do not need to record GST on their behalf.
                  </p>
                </div>
              </div>
            ) : (
              <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-semibold">GST Registered</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Toggle on if this vendor charges {taxLabel} ({companyGstRate}%)
                    </p>
                  </div>
                  <Switch
                    checked={form.gstRegistered || false}
                    onCheckedChange={v => setField("gstRegistered", v)}
                  />
                </div>
                {form.gstRegistered && (
                  <div className="space-y-1.5">
                    <Label>GST Registration Number</Label>
                    <Input value={form.gstNo || ""} onChange={e => setField("gstNo", e.target.value)} placeholder="e.g. 200812581D / 22XXXXX1234X1ZX" />
                  </div>
                )}
              </div>
            )}

            {!form.country && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
                <Info className="h-3.5 w-3.5 shrink-0" />
                Select a country to determine if GST applies to this vendor.
              </div>
            )}

            {editing && (
              <div className="flex items-center justify-between border rounded-lg p-3">
                <Label className="text-sm">Active</Label>
                <Switch checked={form.isActive !== false} onCheckedChange={v => setField("isActive", v)} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => mutation.mutate(form)} disabled={!form.name || mutation.isPending}>
              {mutation.isPending ? "Saving…" : editing ? "Update Vendor" : "Create Vendor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Vendor</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove this vendor from your directory. Documents already created will not be affected.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => deleteId && deleteMutation.mutate(deleteId)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
