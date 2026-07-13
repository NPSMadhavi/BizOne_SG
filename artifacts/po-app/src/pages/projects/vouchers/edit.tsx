import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Trash2, Receipt } from "lucide-react";

interface Item {
  description: string;
  category: string;
  amount: string;
}

const EXPENSE_CATEGORIES = [
  "Labour / Wages",
  "Software / Subscriptions",
  "Materials / Supplies",
  "Travel & Transport",
  "Professional Fees",
  "Equipment / Hardware",
  "Office Expenses",
  "Communication",
  "Accommodation",
  "Miscellaneous",
];

const CURRENCIES = ["SGD", "USD", "EUR", "GBP", "MYR", "INR"];

export default function VoucherEdit() {
  const params = useParams<{ id: string; vid: string }>();
  const projectId = params.id;
  const voucherId = params.vid;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [form, setForm] = useState({
    type: "payment",
    payee: "",
    payeeContact: "",
    issueDate: "",
    description: "",
    currency: "SGD",
    notes: "",
  });
  const [items, setItems] = useState<Item[]>([{ description: "", category: "", amount: "" }]);

  const { data: voucher, isLoading } = useQuery<any>({
    queryKey: ["voucher", voucherId],
    queryFn: async () => {
      const r = await fetch(`/api/vouchers/${voucherId}`, { credentials: "include" });
      if (!r.ok) throw new Error("Not found");
      return r.json();
    },
  });

  useEffect(() => {
    if (voucher) {
      setForm({
        type: voucher.type || "payment",
        payee: voucher.payee || "",
        payeeContact: voucher.payeeContact || "",
        issueDate: voucher.issueDate || "",
        description: voucher.description || "",
        currency: voucher.currency || "SGD",
        notes: voucher.notes || "",
      });
      const vItems = (voucher.items as any[]) || [];
      setItems(
        vItems.length > 0
          ? vItems.map((it: any) => ({ description: it.description || "", category: it.category || "", amount: String(it.amount || "") }))
          : [{ description: "", category: "", amount: "" }]
      );
    }
  }, [voucher]);

  const mutation = useMutation({
    mutationFn: async () => {
      const validItems = items.filter(it => it.description.trim() && parseFloat(it.amount) > 0);
      const r = await fetch(`/api/vouchers/${voucherId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ...form,
          items: validItems.map(it => ({
            description: it.description.trim(),
            category: it.category,
            amount: parseFloat(it.amount) || 0,
          })),
        }),
      });
      if (!r.ok) {
        const e = await r.json();
        throw new Error(e.error || "Failed to update voucher");
      }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["voucher", voucherId] });
      qc.invalidateQueries({ queryKey: ["project", projectId] });
      toast({ title: "Voucher updated" });
      setLocation(`/projects/${projectId}/vouchers/${voucherId}`);
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const set = (field: string, val: string) => setForm(f => ({ ...f, [field]: val }));
  const setItem = (i: number, field: keyof Item, val: string) => {
    setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: val } : it));
  };
  const addItem = () => setItems(prev => [...prev, { description: "", category: "", amount: "" }]);
  const removeItem = (i: number) => setItems(prev => prev.filter((_, idx) => idx !== i));

  const total = items.reduce((s, it) => s + (parseFloat(it.amount) || 0), 0);
  const fmt = (n: number) => new Intl.NumberFormat("en-US", {
    style: "currency", currency: form.currency, minimumFractionDigits: 2
  }).format(n);

  if (isLoading) return (
    <div className="flex justify-center py-16">
      <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  );

  if (voucher?.status === "paid") return (
    <div className="max-w-xl mx-auto px-4 py-16 text-center">
      <p className="text-muted-foreground">Cannot edit a paid voucher.</p>
      <Button className="mt-4" onClick={() => setLocation(`/projects/${projectId}/vouchers/${voucherId}`)}>
        Back to Voucher
      </Button>
    </div>
  );

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => setLocation(`/projects/${projectId}/vouchers/${voucherId}`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2">
          <Receipt className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold">Edit Voucher</h1>
          {voucher && <span className="text-muted-foreground text-sm">— {voucher.voucherNumber}</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="font-semibold mb-4">Voucher Details</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Voucher Type</Label>
                <Select value={form.type} onValueChange={v => set("type", v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="payment">Payment Voucher</SelectItem>
                    <SelectItem value="reimbursement">Reimbursement Voucher</SelectItem>
                    <SelectItem value="petty-cash">Petty Cash Voucher</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Issue Date</Label>
                <Input className="mt-1" type="date" value={form.issueDate} onChange={e => set("issueDate", e.target.value)} />
              </div>
              <div>
                <Label>Pay To (Payee) *</Label>
                <Input className="mt-1" value={form.payee} onChange={e => set("payee", e.target.value)} />
              </div>
              <div>
                <Label>Payee Contact</Label>
                <Input className="mt-1" value={form.payeeContact} onChange={e => set("payeeContact", e.target.value)} />
              </div>
              <div>
                <Label>Currency</Label>
                <Select value={form.currency} onValueChange={v => set("currency", v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="mt-4">
              <Label>Purpose / Description</Label>
              <Textarea className="mt-1" rows={2} value={form.description} onChange={e => set("description", e.target.value)} />
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Expense Items</h2>
              <Button variant="outline" size="sm" onClick={addItem} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                Add Item
              </Button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground px-1">
                <div className="col-span-5">Description *</div>
                <div className="col-span-4">Category</div>
                <div className="col-span-2">Amount *</div>
                <div className="col-span-1"></div>
              </div>
              {items.map((it, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-5">
                    <Input value={it.description} onChange={e => setItem(i, "description", e.target.value)} />
                  </div>
                  <div className="col-span-4">
                    <Select value={it.category} onValueChange={v => setItem(i, "category", v)}>
                      <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                      <SelectContent>
                        {EXPENSE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Input type="number" min="0" step="0.01" value={it.amount} onChange={e => setItem(i, "amount", e.target.value)} className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                  </div>
                  <div className="col-span-1 flex justify-center">
                    {items.length > 1 && (
                      <button onClick={() => removeItem(i)} className="text-muted-foreground hover:text-destructive transition-colors">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-5">
            <Label>Notes</Label>
            <Textarea className="mt-1" rows={2} value={form.notes} onChange={e => set("notes", e.target.value)} />
          </div>
        </div>

        <div>
          <div className="bg-card border border-border rounded-xl p-5 sticky top-6">
            <h2 className="font-semibold mb-4">Summary</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Payee</span>
                <span className="font-medium truncate ml-4">{form.payee || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Items</span>
                <span>{items.filter(it => it.description.trim()).length}</span>
              </div>
              <div className="h-px bg-border my-2" />
              <div className="flex justify-between text-base font-bold">
                <span>Total</span>
                <span className="text-primary">{fmt(total)}</span>
              </div>
            </div>
            <div className="mt-5 space-y-2">
              <Button className="w-full" onClick={() => mutation.mutate()} disabled={!form.payee.trim() || mutation.isPending}>
                {mutation.isPending ? "Saving…" : "Save Changes"}
              </Button>
              <Button variant="outline" className="w-full" onClick={() => setLocation(`/projects/${projectId}/vouchers/${voucherId}`)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
