import { useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useSelectCompany, getGetMeQueryKey, useLogout } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Building2, Plus, ArrowRight, Lock, ChevronLeft, LogOut, MapPin, Hash } from "lucide-react";
import logo from "@assets/bizone_logo_optimized.webp";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const COUNTRY_MAP: Record<string, { iso: string; label: string }> = {
  SG: { iso: "sg", label: "Singapore" },
  Singapore: { iso: "sg", label: "Singapore" },
  IN: { iso: "in", label: "India" },
  India: { iso: "in", label: "India" },
  MY: { iso: "my", label: "Malaysia" },
  Malaysia: { iso: "my", label: "Malaysia" },
  US: { iso: "us", label: "United States" },
  GB: { iso: "gb", label: "United Kingdom" },
  AU: { iso: "au", label: "Australia" },
};

function countryInfo(c: string) {
  return COUNTRY_MAP[c] ?? { iso: null, label: c };
}

function FlagImg({ iso, className = "h-4 w-6 object-cover rounded-sm" }: { iso: string | null; className?: string }) {
  if (!iso) return <span className="text-slate-400 text-xs font-mono">—</span>;
  return (
    <img
      src={`https://flagcdn.com/w40/${iso}.png`}
      alt={iso.toUpperCase()}
      className={className}
      onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
    />
  );
}

type Step = "details" | "confirm";
const EMPTY = { name: "", country: "SG", registrationNo: "", address: "", email: "", phone: "", logoUrl: "" };

