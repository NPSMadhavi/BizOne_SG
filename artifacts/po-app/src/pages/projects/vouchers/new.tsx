import { useRef, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Trash2, Receipt, Paperclip, X, FileImage } from "lucide-react";

interface Item {
  description: string;
  category: string;
  amount: string;
}

interface ProofFile {
  data: string;
  mimeType: string;
  name: string;
  sizeKB: number;
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

export default function VoucherNew() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const today = new Date().toISOString().split("T")[0];

  const [form, setForm] = useState({
    type: "payment",
    payee: "",
    payeeContact: "",
    issueDate: today,
    description: "",
    currency: "SGD",
    notes: "",
  });
  const [items, setItems] = useState<Item[]>([{ description: "", category: "", amount: "" }]);
  const [proof, setProof] = useState<ProofFile | null>(null);

  const { data: project } = useQuery<any>({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const r = await fetch(`/api/projects/${projectId}`, { credentials: "include" });
      if (!r.ok) throw new Error("Not found");
      return r.json();
    },
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const validItems = items.filter(it => it.description.trim() && parseFloat(it.amount) > 0);
      const r = await fetch(`/api/projects/${projectId}/vouchers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ...form,
          items: validItems.map(it => ({
            description: it.description.trim(),
            category: it.category,
            amount: parseFloat(it.amount) || 0,
          })),
          proofData: proof?.data ?? null,
          proofMimeType: proof?.mimeType ?? null,
        }),
      });
      if (!r.ok) {
        const e = await r.json();
        throw new Error(e.error || "Failed to create voucher");
      }
      return r.json();
    },
    onSuccess: (voucher) => {
      qc.invalidateQueries({ queryKey: ["project", projectId] });
      toast({ title: "Voucher created" });
      setLocation(`/projects/${projectId}/vouchers/${voucher.id}`);
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Only images supported", description: "Please upload a JPG, PNG, or WebP image.", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum file size is 5 MB.", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1];
      setProof({ data: base64, mimeType: file.type, name: file.name, sizeKB: Math.round(file.size / 1024) });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => setLocation(`/projects/${projectId}`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2">
          <Receipt className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-xl font-bold">New Voucher</h1>
            {project && <p className="text-xs text-muted-foreground">{project.name}</p>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-5">
          {/* Basic Info */}
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
                <Input className="mt-1" placeholder="Vendor / Employee name" value={form.payee} onChange={e => set("payee", e.target.value)} />
              </div>
              <div>
                <Label>Payee Contact</Label>
                <Input className="mt-1" placeholder="Email or phone" value={form.payeeContact} onChange={e => set("payeeContact", e.target.value)} />
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
              <Textarea className="mt-1" rows={2} placeholder="Brief purpose of this voucher..." value={form.description} onChange={e => set("description", e.target.value)} />
            </div>
          </div>

          {/* Items */}
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
                    <Input
                      placeholder="What was purchased/paid"
                      value={it.description}
                      onChange={e => setItem(i, "description", e.target.value)}
                    />
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
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={it.amount}
                      onChange={e => setItem(i, "amount", e.target.value)}
                      className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
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
            <Label>Notes (optional)</Label>
            <Textarea className="mt-1" rows={2} placeholder="Any additional notes..." value={form.notes} onChange={e => set("notes", e.target.value)} />
          </div>

          {/* Proof upload */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-1">
              <Paperclip className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-semibold">Payment Proof / Receipt</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Attach a bill, receipt, or payment screenshot. Supported: JPG, PNG, WebP (max 5 MB).
              When the voucher is paid, the proof image will appear as page 2 of the PDF with a PAID stamp.
            </p>

            {!proof ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-border rounded-lg py-8 flex flex-col items-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
              >
                <FileImage className="h-8 w-8" />
                <span className="text-sm font-medium">Click to upload proof / receipt</span>
                <span className="text-xs">JPG, PNG, WebP — max 5 MB</span>
              </button>
            ) : (
              <div className="flex items-start gap-4 p-3 border border-border rounded-lg bg-muted/30">
                <img
                  src={`data:${proof.mimeType};base64,${proof.data}`}
                  alt="Proof"
                  className="w-24 h-24 object-cover rounded border border-border"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{proof.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{proof.sizeKB} KB</p>
                  <p className="text-xs text-green-600 mt-1">✓ Will appear as page 2 in PDF when paid</p>
                </div>
                <button
                  onClick={() => setProof(null)}
                  className="text-muted-foreground hover:text-destructive transition-colors mt-0.5"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        </div>

        {/* Right column — summary */}
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-xl p-5 sticky top-6">
            <h2 className="font-semibold mb-4">Summary</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Type</span>
                <span>{form.type === "payment" ? "Payment Voucher" : form.type === "reimbursement" ? "Reimbursement" : "Petty Cash"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Payee</span>
                <span className="font-medium truncate ml-4">{form.payee || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Items</span>
                <span>{items.filter(it => it.description.trim()).length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Proof</span>
                <span className={proof ? "text-green-600 font-medium" : "text-muted-foreground"}>
                  {proof ? "Attached" : "None"}
                </span>
              </div>
              <div className="h-px bg-border my-2" />
              <div className="flex justify-between text-base font-bold">
                <span>Total</span>
                <span className="text-primary">{fmt(total)}</span>
              </div>
            </div>

            <div className="mt-5 space-y-2">
              <Button
                className="w-full"
                onClick={() => mutation.mutate()}
                disabled={!form.payee.trim() || total <= 0 || mutation.isPending}
              >
                {mutation.isPending ? "Creating…" : "Save Voucher"}
              </Button>
              <Button variant="outline" className="w-full" onClick={() => setLocation(`/projects/${projectId}`)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
