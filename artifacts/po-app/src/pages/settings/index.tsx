import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/auth-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LogOut, User, Shield, Percent, Save, Mail, CheckCircle2, XCircle, Wifi, Hash, Building2, FileText, Wrench, ToggleLeft, ToggleRight, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useGetSettings, useUpdateSettings, getGetSettingsQueryKey, useListCompanies, getListCompaniesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

type RunningNumberConfig = {
  prefix: string;
  counter: string;
  suffix: string;
};

export default function Settings() {
  const { user, logout, isAdmin } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [gstInput, setGstInput] = useState<string>("");
  const [gstEditing, setGstEditing] = useState(false);

  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [smtpFrom, setSmtpFrom] = useState("");
  const [smtpEditing, setSmtpEditing] = useState(false);
  const [testingSmtp, setTestingSmtp] = useState(false);

  const [companyEdits, setCompanyEdits] = useState<Record<number, {
    name: string; address: string; phone: string; email: string; registrationNo: string;
  }>>({});
  const [savingCompany, setSavingCompany] = useState<number | null>(null);

  const { data: companies, isLoading: companiesLoading } = useListCompanies({
    query: { queryKey: getListCompaniesQueryKey() },
  });

  const getCompanyField = (id: number, field: string, fallback: string) =>
    companyEdits[id]?.[field as keyof typeof companyEdits[0]] ?? fallback;

  const setCompanyField = (id: number, field: string, value: string) => {
    setCompanyEdits(prev => ({
      ...prev,
      [id]: { ...((prev[id]) || {}), [field]: value } as any,
    }));
  };

  const handleSaveCompany = async (company: { id: number; name: string; address?: string | null; phone?: string | null; email?: string | null; registrationNo?: string | null }) => {
    setSavingCompany(company.id);
    try {
      const payload = {
        name: getCompanyField(company.id, "name", company.name),
        address: getCompanyField(company.id, "address", company.address || ""),
        phone: getCompanyField(company.id, "phone", company.phone || ""),
        email: getCompanyField(company.id, "email", company.email || ""),
        registrationNo: getCompanyField(company.id, "registrationNo", company.registrationNo || ""),
      };
      const res = await fetch(`/api/companies/${company.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to save");
      queryClient.invalidateQueries({ queryKey: getListCompaniesQueryKey() });
      toast({ title: "Saved", description: "Company info updated successfully." });
    } catch {
      toast({ title: "Error", description: "Failed to update company info.", variant: "destructive" });
    } finally {
      setSavingCompany(null);
    }
  };

  const [bankDetails, setBankDetails] = useState("");
  const [termsAndConditions, setTermsAndConditions] = useState("");
  const [quotationTerms, setQuotationTerms] = useState("");
  const [docsEditing, setDocsEditing] = useState(false);

  const [rnPO, setRnPO] = useState<RunningNumberConfig>({ prefix: "PO", counter: "1", suffix: "" });
  const [rnQT, setRnQT] = useState<RunningNumberConfig>({ prefix: "QT", counter: "1", suffix: "" });
  const [rnINV, setRnINV] = useState<RunningNumberConfig>({ prefix: "INV", counter: "1", suffix: "" });
  const [rnDO, setRnDO] = useState<RunningNumberConfig>({ prefix: "DO", counter: "1", suffix: "" });
  const [rnGRN, setRnGRN] = useState<RunningNumberConfig>({ prefix: "GRN", counter: "1", suffix: "" });
  const [rnEditing, setRnEditing] = useState(false);

  const [maintEnabled, setMaintEnabled] = useState(false);
  const [maintStart, setMaintStart] = useState("");
  const [maintEnd, setMaintEnd] = useState("");
  const [maintMessage, setMaintMessage] = useState("");
  const [maintContact, setMaintContact] = useState("");
  const [maintSaving, setMaintSaving] = useState(false);
  const [maintLoaded, setMaintLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/maintenance", { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setMaintEnabled(data.isEnabled ?? false);
          setMaintStart(data.scheduledStart ? data.scheduledStart.slice(0, 16) : "");
          setMaintEnd(data.scheduledEnd ? data.scheduledEnd.slice(0, 16) : "");
          setMaintMessage(data.message ?? "");
          setMaintContact(data.contactEmail ?? "");
          setMaintLoaded(true);
        }
      })
      .catch(() => {});
  }, []);

  const handleSaveMaintenance = async () => {
    setMaintSaving(true);
    try {
      const res = await fetch("/api/maintenance", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          isEnabled: maintEnabled,
          scheduledStart: maintStart ? new Date(maintStart).toISOString() : null,
          scheduledEnd: maintEnd ? new Date(maintEnd).toISOString() : null,
          message: maintMessage || null,
          contactEmail: maintContact || null,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      window.dispatchEvent(new CustomEvent("maintenance-updated"));
      toast({ title: "Maintenance settings saved", description: maintEnabled ? "Maintenance mode is now active." : "Maintenance mode is now disabled." });
    } catch {
      toast({ title: "Error", description: "Failed to save maintenance settings.", variant: "destructive" });
    } finally {
      setMaintSaving(false);
    }
  };

  const { data: settings, isLoading: settingsLoading } = useGetSettings({
    query: { queryKey: getGetSettingsQueryKey() },
  });

  useEffect(() => {
    if (settings && !gstEditing) {
      setGstInput(String(settings.gstRate));
    }
    if (settings && !smtpEditing) {
      setSmtpHost(settings.smtpHost || "");
      setSmtpPort(settings.smtpPort || "587");
      setSmtpUser(settings.smtpUser || "");
      setSmtpFrom(settings.smtpFrom || "");
    }
    if (settings && !rnEditing) {
      setRnPO({ prefix: (settings as any).poPrefix ?? "PO", counter: String((settings as any).poCounter ?? 1), suffix: (settings as any).poSuffix ?? "" });
      setRnQT({ prefix: (settings as any).qtPrefix ?? "QT", counter: String((settings as any).qtCounter ?? 1), suffix: (settings as any).qtSuffix ?? "" });
      setRnINV({ prefix: (settings as any).invPrefix ?? "INV", counter: String((settings as any).invCounter ?? 1), suffix: (settings as any).invSuffix ?? "" });
      setRnDO({ prefix: (settings as any).doPrefix ?? "DO", counter: String((settings as any).doCounter ?? 1), suffix: (settings as any).doSuffix ?? "" });
      setRnGRN({ prefix: (settings as any).grnPrefix ?? "GRN", counter: String((settings as any).grnCounter ?? 1), suffix: (settings as any).grnSuffix ?? "" });
    }
    if (settings && !docsEditing) {
      setBankDetails((settings as any).bankDetails ?? "");
      setTermsAndConditions((settings as any).termsAndConditions ?? "");
      setQuotationTerms((settings as any).quotationTerms ?? "");
    }
  }, [settings]);

  const updateSettings = useUpdateSettings();

  const handleSaveGst = () => {
    const rate = parseFloat(gstInput);
    if (isNaN(rate) || rate < 0 || rate > 100) {
      toast({ title: "Invalid rate", description: "GST rate must be between 0 and 100.", variant: "destructive" });
      return;
    }
    updateSettings.mutate({ data: { gstRate: rate } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
        setGstEditing(false);
        toast({ title: "Saved", description: "GST rate updated successfully." });
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to update settings.", variant: "destructive" });
      },
    });
  };

  const handleSaveSmtp = () => {
    updateSettings.mutate(
      {
        data: {
          smtpHost,
          smtpPort,
          smtpUser,
          smtpFrom,
          ...(smtpPass ? { smtpPass } : {}),
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
          setSmtpEditing(false);
          setSmtpPass("");
          toast({ title: "Saved", description: "Email settings updated successfully." });
        },
        onError: () => {
          toast({ title: "Error", description: "Failed to update email settings.", variant: "destructive" });
        },
      }
    );
  };

  const handleSaveRunningNumbers = () => {
    updateSettings.mutate(
      {
        data: {
          poPrefix: rnPO.prefix, poCounter: parseInt(rnPO.counter) || 1, poSuffix: rnPO.suffix,
          qtPrefix: rnQT.prefix, qtCounter: parseInt(rnQT.counter) || 1, qtSuffix: rnQT.suffix,
          invPrefix: rnINV.prefix, invCounter: parseInt(rnINV.counter) || 1, invSuffix: rnINV.suffix,
          doPrefix: rnDO.prefix, doCounter: parseInt(rnDO.counter) || 1, doSuffix: rnDO.suffix,
          grnPrefix: rnGRN.prefix, grnCounter: parseInt(rnGRN.counter) || 1, grnSuffix: rnGRN.suffix,
        } as any,
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
          setRnEditing(false);
          toast({ title: "Saved", description: "Running numbers updated successfully." });
        },
        onError: () => {
          toast({ title: "Error", description: "Failed to update running numbers.", variant: "destructive" });
        },
      }
    );
  };

  const handleSaveDocs = () => {
    setDocsEditing(false);
    updateSettings.mutate(
      { data: { bankDetails, termsAndConditions, quotationTerms } as any },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
          toast({ title: "Saved", description: "Document settings updated successfully." });
        },
        onError: () => {
          toast({ title: "Error", description: "Failed to update document settings.", variant: "destructive" });
        },
      }
    );
  };

  function nextPreview(cfg: RunningNumberConfig) {
    const n = (parseInt(cfg.counter) || 0) + 1;
    return `${cfg.prefix}${String(n)}${cfg.suffix}`;
  }

  const handleTestSmtp = async () => {
    setTestingSmtp(true);
    try {
      const res = await fetch("/api/test-email", { method: "POST", credentials: "include" });
      const data = await res.json();
      if (res.ok) {
        toast({ title: "Connection Successful", description: data.message || "SMTP settings are working correctly." });
      } else {
        toast({ title: "Connection Failed", description: data.error || "Could not connect to SMTP server.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Connection Failed", description: "Could not reach the server. Please try again.", variant: "destructive" });
    } finally {
      setTestingSmtp(false);
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage company preferences and account settings.</p>
      </div>

      <Tabs defaultValue="tax">
        <TabsList className="w-full justify-start border-b rounded-none bg-transparent h-auto p-0 mb-6 gap-0">
          <TabsTrigger
            value="tax"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-3 pt-1 text-sm font-medium gap-2"
          >
            <Percent className="h-4 w-4" />
            Tax
          </TabsTrigger>
          <TabsTrigger
            value="running-numbers"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-3 pt-1 text-sm font-medium gap-2"
          >
            <Hash className="h-4 w-4" />
            Running Numbers
          </TabsTrigger>
          <TabsTrigger
            value="email"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-3 pt-1 text-sm font-medium gap-2"
          >
            <Mail className="h-4 w-4" />
            Email
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger
              value="companies"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-3 pt-1 text-sm font-medium gap-2"
            >
              <Building2 className="h-4 w-4" />
              Companies
            </TabsTrigger>
          )}
          <TabsTrigger
            value="documents"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-3 pt-1 text-sm font-medium gap-2"
          >
            <FileText className="h-4 w-4" />
            Documents
          </TabsTrigger>
          <TabsTrigger
            value="profile"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-3 pt-1 text-sm font-medium gap-2"
          >
            <User className="h-4 w-4" />
            Profile
          </TabsTrigger>
          <TabsTrigger
            value="account"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-3 pt-1 text-sm font-medium gap-2"
          >
            <Shield className="h-4 w-4" />
            Account
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger
              value="maintenance"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-3 pt-1 text-sm font-medium gap-2"
            >
              <Wrench className="h-4 w-4" />
              Maintenance
            </TabsTrigger>
          )}
        </TabsList>

        {/* TAX */}
        <TabsContent value="tax">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Percent className="h-5 w-5 text-primary" />
                Tax Settings
              </CardTitle>
              <CardDescription>
                Configure the GST rate applied to all Purchase Orders, Quotations, and Invoices.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {settingsLoading ? (
                <div className="h-10 bg-muted animate-pulse rounded-md" />
              ) : (
                <div className="space-y-2">
                  <div className="flex items-end gap-3">
                    <div className="max-w-xs space-y-1.5">
                      <Label htmlFor="gstRate">GST Rate (%)</Label>
                      <div className="relative">
                        <Input
                          id="gstRate"
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          value={gstEditing ? gstInput : (settings?.gstRate ?? 9)}
                          onChange={(e) => { setGstEditing(true); setGstInput(e.target.value); }}
                          onFocus={() => { setGstEditing(true); setGstInput(String(settings?.gstRate ?? 9)); }}
                          disabled={!isAdmin}
                          className="pr-8"
                        />
                        <Percent className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                    </div>
                    {isAdmin && (
                      <Button onClick={handleSaveGst} disabled={updateSettings.isPending} className="gap-2">
                        <Save className="h-4 w-4" />
                        {updateSettings.isPending ? "Saving..." : "Save"}
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Current rate: <strong>{settings?.gstRate ?? 9}%</strong> {(settings as any)?.taxLabel ?? "GST"}
                  </p>
                </div>
              )}
              {!isAdmin && (
                <p className="text-xs text-muted-foreground">Only administrators can change the GST rate.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* RUNNING NUMBERS */}
        <TabsContent value="running-numbers">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Hash className="h-5 w-5 text-primary" />
                Running Numbers
              </CardTitle>
              <CardDescription>
                Configure the prefix, starting counter, and suffix for each document type. Pattern: <strong>PREFIX-NNNN</strong> (zero-padded to 4+ digits).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {settingsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-16 bg-muted animate-pulse rounded-md" />)}
                </div>
              ) : (
                <>
                  {([
                    { label: "Purchase Order", state: rnPO, setter: setRnPO },
                    { label: "Quotation", state: rnQT, setter: setRnQT },
                    { label: "Invoice", state: rnINV, setter: setRnINV },
                    { label: "Delivery Order", state: rnDO, setter: setRnDO },
                    { label: "Goods Receipt Note", state: rnGRN, setter: setRnGRN },
                  ] as { label: string; state: RunningNumberConfig; setter: (v: RunningNumberConfig) => void }[]).map(({ label, state, setter }) => (
                    <div key={label} className="rounded-lg border p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{label}</span>
                        <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded font-mono">
                          Next: <strong>{nextPreview(state)}</strong>
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Prefix</Label>
                          <Input
                            value={state.prefix}
                            onChange={e => { setter({ ...state, prefix: e.target.value }); setRnEditing(true); }}
                            disabled={!isAdmin}
                            placeholder="e.g. PO"
                            className="font-mono"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Next Counter</Label>
                          <Input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={state.counter}
                            onChange={e => { const v = e.target.value.replace(/[^0-9]/g, ""); setter({ ...state, counter: v }); setRnEditing(true); }}
                            disabled={!isAdmin}
                            placeholder="e.g. 1000"
                            className="font-mono w-full"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Suffix</Label>
                          <Input
                            value={state.suffix}
                            onChange={e => { setter({ ...state, suffix: e.target.value }); setRnEditing(true); }}
                            disabled={!isAdmin}
                            placeholder="optional"
                            className="font-mono"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center gap-3">
                    {isAdmin && (
                      <Button onClick={handleSaveRunningNumbers} disabled={updateSettings.isPending} className="gap-2">
                        <Save className="h-4 w-4" />
                        {updateSettings.isPending ? "Saving..." : "Save Running Numbers"}
                      </Button>
                    )}
                    {!isAdmin && (
                      <p className="text-xs text-muted-foreground">Only administrators can change running numbers.</p>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* EMAIL */}
        <TabsContent value="email">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-primary" />
                Email (SMTP) Settings
              </CardTitle>
              <CardDescription>
                Configure your outgoing mail server to enable sending documents directly from the app.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {settingsLoading ? (
                <div className="space-y-2">
                  <div className="h-10 bg-muted animate-pulse rounded-md" />
                  <div className="h-10 bg-muted animate-pulse rounded-md" />
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    {settings?.smtpConfigured ? (
                      <><CheckCircle2 className="h-4 w-4 text-emerald-600" /><span className="text-sm text-emerald-600 font-medium">Email is configured and ready</span></>
                    ) : (
                      <><XCircle className="h-4 w-4 text-muted-foreground" /><span className="text-sm text-muted-foreground">Email not yet configured</span></>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="smtpHost">SMTP Host</Label>
                      <Input
                        id="smtpHost"
                        placeholder="smtp.gmail.com"
                        value={smtpHost}
                        onChange={e => { setSmtpEditing(true); setSmtpHost(e.target.value); }}
                        disabled={!isAdmin}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="smtpPort">SMTP Port</Label>
                      <Input
                        id="smtpPort"
                        placeholder="587"
                        value={smtpPort}
                        onChange={e => { setSmtpEditing(true); setSmtpPort(e.target.value); }}
                        disabled={!isAdmin}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="smtpUser">Username / Email</Label>
                    <Input
                      id="smtpUser"
                      placeholder="your@email.com"
                      value={smtpUser}
                      onChange={e => { setSmtpEditing(true); setSmtpUser(e.target.value); }}
                      disabled={!isAdmin}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="smtpPass">Password / App Password</Label>
                    <Input
                      id="smtpPass"
                      type="password"
                      placeholder={settings?.smtpConfigured ? "••••••••  (leave blank to keep current)" : "Enter password"}
                      value={smtpPass}
                      onChange={e => { setSmtpEditing(true); setSmtpPass(e.target.value); }}
                      disabled={!isAdmin}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="smtpFrom">From Address</Label>
                    <Input
                      id="smtpFrom"
                      placeholder="RSV Infotech <noreply@rsvinfotech.com>"
                      value={smtpFrom}
                      onChange={e => { setSmtpEditing(true); setSmtpFrom(e.target.value); }}
                      disabled={!isAdmin}
                    />
                    <p className="text-xs text-muted-foreground">The "From" name and email shown to recipients.</p>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap pt-1">
                    {isAdmin && (
                      <Button onClick={handleSaveSmtp} disabled={updateSettings.isPending} className="gap-2">
                        <Save className="h-4 w-4" />
                        {updateSettings.isPending ? "Saving..." : "Save Email Settings"}
                      </Button>
                    )}
                    {settings?.smtpConfigured && (
                      <Button
                        variant="outline"
                        onClick={handleTestSmtp}
                        disabled={testingSmtp || smtpEditing}
                        className="gap-2"
                      >
                        <Wifi className="h-4 w-4" />
                        {testingSmtp ? "Testing..." : "Test Connection"}
                      </Button>
                    )}
                  </div>
                  {!isAdmin && (
                    <p className="text-xs text-muted-foreground">Only administrators can change email settings.</p>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* PROFILE */}
        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>Your current session details.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 bg-primary/10 text-primary rounded-full flex items-center justify-center">
                  <User className="h-8 w-8" />
                </div>
                <div>
                  <div className="font-semibold text-lg">{user?.username}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground capitalize">{user?.role === "external" ? "External User" : user?.role}</span>
                    {user?.role === "admin" && (
                      <Badge variant="default" className="ml-2 text-xs py-0">System Admin</Badge>
                    )}
                    {user?.role === "external" && (
                      <Badge variant="outline" className="ml-2 text-xs py-0 text-amber-600 border-amber-300 bg-amber-50">External</Badge>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* COMPANIES */}
        <TabsContent value="companies">
          <div className="space-y-6">
            <div className="mb-2">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                Company Information
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Edit the details for each registered company. These appear on all generated PDF documents.
              </p>
            </div>
            {companiesLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => <div key={i} className="h-48 bg-muted animate-pulse rounded-lg" />)}
              </div>
            ) : (
              (companies || []).map(company => (
                <Card key={company.id}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{company.name}</CardTitle>
                    <CardDescription>{company.country === "SG" ? "Singapore" : company.country === "IN" ? "India" : company.country}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label>Company Name</Label>
                        <Input
                          value={getCompanyField(company.id, "name", company.name)}
                          onChange={e => setCompanyField(company.id, "name", e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Registration No.</Label>
                        <Input
                          value={getCompanyField(company.id, "registrationNo", (company as any).registrationNo || "")}
                          onChange={e => setCompanyField(company.id, "registrationNo", e.target.value)}
                          placeholder="e.g. 200812581D"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Address</Label>
                      <Input
                        value={getCompanyField(company.id, "address", (company as any).address || "")}
                        onChange={e => setCompanyField(company.id, "address", e.target.value)}
                        placeholder="Full address"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label>Phone</Label>
                        <Input
                          value={getCompanyField(company.id, "phone", company.phone || "")}
                          onChange={e => setCompanyField(company.id, "phone", e.target.value)}
                          placeholder="+65 6123 4567"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Email</Label>
                        <Input
                          value={getCompanyField(company.id, "email", company.email || "")}
                          onChange={e => setCompanyField(company.id, "email", e.target.value)}
                          placeholder="info@example.com"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end pt-1">
                      <Button
                        onClick={() => handleSaveCompany(company as any)}
                        disabled={savingCompany === company.id}
                        className="gap-2"
                      >
                        <Save className="h-4 w-4" />
                        {savingCompany === company.id ? "Saving..." : "Save Changes"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        {/* DOCUMENTS */}
        <TabsContent value="documents">
          <div className="space-y-5">
            {/* Bank Details */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  Bank Account Details
                </CardTitle>
                <CardDescription>
                  Printed at the bottom of all invoices and quotations.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  id="bankDetails"
                  rows={4}
                  placeholder={"Account No: 1234567890\nAccount Name: Your Company\nBank: Bank Name\nSwift / IFSC: XXXXXXXX"}
                  value={bankDetails}
                  disabled={!isAdmin}
                  onChange={(e) => { setDocsEditing(true); setBankDetails(e.target.value); }}
                />
                <p className="text-xs text-muted-foreground">Each line will appear as a separate line in the PDF.</p>
              </CardContent>
            </Card>

            {/* Invoice T&C */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Invoice Terms &amp; Conditions</CardTitle>
                <CardDescription>
                  Printed at the bottom of <strong>Tax Invoices</strong> only.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  id="termsAndConditions"
                  rows={4}
                  placeholder={"All prices are as per the currency stated on this invoice.\nPayment is due as per the payment terms stated above.\nGoods once sold are not Returnable / Exchangeable."}
                  value={termsAndConditions}
                  disabled={!isAdmin}
                  onChange={(e) => { setDocsEditing(true); setTermsAndConditions(e.target.value); }}
                />
                <p className="text-xs text-muted-foreground">Each line will be prefixed with a bullet point in the PDF.</p>
              </CardContent>
            </Card>

            {/* Quotation T&C */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Quotation Terms &amp; Conditions</CardTitle>
                <CardDescription>
                  Printed at the bottom of <strong>Quotations</strong> only. Leave blank to omit from quotation PDFs.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  id="quotationTerms"
                  rows={4}
                  placeholder={"This quotation is valid for 30 days from the date of issue.\nPrices are subject to change without prior notice.\nDelivery lead time as stated above is estimated only."}
                  value={quotationTerms}
                  disabled={!isAdmin}
                  onChange={(e) => { setDocsEditing(true); setQuotationTerms(e.target.value); }}
                />
                <p className="text-xs text-muted-foreground">Each line will be prefixed with a bullet point in the PDF.</p>
              </CardContent>
            </Card>

            {isAdmin && (
              <div className="flex justify-end">
                <Button onClick={handleSaveDocs} className="gap-2">
                  <Save className="h-4 w-4" />
                  Save Document Settings
                </Button>
              </div>
            )}
            {!isAdmin && (
              <p className="text-xs text-muted-foreground">Only administrators can change the document settings.</p>
            )}
          </div>
        </TabsContent>

        {/* MAINTENANCE */}
        {isAdmin && (
          <TabsContent value="maintenance">
            <div className="space-y-4">
              <Card className={maintEnabled ? "border-amber-300 bg-amber-50/50 dark:bg-amber-950/10" : ""}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Wrench className="h-5 w-5 text-primary" />
                    Maintenance Mode
                  </CardTitle>
                  <CardDescription>
                    When enabled, all non-admin users will see a maintenance page instead of the application.
                    Admins can still access and use the app normally.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="flex items-center justify-between p-4 rounded-lg border bg-background">
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        Enable Maintenance Mode
                        {maintEnabled && (
                          <Badge className="bg-amber-500 hover:bg-amber-600 text-xs">Active</Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground mt-0.5">
                        {maintEnabled
                          ? "Users are currently seeing the maintenance page."
                          : "App is accessible to all users."}
                      </div>
                    </div>
                    <Switch
                      checked={maintEnabled}
                      onCheckedChange={setMaintEnabled}
                    />
                  </div>

                  {maintEnabled && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 px-4 py-3 flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                      <p className="text-sm text-amber-800 dark:text-amber-200">
                        <strong>Maintenance mode is ON.</strong> All regular users are currently blocked from accessing the application.
                        Remember to turn this off when maintenance is complete.
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="maintStart">Scheduled Start</Label>
                      <Input
                        id="maintStart"
                        type="datetime-local"
                        value={maintStart}
                        onChange={e => setMaintStart(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">When the maintenance window begins.</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="maintEnd">Scheduled End</Label>
                      <Input
                        id="maintEnd"
                        type="datetime-local"
                        value={maintEnd}
                        onChange={e => setMaintEnd(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">Shown as countdown on the maintenance page.</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="maintMessage">Message to Users</Label>
                    <Textarea
                      id="maintMessage"
                      rows={3}
                      placeholder="We are currently performing scheduled maintenance to improve our services. We apologize for any inconvenience."
                      value={maintMessage}
                      onChange={e => setMaintMessage(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">This message will be shown on the maintenance page.</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="maintContact">Support Email (optional)</Label>
                    <Input
                      id="maintContact"
                      type="email"
                      placeholder="support@example.com"
                      value={maintContact}
                      onChange={e => setMaintContact(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">Users can click this to email support during maintenance.</p>
                  </div>

                  <div className="flex justify-end pt-1">
                    <Button onClick={handleSaveMaintenance} disabled={maintSaving} className="gap-2">
                      <Save className="h-4 w-4" />
                      {maintSaving ? "Saving..." : "Save Maintenance Settings"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        )}

        {/* ACCOUNT */}
        <TabsContent value="account">
          <Card>
            <CardHeader>
              <CardTitle className="text-destructive">Danger Zone</CardTitle>
              <CardDescription>Actions that affect your current session.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between border rounded-md p-4 border-destructive/20 bg-destructive/5">
                <div>
                  <div className="font-medium text-destructive">End Session</div>
                  <div className="text-sm text-destructive/80 mt-1">Sign out of your current account.</div>
                </div>
                <Button variant="destructive" onClick={() => logout()} className="gap-2">
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
