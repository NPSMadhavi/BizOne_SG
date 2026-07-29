import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/auth-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LogOut, User, Shield, Percent, Save, Mail, CheckCircle2, XCircle, Wifi, Hash, Building2, FileText, Wrench, ToggleLeft, ToggleRight, AlertTriangle, Info, Plus, Trash2, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Switch } from "@/components/ui/switch";
import { useGetSettings, useUpdateSettings, getGetSettingsQueryKey, useListCompanies, getListCompaniesQueryKey } from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

type RunningNumberConfig = {
  prefix: string;
  counter: string;
  suffix: string;
};

export default function Settings() {
  const { user, logout, isAdmin, selectedCompany } = useAuth();
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
    name: string; address: string; phone: string; email: string; registrationNo: string; gstRegNo: string; logoUrl: string;
  }>>({});
  const [savingCompany, setSavingCompany] = useState<number | null>(null);
  const [deletingCompany, setDeletingCompany] = useState<number | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const [addCompanyOpen, setAddCompanyOpen] = useState(false);
  const [newCompany, setNewCompany] = useState({ name: "", country: "SG", registrationNo: "", gstRegNo: "", address: "", email: "", phone: "", logoUrl: "" });
  const [addingCompany, setAddingCompany] = useState(false);

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
        gstRegNo: getCompanyField(company.id, "gstRegNo", (company as any).gstRegNo || ""),
        logoUrl: getCompanyField(company.id, "logoUrl", (company as any).logoUrl || ""),
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

  const handleAddCompany = async () => {
    if (!newCompany.name.trim()) {
      toast({ title: "Name required", description: "Please enter a company name.", variant: "destructive" });
      return;
    }
    setAddingCompany(true);
    try {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(newCompany),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create company");
      queryClient.invalidateQueries({ queryKey: getListCompaniesQueryKey() });
      setAddCompanyOpen(false);
      setNewCompany({ name: "", country: "SG", registrationNo: "", gstRegNo: "", address: "", email: "", phone: "", logoUrl: "" });
      toast({ title: "Company created", description: `${data.name} has been added. Switch to it from the sidebar to configure its settings.` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to create company.", variant: "destructive" });
    } finally {
      setAddingCompany(false);
    }
  };

  const handleDeleteCompany = async (id: number) => {
    setDeletingCompany(id);
    try {
      const res = await fetch(`/api/companies/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete");
      }
      queryClient.invalidateQueries({ queryKey: getListCompaniesQueryKey() });
      setDeleteConfirmId(null);
      toast({ title: "Company deleted", description: "The company and all its data have been removed." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setDeletingCompany(null);
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
  const [rnCN, setRnCN] = useState<RunningNumberConfig>({ prefix: "CN", counter: "1", suffix: "" });
  const [rnPI, setRnPI] = useState<RunningNumberConfig>({ prefix: "PI", counter: "1", suffix: "" });
  const [rnPV, setRnPV] = useState<RunningNumberConfig>({ prefix: "PV", counter: "1", suffix: "" });
  const [rnEditing, setRnEditing] = useState(false);

  const [maintEnabled, setMaintEnabled] = useState(false);
  const [maintStart, setMaintStart] = useState("");
  const [maintEnd, setMaintEnd] = useState("");
  const [maintMessage, setMaintMessage] = useState("");
  const [maintContact, setMaintContact] = useState("");
  const [maintSaving, setMaintSaving] = useState(false);
  const [maintLoaded, setMaintLoaded] = useState(false);

  const [workflowVerifierId, setWorkflowVerifierId] = useState<string>("");
  const [workflowApproverId, setWorkflowApproverId] = useState<string>("");
  const [workflowPaidById, setWorkflowPaidById] = useState<string>("");
  const [workflowSaving, setWorkflowSaving] = useState(false);

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
      setRnCN({ prefix: (settings as any).cnPrefix ?? "CN", counter: String((settings as any).cnCounter ?? 1), suffix: (settings as any).cnSuffix ?? "" });
      setRnPI({ prefix: (settings as any).piPrefix ?? "PI", counter: String((settings as any).piCounter ?? 1), suffix: (settings as any).piSuffix ?? "" });
      setRnPV({ prefix: (settings as any).pvPrefix ?? "PV", counter: String((settings as any).pvCounter ?? 1), suffix: (settings as any).pvSuffix ?? "" });
    }
    if (settings && !docsEditing) {
      setBankDetails((settings as any).bankDetails ?? "");
      setTermsAndConditions((settings as any).termsAndConditions ?? "");
      setQuotationTerms((settings as any).quotationTerms ?? "");
    }
    if (settings) {
      if ((settings as any).defaultVerifierId) setWorkflowVerifierId(String((settings as any).defaultVerifierId));
      if ((settings as any).defaultApproverId) setWorkflowApproverId(String((settings as any).defaultApproverId));
      if ((settings as any).defaultPaidById) setWorkflowPaidById(String((settings as any).defaultPaidById));
    }
  }, [settings]);

  const updateSettings = useUpdateSettings();

  const { data: companyUsers = [] } = useQuery<any[]>({
    queryKey: ["company-users"],
    queryFn: async () => {
      const r = await fetch("/api/company-users", { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
  });

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
          cnPrefix: rnCN.prefix, cnCounter: parseInt(rnCN.counter) || 1, cnSuffix: rnCN.suffix,
          piPrefix: rnPI.prefix, piCounter: parseInt(rnPI.counter) || 1, piSuffix: rnPI.suffix,
          pvPrefix: rnPV.prefix, pvCounter: parseInt(rnPV.counter) || 1, pvSuffix: rnPV.suffix,
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

  const handleSaveWorkflow = async () => {
    setWorkflowSaving(true);
    try {
      const r = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          defaultVerifierId: workflowVerifierId ? Number(workflowVerifierId) : null,
          defaultApproverId: workflowApproverId ? Number(workflowApproverId) : null,
          defaultPaidById: workflowPaidById ? Number(workflowPaidById) : null,
        }),
      });
      if (!r.ok) throw new Error("Failed");
      queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
      toast({ title: "Saved", description: "Default workflow signatories updated." });
    } catch {
      toast({ title: "Error", description: "Failed to save workflow settings.", variant: "destructive" });
    } finally {
      setWorkflowSaving(false);
    }
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

      {selectedCompany && (
        <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 mb-6">
          <Building2 className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-blue-900">
              Configuring: <span className="font-bold">{selectedCompany.name}</span>
            </p>
            <p className="text-xs text-blue-700 mt-0.5">
              Tax rate, SMTP email, running numbers, and document defaults on this page apply to <strong>{selectedCompany.name}</strong> only.
              To configure another company, switch the active company from the sidebar first.
            </p>
          </div>
          <Badge variant="outline" className="shrink-0 border-blue-300 text-blue-700 bg-white text-xs">
            {selectedCompany.country ?? "Singapore"}
          </Badge>
        </div>
      )}

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
              value="workflow"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-3 pt-1 text-sm font-medium gap-2"
            >
              <Users className="h-4 w-4" />
              Workflow
            </TabsTrigger>
          )}
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
                    { label: "Invoice (Tax Invoice)", state: rnINV, setter: setRnINV },
                    { label: "Delivery Order", state: rnDO, setter: setRnDO },
                    { label: "Goods Receipt Note", state: rnGRN, setter: setRnGRN },
                    { label: "Credit Note", state: rnCN, setter: setRnCN },
                    { label: "Proforma Invoice / Vendor PI", state: rnPI, setter: setRnPI },
                    { label: "Payment / Project Voucher", state: rnPV, setter: setRnPV },
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

        {/* WORKFLOW */}
        <TabsContent value="workflow">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                Approval Workflow Defaults
              </CardTitle>
              <CardDescription>
                Set the default signatories for new payment vouchers in this company.
                These can be overridden per-voucher at creation time.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                <div>
                  <Label className="text-sm font-medium">Default Verifier</Label>
                  <p className="text-xs text-muted-foreground mb-2">User who verifies vouchers before approval</p>
                  <Select value={workflowVerifierId || "none"} onValueChange={v => setWorkflowVerifierId(v === "none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— None (skip verification step) —</SelectItem>
                      {(companyUsers as any[]).map((u: any) => (
                        <SelectItem key={u.id} value={String(u.id)}>
                          {u.username}{u.role === "admin" ? " (admin)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm font-medium">Default Approver</Label>
                  <p className="text-xs text-muted-foreground mb-2">User who approves vouchers for payment</p>
                  <Select value={workflowApproverId || "none"} onValueChange={v => setWorkflowApproverId(v === "none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— None (skip approval step) —</SelectItem>
                      {(companyUsers as any[]).map((u: any) => (
                        <SelectItem key={u.id} value={String(u.id)}>
                          {u.username}{u.role === "admin" ? " (admin)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm font-medium">Default Paid By</Label>
                  <p className="text-xs text-muted-foreground mb-2">User responsible for processing payment</p>
                  <Select value={workflowPaidById || "none"} onValueChange={v => setWorkflowPaidById(v === "none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— None —</SelectItem>
                      {(companyUsers as any[]).map((u: any) => (
                        <SelectItem key={u.id} value={String(u.id)}>
                          {u.username}{u.role === "admin" ? " (admin)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="rounded-lg bg-muted/40 border border-border p-4 text-sm text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">How the workflow works:</p>
                <ol className="list-decimal list-inside space-y-0.5 ml-1">
                  <li>Voucher is created → assigned status based on signatories</li>
                  <li>Verifier reviews → clicks Verify → moves to Pending Approval</li>
                  <li>Approver reviews → clicks Approve → moves to Approved</li>
                  <li>Paid By user marks payment → voucher becomes Paid</li>
                </ol>
                <p className="mt-2 text-xs">Steps are skipped automatically when the signatory is the same as the creator or not set.</p>
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSaveWorkflow} disabled={workflowSaving} className="gap-2">
                  <Save className="h-4 w-4" />
                  {workflowSaving ? "Saving…" : "Save Workflow Defaults"}
                </Button>
              </div>
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
                Configure the outgoing mail server for <strong>{selectedCompany?.name ?? "this company"}</strong>. All documents sent while this company is active will use these SMTP credentials.
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
            <div className="flex items-start justify-between mb-2">
              <div>
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-primary" />
                  Company Information
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Edit details for each registered company. These appear on all generated PDF documents.
                </p>
              </div>
              {isAdmin && (
                <Button onClick={() => setAddCompanyOpen(true)} className="gap-2 shrink-0">
                  <Plus className="h-4 w-4" />
                  Add Company
                </Button>
              )}
            </div>
            {companiesLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => <div key={i} className="h-48 bg-muted animate-pulse rounded-lg" />)}
              </div>
            ) : (
              (companies || []).map(company => (
                <Card key={company.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base">{company.name}</CardTitle>
                        <CardDescription>
                          {company.country === "SG" ? "🇸🇬 Singapore" : company.country === "IN" ? "🇮🇳 India" : company.country}
                        </CardDescription>
                      </div>
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5"
                          onClick={() => setDeleteConfirmId(company.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </Button>
                      )}
                    </div>
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
                      <div className="space-y-1.5">
                        <Label>GST Reg. No. <span className="text-xs text-muted-foreground font-normal">(if different from Reg. No.)</span></Label>
                        <Input
                          value={getCompanyField(company.id, "gstRegNo", (company as any).gstRegNo || "")}
                          onChange={e => setCompanyField(company.id, "gstRegNo", e.target.value)}
                          placeholder="e.g. M90365727T"
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
                    {/* Logo upload */}
                    <div className="space-y-2">
                      <Label>Company Logo <span className="text-xs text-muted-foreground font-normal">(shown in sidebar)</span></Label>
                      <div className="flex items-center gap-4">
                        {(companyEdits[company.id]?.logoUrl ?? (company as any).logoUrl) ? (
                          <div className="relative group">
                            <img
                              src={companyEdits[company.id]?.logoUrl ?? (company as any).logoUrl}
                              alt="Logo preview"
                              className="h-12 w-auto object-contain rounded border bg-white p-1 max-w-[120px]"
                            />
                            <button
                              type="button"
                              onClick={() => setCompanyField(company.id, "logoUrl", "")}
                              className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-destructive text-white text-[10px] font-bold flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Remove logo"
                            >×</button>
                          </div>
                        ) : (
                          <div className="h-12 w-24 rounded border border-dashed bg-muted/40 flex items-center justify-center text-xs text-muted-foreground">No logo</div>
                        )}
                        <label className="cursor-pointer">
                          <span className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors">
                            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                            Upload Logo
                          </span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={e => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              const reader = new FileReader();
                              reader.onload = ev => setCompanyField(company.id, "logoUrl", ev.target?.result as string);
                              reader.readAsDataURL(file);
                              e.target.value = "";
                            }}
                          />
                        </label>
                        <span className="text-xs text-muted-foreground">PNG, JPG, SVG — max 2 MB</span>
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

          {/* Add Company Dialog */}
          <Dialog open={addCompanyOpen} onOpenChange={setAddCompanyOpen}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-primary" />
                  Add New Company
                </DialogTitle>
                <DialogDescription>
                  Creates a new company with its own isolated settings, SMTP, running numbers, GST rate, and documents. All admin users will be automatically assigned to it.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5 col-span-2">
                    <Label htmlFor="nc-name">Company Name <span className="text-destructive">*</span></Label>
                    <Input
                      id="nc-name"
                      placeholder="e.g. My Company Pte. Ltd."
                      value={newCompany.name}
                      onChange={e => setNewCompany(p => ({ ...p, name: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="nc-country">Country <span className="text-destructive">*</span></Label>
                    <Select value={newCompany.country} onValueChange={v => setNewCompany(p => ({ ...p, country: v }))}>
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
                        <SelectItem value="OTHER">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="nc-reg">Registration No.</Label>
                    <Input
                      id="nc-reg"
                      placeholder="e.g. 200812581D"
                      value={newCompany.registrationNo}
                      onChange={e => setNewCompany(p => ({ ...p, registrationNo: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="nc-gstreg">GST Reg. No. <span className="text-xs text-muted-foreground font-normal">(if different)</span></Label>
                    <Input
                      id="nc-gstreg"
                      placeholder="e.g. M90365727T"
                      value={newCompany.gstRegNo}
                      onChange={e => setNewCompany(p => ({ ...p, gstRegNo: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5 col-span-2">
                    <Label htmlFor="nc-address">Address</Label>
                    <Input
                      id="nc-address"
                      placeholder="Full registered address"
                      value={newCompany.address}
                      onChange={e => setNewCompany(p => ({ ...p, address: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="nc-email">Email</Label>
                    <Input
                      id="nc-email"
                      type="email"
                      placeholder="info@company.com"
                      value={newCompany.email}
                      onChange={e => setNewCompany(p => ({ ...p, email: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="nc-phone">Phone</Label>
                    <Input
                      id="nc-phone"
                      placeholder="+65 6123 4567"
                      value={newCompany.phone}
                      onChange={e => setNewCompany(p => ({ ...p, phone: e.target.value }))}
                    />
                  </div>
                </div>
                {/* Logo upload for new company */}
                <div className="space-y-2">
                  <Label>Company Logo <span className="text-xs text-muted-foreground font-normal">optional — shown in sidebar</span></Label>
                  <div className="flex items-center gap-3">
                    {newCompany.logoUrl ? (
                      <div className="relative group">
                        <img src={newCompany.logoUrl} alt="Logo preview" className="h-10 w-auto object-contain rounded border bg-white p-1 max-w-[100px]" />
                        <button type="button" onClick={() => setNewCompany(p => ({ ...p, logoUrl: "" }))}
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
                        reader.onload = ev => setNewCompany(p => ({ ...p, logoUrl: ev.target?.result as string }));
                        reader.readAsDataURL(file); e.target.value = "";
                      }} />
                    </label>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground bg-muted rounded p-2">
                  Default GST rate will be set to <strong>{newCompany.country === "IN" ? "18%" : "9%"}</strong> based on the selected country. You can change it afterwards in Settings → Tax.
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddCompanyOpen(false)} disabled={addingCompany}>Cancel</Button>
                <Button onClick={handleAddCompany} disabled={addingCompany || !newCompany.name.trim()} className="gap-2">
                  <Plus className="h-4 w-4" />
                  {addingCompany ? "Creating..." : "Create Company"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Delete Confirmation Dialog */}
          <Dialog open={deleteConfirmId !== null} onOpenChange={open => { if (!open) setDeleteConfirmId(null); }}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-destructive">
                  <Trash2 className="h-5 w-5" />
                  Delete Company
                </DialogTitle>
                <DialogDescription>
                  This will permanently delete <strong>{(companies || []).find(c => c.id === deleteConfirmId)?.name}</strong> and all its documents, settings, vendors, customers, and stock data. This cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteConfirmId(null)} disabled={deletingCompany !== null}>Cancel</Button>
                <Button
                  variant="destructive"
                  onClick={() => deleteConfirmId && handleDeleteCompany(deleteConfirmId)}
                  disabled={deletingCompany !== null}
                  className="gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  {deletingCompany !== null ? "Deleting..." : "Yes, Delete"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
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
                <RichTextEditor
                  value={bankDetails}
                  onChange={(v) => { setDocsEditing(true); setBankDetails(v); }}
                  placeholder="Account No: 1234567890&#10;Account Name: Your Company&#10;Bank: Bank Name&#10;Swift / IFSC: XXXXXXXX"
                  disabled={!isAdmin}
                  expandable={false}
                />
                <p className="text-xs text-muted-foreground">Formatting (bold, lists) will render in the PDF exactly as typed here.</p>
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
                <RichTextEditor
                  value={termsAndConditions}
                  onChange={(v) => { setDocsEditing(true); setTermsAndConditions(v); }}
                  placeholder="Use the toolbar to add numbered lists, bullet points, bold text, etc."
                  disabled={!isAdmin}
                  expandable={false}
                />
                <p className="text-xs text-muted-foreground">Formatting (bold, numbered lists, bullets) will render in the PDF exactly as typed here.</p>
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
                <RichTextEditor
                  value={quotationTerms}
                  onChange={(v) => { setDocsEditing(true); setQuotationTerms(v); }}
                  placeholder="Use the toolbar to add numbered lists, bullet points, bold text, etc."
                  disabled={!isAdmin}
                  expandable={false}
                />
                <p className="text-xs text-muted-foreground">Formatting (bold, numbered lists, bullets) will render in the PDF exactly as typed here.</p>
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
