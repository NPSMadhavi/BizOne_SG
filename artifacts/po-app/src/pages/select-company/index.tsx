import { useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useSelectCompany, getGetMeQueryKey } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Building2, MapPin, Plus, ArrowRight, Lock, ChevronLeft, Hash, Phone, Mail } from "lucide-react";
import logo from "@assets/logo_1776054030755.png";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

type CountryInfo = { flag: string; name: string; code: string };

const COUNTRY_MAP: Record<string, CountryInfo> = {
  SG: { flag: "🇸🇬", name: "Singapore", code: "SG" },
  Singapore: { flag: "🇸🇬", name: "Singapore", code: "SG" },
  IN: { flag: "🇮🇳", name: "India", code: "IN" },
  India: { flag: "🇮🇳", name: "India", code: "IN" },
  MY: { flag: "🇲🇾", name: "Malaysia", code: "MY" },
  Malaysia: { flag: "🇲🇾", name: "Malaysia", code: "MY" },
  US: { flag: "🇺🇸", name: "United States", code: "US" },
  GB: { flag: "🇬🇧", name: "United Kingdom", code: "GB" },
  AU: { flag: "🇦🇺", name: "Australia", code: "AU" },
  OTHER: { flag: "🌐", name: "Other", code: "OTHER" },
};

function getCountryInfo(country: string): CountryInfo {
  return COUNTRY_MAP[country] ?? { flag: "🌐", name: country, code: country };
}

type Step = "details" | "confirm";

const EMPTY_FORM = { name: "", country: "SG", registrationNo: "", address: "", email: "", phone: "" };

