import { useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Trash2, Receipt, Paperclip, X, FileImage, Upload } from "lucide-react";

interface Item {
  description: string;
  category: string;
  amount: string;
}

interface AttachFile {
  data: string;
  mimeType: string;
  name: string;
  sizeKB: number;
}

interface ExistingAttachment {
  id: number;
  fileName: string;
  mimeType: string;
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
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_FILES = 10;

export default function VoucherEdit() {
  const params = useParams<{ id: string; vid: string }>();
  const projectId = params.id;
  const voucherId = params.vid;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  // Existing attachments from server
  const [existingAttachments, setExistingAttachments] = useState<ExistingAttachment[]>([]);
  // New files to upload after save
  const [newAttachments, setNewAttachments] = useState<AttachFile[]>([]);
  // IDs to delete after save
  const [toDelete, setToDelete] = useState<number[]>([]);

  const { data: voucher, isLoading } = useQuery<any>({
    queryKey: ["voucher", voucherId],
    queryFn: async () => {
      const r = await fetch(`/api/vouchers/${voucherId}`, { credentials: "include" });
      if (!r.ok) throw new Error("Not found");
      return r.json();
    },
  });

  // Load existing attachments
  const { data: attachmentsData } = useQuery<ExistingAttachment[]>({
    queryKey: ["voucher-attachments", voucherId],
    queryFn: async () => {
      const r = await fetch(`/api/vouchers/${voucherId}/attachments`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!voucherId,
  });

  useEffect(() => {
    if (attachmentsData) setExistingAttachments(attachmentsData);
  }, [attachmentsData]);

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
      // Step 1: Update voucher core fields
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

      // Step 2: Delete removed attachments
      for (const id of toDelete) {
        await fetch(`/api/vouchers/${voucherId}/attachments/${id}`, {
          method: "DELETE",
          credentials: "include",
        });
      }

      // Step 3: Upload new attachments
      for (const att of newAttachments) {
        await fetch(`/api/vouchers/${voucherId}/attachments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ fileName: att.name, mimeType: att.mimeType, fileData: att.data }),
        });
      }
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const totalExisting = existingAttachments.length - toDelete.length;
    const remaining = MAX_FILES - totalExisting - newAttachments.length;
    if (remaining <= 0) {
      toast({ title: `Max ${MAX_FILES} files`, variant: "destructive" });
      return;
    }

    files.slice(0, remaining).forEach(file => {
      if (!file.type.startsWith("image/")) {
        toast({ title: `${file.name}: only images supported`, variant: "destructive" });
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        toast({ title: `${file.name}: max 5 MB`, variant: "destructive" });
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(",")[1];
        setNewAttachments(prev => [...prev, { data: base64, mimeType: file.type, name: file.name, sizeKB: Math.round(file.size / 1024) }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  const removeExisting = (id: number) => {
    setToDelete(prev => [...prev, id]);
    setExistingAttachments(prev => prev.filter(a => a.id !== id));
  };
  const removeNew = (i: number) => setNewAttachments(prev => prev.filter((_, idx) => idx !== i));

  const visibleExisting = existingAttachments.filter(a => !toDelete.includes(a.id));
  const totalFiles = visibleExisting.length + newAttachments.length;

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

          {/* Bills / Receipts — multi-upload */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <Paperclip className="h-4 w-4 text-muted-foreground" />
                <h2 className="font-semibold">Bills / Receipts</h2>
                {totalFiles > 0 && (
                  <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                    {totalFiles}
                  </span>
                )}
              </div>
              {totalFiles < MAX_FILES && (
                <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="gap-1.5">
                  <Upload className="h-3.5 w-3.5" />
                  Add Files
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Attach bills, receipts, or payment screenshots. Images only (JPG, PNG, WebP), max 5 MB each, up to {MAX_FILES} files.
            </p>

            {totalFiles === 0 ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-border rounded-lg py-8 flex flex-col items-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
              >
                <FileImage className="h-8 w-8" />
                <span className="text-sm font-medium">Click to upload bills / receipts</span>
                <span className="text-xs">JPG, PNG, WebP — max 5 MB each</span>
              </button>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {/* Existing attachments — shown as placeholder tiles (no image data loaded) */}
                {visibleExisting.map(att => (
                  <div key={att.id} className="relative group border border-border rounded-lg overflow-hidden bg-muted/20">
                    <div className="w-full h-32 flex items-center justify-center bg-muted/30">
                      <FileImage className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <div className="p-2">
                      <p className="text-xs font-medium truncate">{att.fileName}</p>
                      <p className="text-xs text-muted-foreground">Saved</p>
                    </div>
                    <button
                      onClick={() => removeExisting(att.id)}
                      className="absolute top-1.5 right-1.5 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {/* New attachments being added */}
                {newAttachments.map((att, i) => (
                  <div key={`new-${i}`} className="relative group border border-primary/30 rounded-lg overflow-hidden bg-primary/5">
                    <img
                      src={`data:${att.mimeType};base64,${att.data}`}
                      alt={att.name}
                      className="w-full h-32 object-cover"
                    />
                    <div className="p-2">
                      <p className="text-xs font-medium truncate">{att.name}</p>
                      <p className="text-xs text-primary">New — {att.sizeKB} KB</p>
                    </div>
                    <button
                      onClick={() => removeNew(i)}
                      className="absolute top-1.5 right-1.5 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {totalFiles < MAX_FILES && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-border rounded-lg h-32 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                  >
                    <Plus className="h-6 w-6" />
                    <span className="text-xs">Add more</span>
                  </button>
                )}
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />
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
              <div className="flex justify-between">
                <span className="text-muted-foreground">Attachments</span>
                <span className={totalFiles > 0 ? "text-green-600 font-medium" : "text-muted-foreground"}>
                  {totalFiles > 0 ? `${totalFiles} file${totalFiles > 1 ? "s" : ""}` : "None"}
                </span>
              </div>
              {toDelete.length > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">To remove</span>
                  <span className="text-destructive">{toDelete.length} file{toDelete.length > 1 ? "s" : ""}</span>
                </div>
              )}
              {newAttachments.length > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">To upload</span>
                  <span className="text-primary">{newAttachments.length} new</span>
                </div>
              )}
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
