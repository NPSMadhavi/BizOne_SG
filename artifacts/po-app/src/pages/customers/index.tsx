import { useState } from "react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Edit2, Trash2, Users2, CheckCircle2, XCircle, MapPin, Globe, Info, ChevronsUpDown, Check } from "lucide-react";
import { CountrySelect } from "@/operations-8june/components/forms/CountrySelect";
import { useGetSettings } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth-context";
import { CURRENCIES } from "@/lib/currencies";

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

  const isInternational = Boolean(
    form.country && companyCountry &&
    form.country.toLowerCase() !== companyCountry.toLowerCase()
  );

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

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.country || "").toLowerCase().includes(search.toLowerCase()) ||
    (c.contactEmail || "").toLowerCase().includes(search.toLowerCase()) ||
    (c.postalCode || "").includes(search)
  );

  const effectiveGst = (c: Customer) => {
    if (!c.gstRegistered) return "0%";
    return `${companyGstRate}%`;
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#2563EB]">Customers</h1>
          <p className="text-muted-foreground mt-1">Manage your customer directory for this company.</p>
        </div>
        <Button onClick={openNew} className="gap-2">
          <Plus className="h-4 w-4" /> New Customer
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, country, postal code or email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Users2 className="h-4 w-4 text-primary" />
            {filtered.length} {filtered.length === 1 ? "Customer" : "Customers"}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="px-6 py-10 text-center text-muted-foreground text-sm">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="px-6 py-12 text-center text-muted-foreground">
              <Users2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No customers yet</p>
              <p className="text-sm mt-1">Add your first customer to enable auto-fill on invoices and quotations.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-t">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Name</th>
                    <th className="px-4 py-3 text-left font-medium">Country</th>
                    <th className="px-4 py-3 text-left font-medium">Currency</th>
                    <th className="px-4 py-3 text-left font-medium">Contact</th>
                    <th className="px-4 py-3 text-left font-medium">{taxLabel}</th>
                    <th className="px-4 py-3 text-left font-medium">GST / Tax No</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                    <th className="px-4 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map(c => (
                    <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium">{c.name}</div>
                        {(c.address || c.postalCode) && (
                          <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <MapPin className="h-2.5 w-2.5 shrink-0" />
                            <span className="truncate max-w-[200px]">{formatAddress(c)}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{c.country || "—"}</td>
                      <td className="px-4 py-3">
                        {c.currency
                          ? <Badge variant="outline" className="font-mono text-xs">{c.currency}</Badge>
                          : <span className="text-muted-foreground text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs">{c.contactPerson || "—"}</div>
                        <div className="text-xs text-muted-foreground">{c.contactEmail || ""}</div>
                      </td>
                      <td className="px-4 py-3">
                        {c.gstRegistered
                          ? <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">{effectiveGst(c)}</Badge>
                          : <Badge variant="outline">0% (N/A)</Badge>}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{c.gstNo || "—"}</td>
                      <td className="px-4 py-3">
                        {c.isActive
                          ? <span className="flex items-center gap-1 text-emerald-700 text-xs"><CheckCircle2 className="h-3.5 w-3.5" />Active</span>
                          : <span className="flex items-center gap-1 text-muted-foreground text-xs"><XCircle className="h-3.5 w-3.5" />Inactive</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(c)}>
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          {canManage && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteId(c.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Customer" : "New Customer"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Company / Customer Name <span className="text-destructive">*</span></Label>
              <Input value={form.name || ""} onChange={e => setField("name", e.target.value)} placeholder="Customer company or individual name" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Country</Label>
                <CountrySelect
                  value={form.country || ""}
                  onChange={v => {
                    const intl = companyCountry && v.toLowerCase() !== companyCountry.toLowerCase();
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

            <div className="space-y-1.5">
              <Label>Postal Code</Label>
              <Input
                value={form.postalCode || ""}
                onChange={e => setField("postalCode", e.target.value)}
                placeholder="e.g. 408564 (SG) or 530007 (IN)"
                className="max-w-[200px]"
              />
              <p className="text-[11px] text-muted-foreground">Auto-filled when you select an address suggestion above.</p>
            </div>

            <div className="space-y-1.5">
              <Label>Ship To Address <span className="text-muted-foreground text-xs font-normal">(optional)</span></Label>
              <Textarea
                value={form.shipToAddress || ""}
                onChange={e => setField("shipToAddress", e.target.value)}
                placeholder="Delivery / ship-to address if different from billing address"
                className="resize-none"
                rows={3}
              />
              <p className="text-[11px] text-muted-foreground">Shown on invoices when this customer is selected.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Contact Person</Label>
                <Input value={form.contactPerson || ""} onChange={e => setField("contactPerson", e.target.value)} placeholder="Name" />
              </div>
              <div className="space-y-1.5">
                <Label>Contact Email</Label>
                <Input type="email" value={form.contactEmail || ""} onChange={e => setField("contactEmail", e.target.value)} placeholder="email@customer.com" />
              </div>
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
              <p className="text-[11px] text-muted-foreground">Used to auto-fill currency when creating documents for this customer.</p>
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
                    <Input value={form.gstNo || ""} onChange={e => setField("gstNo", e.target.value)} placeholder="e.g. 200812581D / 22XXXXX1234X1ZX" />
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
                placeholder="Enter customer-specific T&C for quotations. Leave blank to use the default from Settings."
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
    </div>
  );
}
