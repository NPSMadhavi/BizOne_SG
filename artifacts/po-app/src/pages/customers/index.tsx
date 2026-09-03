import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { Plus, Edit2, Trash2, MapPin, Globe, Info, Check } from "lucide-react";
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

interface Customer {
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
  shipToAddress: string | null;
  quotationTerms: string | null;
  isActive: boolean;
  createdAt: string;
}

const blank = (): Partial<Customer> => ({
  name: "", address: "", postalCode: "", country: "", contactPerson: "",
  contactEmail: "", phone: "", currency: "", gstRegistered: false, gstNo: "",
  shipToAddress: "", quotationTerms: "", isActive: true,
});

async function fetchCustomers(): Promise<Customer[]> {
  const res = await fetch("/api/customers", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch customers");
  return res.json();
}

async function saveCustomer(data: Partial<Customer>, id?: number): Promise<Customer> {
  const url = id ? `/api/customers/${id}` : "/api/customers";
  const res = await fetch(url, {
    method: id ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Failed to save"); }
  return res.json();
}

async function deleteCustomer(id: number) {
  const res = await fetch(`/api/customers/${id}`, { method: "DELETE", credentials: "include" });
  if (!res.ok) throw new Error("Failed to delete");
}

function formatAddress(c: Customer): string {
  const parts = [c.address, c.postalCode].filter(Boolean);
  return parts.join(", ") || "—";
}

export default function CustomersPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState<Partial<Customer>>(blank());
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [currencyOpen, setCurrencyOpen] = useState(false);

  const { selectedCompany, canManage } = useAuth();
  const companyCountry = selectedCompany?.country ?? "";

  const { data: settings } = useGetSettings({});
  const companyGstRate = settings?.gstRate ?? 9;
  const taxLabel = (settings as any)?.taxLabel ?? "GST";

  const isInternational = isInternationalParty(form.country, companyCountry);

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ["customers"],
    queryFn: fetchCustomers,
  });

  const mutation = useMutation({
    mutationFn: (data: Partial<Customer>) => saveCustomer(data, editing?.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setDialogOpen(false);
      toast({ title: editing ? "Updated" : "Created", description: `Customer ${editing ? "updated" : "created"} successfully.` });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCustomer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setDeleteId(null);
      toast({ title: "Deleted", description: "Customer removed." });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const openNew = () => { setEditing(null); setForm(blank()); setDialogOpen(true); };
  const openEdit = (c: Customer) => { setEditing(c); setForm({ ...c }); setDialogOpen(true); };
  const setField = (k: keyof Customer, val: any) => setForm(p => ({ ...p, [k]: val }));

  const filtered = useMemo(() => customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.country || "").toLowerCase().includes(search.toLowerCase()) ||
    (c.contactEmail || "").toLowerCase().includes(search.toLowerCase()) ||
    (c.postalCode || "").includes(search)
  ), [customers, search]);

  const { page, setPage, totalPages, paginatedItems } = usePagination(filtered);

  const effectiveGst = (c: Customer) => {
    if (!c.gstRegistered) return "0%";
    return `${companyGstRate}%`;
  };

  return (
    <>
      <ManagementPageHeader
        title="Customers"
        action={
          <Button
            className="gap-2 bg-[#2563EB] text-white shadow-sm hover:bg-[#2563EB]"
            onClick={openNew}
          >
            <Plus className="h-4 w-4" /> New Customer
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
                  <TableHead>GST / Tax No</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-px text-left">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedItems.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium text-[#111827]">
                      <div>{c.name}</div>
                      {(c.address || c.postalCode) && (
                        <div className="mt-0.5 flex items-center gap-1 text-xs text-[#6B7280]">
                          <MapPin className="h-2.5 w-2.5 shrink-0" />
                          <span className="max-w-[200px] truncate">{formatAddress(c)}</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-[#444651]">{c.country || "—"}</TableCell>
                    <TableCell>
                      {c.currency
                        ? <Badge variant="outline" className="font-mono text-xs">{c.currency}</Badge>
                        : <span className="text-xs text-[#6B7280]">—</span>}
                    </TableCell>
                    <TableCell>
                      <div className="text-xs text-[#111827]">{c.contactPerson || "—"}</div>
                      <div className="text-xs text-[#6B7280]">{c.contactEmail || ""}</div>
                    </TableCell>
                    <TableCell>
                      {c.gstRegistered
                        ? <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">{effectiveGst(c)}</Badge>
                        : <Badge variant="outline">0% (N/A)</Badge>}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-[#444651]">{c.gstNo || "—"}</TableCell>
                    <TableCell>
                      <ManagementStatusPill active={c.isActive} />
                    </TableCell>
                    <TableCell className="w-px whitespace-nowrap">
                      <div className="flex items-center justify-start gap-2">
                        <ManagementIconAction label="Edit customer" onClick={() => openEdit(c)}>
                          <Edit2 className="h-4 w-4" />
                        </ManagementIconAction>
                        {canManage && (
                          <ManagementIconAction
                            variant="delete"
                            label="Delete customer"
                            onClick={() => setDeleteId(c.id)}
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
            title={search ? "No results found" : "No customers yet"}
            description={
              search
                ? "Try adjusting your search terms."
                : "Add your first customer to enable auto-fill on invoices and quotations."
            }
            action={
              !search ? (
                <Button
                  className="bg-[#2563EB] text-white shadow-sm hover:bg-[#2563EB]"
                  onClick={openNew}
                >
                  <Plus className="mr-2 h-4 w-4" /> New Customer
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
            <DialogTitle>{editing ? "Edit Customer" : "New Customer"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Company / Customer Name <span className="text-destructive">*</span></Label>
              <Input value={form.name || ""} onChange={e => setField("name", e.target.value)} />
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
                  hideChevron
                  className="h-9 shadow-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={form.phone || ""} onChange={e => setField("phone", e.target.value)} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Address</Label>
              <AddressAutocomplete
                value={form.address || ""}
                onChange={v => setField("address", v)}
                onPostalCodeChange={v => setField("postalCode", v)}
                country={form.country || undefined}
                placeholder=""
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Postal Code</Label>
                <Input
                  value={form.postalCode || ""}
                  onChange={e => setField("postalCode", e.target.value)}
                />
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
              </div>
            </div>

            <div className="space-y-2">
              <Label>Ship To Address <span className="text-muted-foreground text-xs font-normal">(optional)</span></Label>
              {(() => {
                const addrs = form.shipToAddress ? form.shipToAddress.split("\n\n") : [""];
                return (
                  <div className="space-y-2">
                    {addrs.map((addr, idx) => (
                      <div key={idx} className="relative group">
                        <Textarea
                          value={addr}
                          onChange={(e) => {
                            const newAddrs = [...addrs];
                            newAddrs[idx] = e.target.value;
                            setField("shipToAddress", newAddrs.join("\n\n"));
                          }}
                          className="resize-none pr-8 text-sm"
                          rows={2}
                        />
                        {addrs.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              const newAddrs = addrs.filter((_, i) => i !== idx);
                              setField("shipToAddress", newAddrs.join("\n\n"));
                            }}
                            className="absolute right-2 top-2 text-[#EF4444] opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Remove Address"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full text-xs gap-1.5 py-1.5 h-auto text-[#2563EB] hover:text-[#1D4ED8]"
                      onClick={() => {
                        const newAddrs = [...addrs, ""];
                        setField("shipToAddress", newAddrs.join("\n\n"));
                      }}
                    >
                      <Plus className="h-3.5 w-3.5" /> Add More Ship-To Address
                    </Button>
                  </div>
                );
              })()}
              <p className="text-[11px] text-muted-foreground">Shown on invoices when this customer is selected.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Contact Person</Label>
                <Input value={form.contactPerson || ""} onChange={e => setField("contactPerson", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Contact Email</Label>
                <Input type="email" value={form.contactEmail || ""} onChange={e => setField("contactEmail", e.target.value)} />
              </div>
            </div>

            {isInternational ? (
              <div className="border rounded-lg p-4 bg-blue-50 border-blue-200 flex gap-3">
                <Globe className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-blue-800">International Customer — GST Not Applicable</p>
                  <p className="text-xs text-blue-700 mt-1">
                    This customer is based in <strong>{form.country}</strong>, which is outside your company's country ({companyCountry}).
                    Under local {taxLabel} regulations, exports and cross-border sales to overseas entities are <strong>zero-rated (0%)</strong> — GST is not charged regardless of their own registration status.
                  </p>
                </div>
              </div>
            ) : (
              <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-semibold">GST / Tax Registered</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Toggle on if this customer is {taxLabel} registered ({companyGstRate}% applies for local customers)
                    </p>
                  </div>
                  <Switch
                    checked={form.gstRegistered || false}
                    onCheckedChange={v => setField("gstRegistered", v)}
                  />
                </div>
                {form.gstRegistered && (
                  <div className="space-y-1.5">
                    <Label>GST / Tax Registration Number</Label>
                    <Input value={form.gstNo || ""} onChange={e => setField("gstNo", e.target.value)} />
                  </div>
                )}
              </div>
            )}

            {!form.country && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
                <Info className="h-3.5 w-3.5 shrink-0" />
                Select a country to determine if GST applies to this customer.
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Quotation Terms &amp; Conditions <span className="text-muted-foreground text-xs font-normal">(optional)</span></Label>
              <Textarea
                value={form.quotationTerms || ""}
                onChange={e => setField("quotationTerms", e.target.value)}
                className="resize-none text-sm"
                rows={5}
              />
              <p className="text-[11px] text-muted-foreground">
                When this customer is selected in a quotation, these T&C will auto-fill the Notes field. If left blank, the default from Settings → Documents is used.
              </p>
            </div>

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
              {mutation.isPending ? "Saving…" : editing ? "Update Customer" : "Create Customer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Customer</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove this customer from your directory. Documents already created will not be affected.</AlertDialogDescription>
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