export default function SelectCompany() {
  const { user, isAdmin, setSelectedCompanyId } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const selectCompany = useSelectCompany();
  const { toast } = useToast();

  const companies = user?.companies ?? [];
  const [selecting, setSelecting] = useState<number | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [step, setStep] = useState<Step>("details");
  const [form, setForm] = useState(EMPTY_FORM);
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

  function openDialog() {
    setForm(EMPTY_FORM);
    setAdminPassword("");
    setPwError("");
    setStep("details");
    setDialogOpen(true);
  }

  function closeDialog() {
    if (saving) return;
    setDialogOpen(false);
  }

  const canProceed = form.name.trim().length > 0 && form.country.trim().length > 0;

  async function handleCreate() {
    if (!adminPassword.trim()) {
      setPwError("Please enter your password.");
      return;
    }
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
        if (res.status === 401) {
          setPwError(data.error || "Incorrect password.");
        } else {
          toast({ title: "Error", description: data.error || "Failed to create company.", variant: "destructive" });
        }
        return;
      }
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      setDialogOpen(false);
      toast({ title: "Company created", description: `${data.name} has been added. Select it below to get started.` });
    } catch {
      toast({ title: "Error", description: "Could not create company. Please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const colClass =
    companies.length <= 1
      ? "grid-cols-1 max-w-sm"
      : companies.length === 2
      ? "grid-cols-1 sm:grid-cols-2 max-w-2xl"
      : "grid-cols-1 sm:grid-cols-2 max-w-3xl";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col items-center justify-center p-6">
      <div className="w-full flex flex-col items-center gap-8">

        {/* Header */}
        <div className="text-center space-y-2">
          <img src={logo} alt="Logo" className="h-11 mx-auto mb-1" />
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Select a Company</h1>
          <p className="text-sm text-slate-500">Choose the company you want to work with for this session.</p>
        </div>

        {/* Company grid */}
        <div className={`grid ${colClass} gap-4 w-full mx-auto`}>
          {companies.map((company) => {
            const ci = getCountryInfo(company.country ?? "");
            const isLoading = selecting === company.id;
            return (
              <button
                key={company.id}
                onClick={() => handleSelect(company.id)}
                disabled={selecting !== null}
                className="group relative flex flex-col gap-0 rounded-2xl border border-slate-200 bg-white text-left shadow-sm hover:border-primary hover:shadow-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-60 overflow-hidden"
              >
                {/* Top colour stripe */}
                <div className="h-1.5 bg-gradient-to-r from-primary/70 to-primary w-full" />

                <div className="p-5 flex flex-col gap-4 flex-1">
                  {/* Flag + country code row */}
                  <div className="flex items-center justify-between">
                    <span className="text-4xl leading-none">{ci.flag}</span>
                    <span className="text-xs font-semibold text-slate-400 tracking-widest uppercase bg-slate-100 px-2 py-0.5 rounded-full">
                      {ci.code}
                    </span>
                  </div>

                  {/* Company name */}
                  <div>
                    <h3 className="font-bold text-base text-slate-900 leading-snug group-hover:text-primary transition-colors">
                      {company.name}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">{ci.name}</p>
                  </div>

                  {/* Details */}
                  <div className="space-y-1.5 text-xs text-slate-500 flex-1">
                    {(company as any).registrationNo && (
                      <div className="flex items-center gap-1.5">
                        <Hash className="h-3 w-3 shrink-0 text-slate-400" />
                        <span className="font-mono">{(company as any).registrationNo}</span>
                      </div>
                    )}
                    {company.address && (
                      <div className="flex items-start gap-1.5">
                        <MapPin className="h-3 w-3 shrink-0 text-slate-400 mt-0.5" />
                        <span className="line-clamp-2 leading-relaxed">{company.address}</span>
                      </div>
                    )}
                    {company.email && (
                      <div className="flex items-center gap-1.5">
                        <Mail className="h-3 w-3 shrink-0 text-slate-400" />
                        <span className="truncate">{company.email}</span>
                      </div>
                    )}
                    {company.phone && (
                      <div className="flex items-center gap-1.5">
                        <Phone className="h-3 w-3 shrink-0 text-slate-400" />
                        <span>{company.phone}</span>
                      </div>
                    )}
                  </div>

                  {/* Enter row */}
                  <div className="flex items-center justify-end gap-1 text-xs font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                    {isLoading ? "Opening…" : "Enter"}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </div>
                </div>

                {/* Loading overlay */}
                {isLoading && (
                  <div className="absolute inset-0 bg-white/70 flex items-center justify-center rounded-2xl">
                    <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex flex-col items-center gap-3">
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-slate-600 border-slate-300 hover:border-primary hover:text-primary"
              onClick={openDialog}
            >
              <Plus className="h-3.5 w-3.5" />
              Add New Company
            </Button>
          )}
          <p className="text-xs text-slate-400">
            Logged in as <span className="font-semibold text-slate-600">{user?.username}</span>
          </p>
        </div>
      </div>

      {/* Add Company Dialog */}
      <Dialog open={dialogOpen} onOpenChange={closeDialog}>
        <DialogContent className="max-w-lg">
          {step === "details" ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-primary" />
                  Add New Company
                </DialogTitle>
                <DialogDescription>
                  Fill in the company details. Each company gets its own isolated settings, SMTP, running numbers, and documents.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-1">
                <div className="space-y-1.5">
                  <Label htmlFor="nc-name">Company Name <span className="text-destructive">*</span></Label>
                  <Input
                    id="nc-name"
                    placeholder="e.g. Acme Pte. Ltd."
                    value={form.name}
                    onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                    autoFocus
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="nc-country">Country <span className="text-destructive">*</span></Label>
                    <Select value={form.country} onValueChange={v => setForm(p => ({ ...p, country: v }))}>
                      <SelectTrigger id="nc-country">
                        <SelectValue />
                      </SelectTrigger>
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
                    <Input
                      id="nc-reg"
                      placeholder="e.g. 200812581D"
                      value={form.registrationNo}
                      onChange={e => setForm(p => ({ ...p, registrationNo: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="nc-address">Address</Label>
                  <Input
                    id="nc-address"
                    placeholder="Full registered address"
                    value={form.address}
                    onChange={e => setForm(p => ({ ...p, address: e.target.value }))}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="nc-email">Email</Label>
                    <Input
                      id="nc-email"
                      type="email"
                      placeholder="info@company.com"
                      value={form.email}
                      onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="nc-phone">Phone</Label>
                    <Input
                      id="nc-phone"
                      placeholder="+65 6123 4567"
                      value={form.phone}
                      onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                    />
                  </div>
                </div>

                <p className="text-xs text-muted-foreground bg-muted rounded-lg px-3 py-2">
                  Default GST will be set to <strong>{form.country === "IN" ? "18%" : "9%"}</strong>. You can change this in Settings after setup.
                </p>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={closeDialog}>Cancel</Button>
                <Button
                  onClick={() => { setPwError(""); setStep("confirm"); }}
                  disabled={!canProceed}
                  className="gap-2"
                >
                  Continue
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Lock className="h-5 w-5 text-primary" />
                  Confirm Your Password
                </DialogTitle>
                <DialogDescription>
                  You're about to create <strong>{form.name}</strong> ({getCountryInfo(form.country).flag} {getCountryInfo(form.country).name}). Enter your admin password to confirm.
                </DialogDescription>
              </DialogHeader>

              <div className="py-2 space-y-3">
                <div className="rounded-lg border bg-muted/40 px-4 py-3 space-y-1 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{getCountryInfo(form.country).flag}</span>
                    <span className="font-semibold">{form.name}</span>
                  </div>
                  {form.registrationNo && <p className="text-xs text-muted-foreground font-mono">{form.registrationNo}</p>}
                  {form.address && <p className="text-xs text-muted-foreground">{form.address}</p>}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="admin-pw">Your Password</Label>
                  <Input
                    id="admin-pw"
                    type="password"
                    placeholder="Enter your admin password"
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
                  <ChevronLeft className="h-4 w-4" />
                  Back
                </Button>
                <Button variant="outline" onClick={closeDialog} disabled={saving}>Cancel</Button>
                <Button onClick={handleCreate} disabled={saving || !adminPassword.trim()} className="gap-2">
                  {saving ? (
                    <><div className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Creating…</>
                  ) : (
                    <><Building2 className="h-4 w-4" /> Create Company</>
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
