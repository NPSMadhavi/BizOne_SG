import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, CalendarDays, Check, ChevronDown, Settings2 } from "lucide-react";

export default function NewMultiPriceLevelPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [active, setActive] = useState(true);
  const [priority, setPriority] = useState("2");
  const [baseLevel, setBaseLevel] = useState("");
  const [defaultForNewCustomers, setDefaultForNewCustomers] = useState(false);
  const [fromDate, setFromDate] = useState("2026-09-01");
  const [toDate, setToDate] = useState("");
  const [setCurrent, setSetCurrent] = useState(true);

  const save = () => {
    if (!name.trim() || !code.trim() || !fromDate) {
      toast({ title: "Required fields missing", description: "Enter a price level name, code and start date.", variant: "destructive" });
      return;
    }
    const level = { id: code.trim().toLowerCase(), name: name.trim(), code: code.trim(), description: description.trim() || "Custom customer pricing", priority: Number(priority) || 0, baseLevel, defaultForNewCustomers, fromDate, toDate, setCurrent, color: "bg-violet-500", active };
    try {
      const saved = JSON.parse(window.localStorage.getItem("multi-price-levels-v1") || "[]");
      const existing = Array.isArray(saved) ? saved.filter((item: any) => item.id !== level.id) : [];
      window.localStorage.setItem("multi-price-levels-v1", JSON.stringify([...existing, level]));
    } catch { /* continue to navigation if browser storage is unavailable */ }
    toast({ title: "Price level created", description: `${name.trim()} is ready to use.` });
    setLocation("/multi-price-level");
  };

  return (
    <div className="min-h-full space-y-5 bg-[#f6f8fc] p-1 animate-in fade-in duration-500">
      <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-2 pb-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/multi-price-level")}><ArrowLeft className="h-4 w-4" /></Button>
        <div><h1 className="text-2xl font-bold tracking-tight text-[#132d52]">New Price Level</h1><div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground"><span>Home</span><span>›</span><span>Sales</span><span>›</span><span>Price Management</span><span>›</span><span>Price Level Master</span><span>›</span><span className="text-slate-800">New Price Level</span></div></div>
      </div>

      <Card><CardHeader className="border-b py-4"><CardTitle className="flex items-center gap-2 text-sm"><Settings2 className="h-4 w-4 text-[#1265d8]" /> Basic Information</CardTitle></CardHeader><CardContent className="grid gap-5 p-5 lg:grid-cols-[1.05fr_0.8fr_1.4fr_0.8fr]">
        <div className="space-y-1.5"><Label>Price Level Name <span className="text-destructive">*</span></Label><Input value={name} onChange={e => setName(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Code <span className="text-destructive">*</span></Label><Input value={code} onChange={e => setCode(e.target.value.toUpperCase())} /><p className="text-[11px] text-muted-foreground">Unique code for this price level</p></div>
        <div className="space-y-1.5"><Label>Description</Label><Textarea maxLength={200} value={description} onChange={e => setDescription(e.target.value)} rows={3} /><p className="text-right text-[11px] text-muted-foreground">{description.length}/200</p></div>
        <div className="space-y-2"><Label>Status</Label><div className="flex items-center gap-2 pt-2"><Switch checked={active} onCheckedChange={setActive} /><span className="text-sm font-medium">{active ? "Active" : "Inactive"}</span></div><p className="text-[11px] text-muted-foreground">Inactive levels will not be available for use</p></div>
      </CardContent></Card>

      <div className="grid gap-5 lg:grid-cols-[1.55fr_1fr]">
        <Card><CardHeader className="border-b py-4"><CardTitle className="flex items-center gap-2 text-sm"><Settings2 className="h-4 w-4 text-[#1265d8]" /> Price Level Settings</CardTitle></CardHeader><CardContent className="grid gap-5 p-5 sm:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-1.5"><Label>Priority Order <span className="text-destructive">*</span></Label><Input type="text" inputMode="numeric" pattern="[0-9]*" value={priority} onChange={e => setPriority(e.target.value.replace(/\D/g, ""))}  /><p className="text-[11px] text-muted-foreground">Lower number = Higher priority</p></div>
          <SelectField label="Base Price Level" value={baseLevel} onChange={setBaseLevel} options={["", "Retail Price", "Wholesale Price", "Dealer Price"]} hint="Select parent level (if any)" placeholder="Select base price level" />
          <div className="space-y-2"><Label>Default for New Customers</Label><div className="flex items-center gap-2 pt-2"><Switch checked={defaultForNewCustomers} onCheckedChange={setDefaultForNewCustomers} /><span className="text-sm">{defaultForNewCustomers ? "Enabled" : "Disabled"}</span></div><p className="text-[11px] text-muted-foreground">Set as default price level</p></div>
        </CardContent></Card>

        <Card><CardHeader className="border-b py-4"><CardTitle className="flex items-center gap-2 text-sm"><CalendarDays className="h-4 w-4 text-[#1265d8]" /> Effective Period</CardTitle></CardHeader><CardContent className="grid gap-5 p-5 sm:grid-cols-2"><DateField label="From Date *" value={fromDate} onChange={setFromDate} hint="Start date for this price level" /><DateField label="To Date" value={toDate} onChange={setToDate} hint="Leave blank for unlimited" /><label className="col-span-full flex items-center gap-2 text-sm"><Checkbox checked={setCurrent} onCheckedChange={value => setSetCurrent(value === true)} /> Set as current active price level</label></CardContent></Card>
      </div>

      <div className="flex justify-end gap-3 pb-6"><Button variant="outline" onClick={() => setLocation("/multi-price-level")}>Cancel</Button><Button className="gap-2 bg-[#1265d8] hover:bg-[#0d55b8]" onClick={save}><Check className="h-4 w-4" /> Save Price Level</Button></div>
    </div>
  );
}

function SelectField({ label, value, onChange, options, hint, placeholder }: { label: string; value: string; onChange: (value: string) => void; options: string[]; hint: string; placeholder?: string }) {
  return <div className="space-y-1.5"><Label>{label}</Label><div className="relative"><select value={value} onChange={e => onChange(e.target.value)} className="flex h-10 w-full appearance-none rounded-md border border-input bg-background px-3 py-2 pr-8 text-sm"><option value="">{placeholder || "Select"}</option>{options.filter(Boolean).map(option => <option key={option}>{option}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-muted-foreground" /></div><p className="text-[11px] text-muted-foreground">{hint}</p></div>;
}

function DateField({ label, value, onChange, hint }: { label: string; value: string; onChange: (value: string) => void; hint: string }) {
  return <div className="space-y-1.5"><Label>{label}</Label><Input type="date" value={value} onChange={e => onChange(e.target.value)} /><p className="text-[11px] text-muted-foreground">{hint}</p></div>;
}