export default function SelectCompany() {
  const { user, isAdmin, setSelectedCompanyId } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const selectCompany = useSelectCompany();
  const logout = useLogout();
  const { toast } = useToast();

  const companies = user?.companies ?? [];
  const [selecting, setSelecting] = useState<number | null>(null);

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("details");
  const [form, setForm] = useState(EMPTY);
  const [adminPassword, setAdminPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [pwError, setPwError] = useState("");

  function handleSelect(companyId: number) {
    setSelecting(companyId);
    selectCompany.mutate({ data: { companyId } }, {
      onSuccess: () => {
        setSelectedCompanyId(companyId);
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        setLocation("/dashboard");
      },
      onError: () => setSelecting(null),
    });
  }

  function handleLogout() {
    logout.mutate(undefined, {
      onSuccess: () => {
        queryClient.clear();
        setLocation("/login");
      },
    });
  }

  function openDialog() {
    setForm(EMPTY);
    setAdminPassword("");
    setPwError("");
    setStep("details");
    setOpen(true);
  }

  async function handleCreate() {
    if (!adminPassword.trim()) { setPwError("Please enter your password."); return; }
    setSaving(true);
    setPwError("");
    try {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...form, adminPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) { setPwError(data.error || "Incorrect password."); }
        else { toast({ title: "Error", description: data.error || "Failed to create company.", variant: "destructive" }); }
        return;
      }
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      setOpen(false);
      toast({ title: "Company created", description: `${data.name} has been added.` });
    } catch {
      toast({ title: "Error", description: "Could not create company.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">

      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-slate-200 shadow-sm">
        <img src={logo} alt="Logo" className="h-8" />
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500">
            Signed in as <span className="font-semibold text-slate-700">{user?.username}</span>
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-slate-600 hover:text-red-600 hover:bg-red-50"
            onClick={handleLogout}
          >
            <LogOut className="h-3.5 w-3.5" />
            Logout
          </Button>
        </div>
      </div>

      {/* Page content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-2xl space-y-6">

          {/* Heading */}
          <div>
            <h1 className="text-xl font-bold text-slate-900">Select Company</h1>
            <p className="text-sm text-slate-500 mt-0.5">Choose which company to work in for this session.</p>
          </div>

          {/* Table */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider w-8">#</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Company</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell">Country</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">Reg. No.</th>
                  <th className="w-20" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {companies.map((company, idx) => {
                  const ci = countryInfo(company.country ?? "");
                  const isLoading = selecting === company.id;
                  return (
                    <tr
                      key={company.id}
                      onClick={() => !selecting && handleSelect(company.id)}
                      className="group cursor-pointer hover:bg-primary/5 transition-colors"
                    >
                      <td className="px-4 py-3.5 text-slate-400 text-xs tabular-nums">{idx + 1}</td>
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-slate-900 group-hover:text-primary transition-colors">{company.name}</div>
                        {company.address && (
                          <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                            <MapPin className="h-2.5 w-2.5 shrink-0" />
                            <span className="line-clamp-1">{company.address}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3.5 hidden sm:table-cell">
                        <span className="inline-flex items-center gap-2 text-slate-600">
                          <FlagImg iso={ci.iso} />
                          <span className="text-xs">{ci.label}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3.5 hidden md:table-cell">
                        {(company as any).registrationNo ? (
                          <span className="font-mono text-xs text-slate-500">{(company as any).registrationNo}</span>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center justify-end">
                          {isLoading ? (
                            <div className="inline-flex items-center justify-center h-7 w-7">
                              <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                            </div>
                          ) : (
                            <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-primary transition-colors" />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {companies.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-400">
                      No companies assigned to your account.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Add company — admin only */}
          {isAdmin && (
            <div className="flex justify-end">
              <Button variant="outline" size="sm" className="gap-2 text-slate-600" onClick={openDialog}>
                <Plus className="h-3.5 w-3.5" />
                Add Company
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Add Company dialog */}
      <Dialog open={open} onOpenChange={v => { if (!saving) setOpen(v); }}>
        <DialogContent className="max-w-lg">
          {step === "details" ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary" />
                  Add New Company
                </DialogTitle>
                <DialogDescription>
                  Fill in the details below. Each company gets independent settings, running numbers, and documents.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-1">
                <div className="space-y-1.5">
                  <Label htmlFor="nc-name">Company Name <span className="text-destructive">*</span></Label>
                  <Input id="nc-name" placeholder="e.g. Acme Pte. Ltd." value={form.name}
                    onChange={e => setForm(p => ({ ...p, name: e.target.value }))} autoFocus />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="nc-country">Country <span className="text-destructive">*</span></Label>
                    <Select value={form.country} onValueChange={v => setForm(p => ({ ...p, country: v }))}>
                      <SelectTrigger id="nc-country"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="SG">🇸🇬 Singapore</SelectItem>
                        <SelectItem value="IN">🇮🇳 India</SelectItem>
                        <SelectItem value="MY">🇲🇾 Malaysia</SelectItem>
                        <SelectItem value="US">🇺🇸 United States</SelectItem>
                        <SelectItem value="GB">🇬🇧 United Kingdom</SelectItem>
                        <SelectItem value="AU">🇦🇺 Australia</SelectItem>
                        <SelectItem value="OTHER">🌐 Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="nc-reg">Registration No.</Label>
                    <Input id="nc-reg" placeholder="e.g. 200812581D" value={form.registrationNo}
                      onChange={e => setForm(p => ({ ...p, registrationNo: e.target.value }))} />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="nc-address">Address</Label>
                  <Input id="nc-address" placeholder="Full registered address" value={form.address}
                    onChange={e => setForm(p => ({ ...p, address: e.target.value }))} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="nc-email">Email</Label>
                    <Input id="nc-email" type="email" placeholder="info@company.com" value={form.email}
                      onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="nc-phone">Phone</Label>
                    <Input id="nc-phone" placeholder="+65 6123 4567" value={form.phone}
                      onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Company Logo <span className="text-xs text-muted-foreground font-normal">optional — shown in sidebar</span></Label>
                  <div className="flex items-center gap-3">
                    {form.logoUrl ? (
                      <div className="relative group">
                        <img src={form.logoUrl} alt="Logo preview" className="h-10 w-auto object-contain rounded border bg-white p-1 max-w-[100px]" />
                        <button type="button" onClick={() => setForm(p => ({ ...p, logoUrl: "" }))}
                          className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-destructive text-white text-[10px] font-bold flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                      </div>
                    ) : (
                      <div className="h-10 w-20 rounded border border-dashed bg-muted/40 flex items-center justify-center text-xs text-muted-foreground">No logo</div>
                    )}
                    <label className="cursor-pointer">
                      <span className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors">
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                        Upload
                      </span>
                      <input type="file" accept="image/*" className="hidden" onChange={e => {
                        const file = e.target.files?.[0]; if (!file) return;
                        const reader = new FileReader();
                        reader.onload = ev => setForm(p => ({ ...p, logoUrl: ev.target?.result as string }));
                        reader.readAsDataURL(file); e.target.value = "";
                      }} />
                    </label>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground bg-muted rounded-lg px-3 py-2">
                  Default GST: <strong>{form.country === "IN" ? "18%" : "9%"}</strong>. Adjustable in Settings after setup.
                </p>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={() => { setPwError(""); setStep("confirm"); }} disabled={!form.name.trim()} className="gap-2">
                  Continue <ArrowRight className="h-4 w-4" />
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-primary" />
                  Confirm Your Password
                </DialogTitle>
                <DialogDescription>
                  Creating <strong>{form.name}</strong> (<FlagImg iso={countryInfo(form.country).iso} className="inline h-3.5 w-5 object-cover rounded-sm align-middle" /> {countryInfo(form.country).label}). Enter your admin password to proceed.
                </DialogDescription>
              </DialogHeader>

              <div className="py-2 space-y-3">
                <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm space-y-0.5">
                  <div className="flex items-center gap-2 font-semibold">
                    <FlagImg iso={countryInfo(form.country).iso} className="h-4 w-6 object-cover rounded-sm" />
                    {form.name}
                  </div>
                  {form.registrationNo && <p className="text-xs text-muted-foreground font-mono">{form.registrationNo}</p>}
                  {form.address && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Hash className="h-3 w-3" />{form.address}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="admin-pw">Your Password</Label>
                  <Input id="admin-pw" type="password" placeholder="Enter your admin password"
                    value={adminPassword}
                    onChange={e => { setAdminPassword(e.target.value); setPwError(""); }}
                    onKeyDown={e => e.key === "Enter" && handleCreate()}
                    autoFocus
                    className={pwError ? "border-destructive focus-visible:ring-destructive" : ""}
                  />
                  {pwError && <p className="text-xs text-destructive">{pwError}</p>}
                </div>
              </div>

              <DialogFooter>
                <Button variant="ghost" onClick={() => setStep("details")} disabled={saving} className="gap-1 mr-auto">
                  <ChevronLeft className="h-4 w-4" /> Back
                </Button>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
                <Button onClick={handleCreate} disabled={saving || !adminPassword.trim()} className="gap-2">
                  {saving
                    ? <><div className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Creating…</>
                    : <><Building2 className="h-4 w-4" /> Create Company</>
                  }
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
