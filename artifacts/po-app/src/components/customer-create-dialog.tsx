import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { AddressAutocomplete } from "@/components/address-autocomplete";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Globe, Info, ChevronsUpDown, Check } from "lucide-react";
import { CountrySelect } from "@/operations-8june/components/forms/CountrySelect";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { useGetSettings } from "@workspace/api-client-react";
import { CURRENCIES } from "@/lib/currencies";

interface Customer {
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

const blank = () => ({
  name: "", address: "", postalCode: "", country: "", contactPerson: "",
  contactEmail: "", phone: "", currency: "", gstRegistered: false, gstNo: "",
  shipToAddress: "", quotationTerms: "", isActive: true,
});

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (customer: Customer) => void;
  initialName?: string;
}

async function createCustomer(data: Partial<Customer>): Promise<Customer> {
  const res = await fetch("/api/customers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Failed to save"); }
  return res.json();
}

export function CustomerCreateDialog({ open, onOpenChange, onSuccess, initialName = "" }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { selectedCompany } = useAuth();
  const companyCountry = selectedCompany?.country ?? "";
  const { data: settings } = useGetSettings({});
  const companyGstRate = settings?.gstRate ?? 9;
  const taxLabel = (settings as any)?.taxLabel ?? "GST";

  const [form, setForm] = useState(() => ({ ...blank(), name: initialName }));
  const [currencyOpen, setCurrencyOpen] = useState(false);

  const handleOpenChange = (v: boolean) => {
    if (v) setForm({ ...blank(), name: initialName });
    onOpenChange(v);
  };

  const setField = (k: string, val: any) => setForm(p => ({ ...p, [k]: val }));

  const isInternational = Boolean(
    form.country && companyCountry &&
    form.country.toLowerCase() !== companyCountry.toLowerCase()
  );

  const mutation = useMutation({
    mutationFn: createCustomer,
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast({ title: "Customer created", description: created.name });
      onOpenChange(false);
      onSuccess(created);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Customer</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Company / Customer Name <span className="text-destructive">*</span></Label>
            <Input value={form.name} onChange={e => setField("name", e.target.value)} placeholder="Customer company or individual name" autoFocus />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Country</Label>
              <CountrySelect
                value={form.country}
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
              <Input value={form.phone} onChange={e => setField("phone", e.target.value)} placeholder="+65 xxxx xxxx" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Address</Label>
            <AddressAutocomplete
              value={form.address}
              onChange={v => setField("address", v)}
              onPostalCodeChange={v => setField("postalCode", v)}
              country={form.country || undefined}
              placeholder="Start typing to search address…"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Postal Code</Label>
              <Input value={form.postalCode} onChange={e => setField("postalCode", e.target.value)} placeholder="e.g. 408564 (SG) or 530007 (IN)" />
              <p className="text-[11px] text-muted-foreground">Auto-filled when you select an address suggestion above.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Default Currency</Label>
              <Popover open={currencyOpen} onOpenChange={setCurrencyOpen} modal>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" role="combobox" className="w-full justify-between font-normal">
                    <span className={form.currency ? "text-foreground" : "text-muted-foreground"}>
                      {form.currency ? CURRENCIES.find(c => c.code === form.currency)?.label ?? form.currency : "Select currency (optional)"}
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
                          <CommandItem key={c.code} value={c.label} onSelect={() => { setField("currency", c.code); setCurrencyOpen(false); }}>
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
          </div>

          <div className="space-y-1.5">
            <Label>Ship To Address <span className="text-muted-foreground text-xs font-normal">(optional)</span></Label>
            <Textarea value={form.shipToAddress} onChange={e => setField("shipToAddress", e.target.value)} placeholder="Delivery / ship-to address if different from billing address" className="resize-none" rows={2} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Contact Person</Label>
              <Input value={form.contactPerson} onChange={e => setField("contactPerson", e.target.value)} placeholder="Name" />
            </div>
            <div className="space-y-1.5">
              <Label>Contact Email</Label>
              <Input type="email" value={form.contactEmail} onChange={e => setField("contactEmail", e.target.value)} placeholder="email@customer.com" />
            </div>
          </div>

          {isInternational ? (
            <div className="border rounded-lg p-4 bg-blue-50 border-blue-200 flex gap-3">
              <Globe className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-blue-800">International Customer — GST Not Applicable</p>
                <p className="text-xs text-blue-700 mt-1">
                  This customer is based in <strong>{form.country}</strong>, outside your company's country ({companyCountry}).
                  Exports to overseas customers are <strong>zero-rated (0%)</strong>.
                </p>
              </div>
            </div>
          ) : (
            <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-semibold">GST / Tax Registered</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Toggle on if this customer is {taxLabel} registered ({companyGstRate}%)</p>
                </div>
                <Switch checked={form.gstRegistered} onCheckedChange={v => setField("gstRegistered", v)} />
              </div>
              {form.gstRegistered && (
                <div className="space-y-1.5">
                  <Label>GST / Tax Registration Number</Label>
                  <Input value={form.gstNo} onChange={e => setField("gstNo", e.target.value)} placeholder="e.g. 200812581D / 22XXXXX1234X1ZX" />
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mutation.mutate(form)} disabled={!form.name || mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Create Customer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
