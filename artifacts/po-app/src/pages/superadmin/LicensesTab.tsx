import React, { useState, useEffect } from "react";
import {
  Key,
  Search,
  Plus,
  RefreshCw,
  Sparkles,
  Calendar,
  Building2,
  CheckCircle,
  AlertTriangle,
  XCircle,
  RotateCcw,
  Edit,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  Sliders,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  getLicenses,
  getCompanies,
  getPlans,
  generateNewLicenseKey,
  createLicense,
  updateLicense,
  updateLicenseStatus,
} from "./api";
import type {
  SuperAdminLicense,
  SuperAdminCompany,
  SuperAdminPlan,
} from "./types";

interface LicensesTabProps {
  onRenewLicense: (license: SuperAdminLicense) => void;
  preselectedCompanyForNewLicense?: SuperAdminCompany | null;
  onClearPreselectedCompany?: () => void;
}

export function LicensesTab({
  onRenewLicense,
  preselectedCompanyForNewLicense,
  onClearPreselectedCompany,
}: LicensesTabProps) {
  const [licenses, setLicenses] = useState<SuperAdminLicense[]>([]);
  const [companies, setCompanies] = useState<SuperAdminCompany[]>([]);
  const [plans, setPlans] = useState<SuperAdminPlan[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(false);

  // Create Modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | "">("");
  const [selectedPlanId, setSelectedPlanId] = useState<number | "">("");
  const [planType, setPlanType] = useState("Starter ERP (SG)");
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [expiryDate, setExpiryDate] = useState("");
  const [isRenewable, setIsRenewable] = useState(true);
  const [createStatus, setCreateStatus] = useState("Active");
  const [paymentStatus, setPaymentStatus] = useState("Paid");
  const [maxUsers, setMaxUsers] = useState<number>(5);
  const [notes, setNotes] = useState("");
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);

  // Edit Modal
  const [editingLicense, setEditingLicense] = useState<SuperAdminLicense | null>(null);
  const [editStatus, setEditStatus] = useState("Active");
  const [editExpiryDate, setEditExpiryDate] = useState("");
  const [editPaymentStatus, setEditPaymentStatus] = useState("Paid");
  const [editMaxUsers, setEditMaxUsers] = useState<number>(5);
  const [editIsRenewable, setEditIsRenewable] = useState(true);
  const [editNotes, setEditNotes] = useState("");
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  const fetchLicenses = async () => {
    setIsLoading(true);
    try {
      const res = await getLicenses({
        search: search.trim() || undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
        page,
        limit: 10,
      });
      setLicenses(res.licenses || []);
      setTotal(res.total || 0);
      setTotalPages(res.totalPages || 1);
    } catch (err) {
      console.error("Failed to load licenses:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchDependencies = async () => {
    try {
      const [compRes, plansRes] = await Promise.all([
        getCompanies({ limit: 100 }),
        getPlans(),
      ]);
      setCompanies(compRes.companies || []);
      setPlans(plansRes.plans || []);
    } catch (err) {
      console.error("Failed to load plans or companies:", err);
    }
  };

  useEffect(() => {
    fetchLicenses();
  }, [page, statusFilter]);

  useEffect(() => {
    fetchDependencies();
  }, []);

  // Handle preselected company from other tabs
  useEffect(() => {
    if (preselectedCompanyForNewLicense) {
      setSelectedCompanyId(preselectedCompanyForNewLicense.id);
      handleOpenCreateModal(preselectedCompanyForNewLicense.id);
      if (onClearPreselectedCompany) onClearPreselectedCompany();
    }
  }, [preselectedCompanyForNewLicense]);

  const handleOpenCreateModal = async (prefillCompanyId?: number) => {
    setIsCreateOpen(true);
    if (prefillCompanyId) setSelectedCompanyId(prefillCompanyId);
    try {
      const keyRes = await generateNewLicenseKey("BIZ-SG");
      setNewKey(keyRes.licenseKey);
    } catch {
      setNewKey("BIZ-SG-XXXX-XXXX-XXXX");
    }

    const defaultExpiry = new Date();
    defaultExpiry.setFullYear(defaultExpiry.getFullYear() + 1);
    setExpiryDate(defaultExpiry.toISOString().slice(0, 10));

    if (plans.length > 0) {
      const p = plans[0];
      setSelectedPlanId(p.id);
      setPlanType(p.name);
      setMaxUsers(p.maxUsers);
    }
  };

  const handlePlanSelectChange = (planIdStr: string) => {
    const pId = Number(planIdStr);
    setSelectedPlanId(pId);
    const found = plans.find((p) => p.id === pId);
    if (found) {
      setPlanType(found.name);
      setMaxUsers(found.maxUsers);
      const d = new Date(purchaseDate || Date.now());
      d.setDate(d.getDate() + (found.durationDays || 365));
      setExpiryDate(d.toISOString().slice(0, 10));
    }
  };

  const handleRegenerateKey = async () => {
    try {
      const res = await generateNewLicenseKey("BIZ-SG");
      setNewKey(res.licenseKey);
    } catch (err) {
      console.error("Failed to generate key:", err);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompanyId) {
      alert("Please select a target registered company.");
      return;
    }
    if (!expiryDate) {
      alert("Please set an expiry date.");
      return;
    }

    setIsSubmittingCreate(true);
    try {
      const foundPlan = plans.find((p) => p.id === Number(selectedPlanId));
      await createLicense({
        licenseKey: newKey.trim() || undefined,
        companyId: Number(selectedCompanyId),
        planId: selectedPlanId ? Number(selectedPlanId) : null,
        planType: planType || "Standard ERP",
        purchaseDate,
        expiryDate,
        isRenewable,
        status: createStatus,
        paymentStatus,
        maxUsers: Number(maxUsers) || 5,
        enabledModules: foundPlan?.modules || [],
        notes,
      });

      setIsCreateOpen(false);
      fetchLicenses();
    } catch (err: any) {
      alert(err?.message || "Failed to create license");
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  const handleOpenEditModal = (lic: SuperAdminLicense) => {
    setEditingLicense(lic);
    setEditStatus(lic.status);
    setEditExpiryDate(lic.expiryDate);
    setEditPaymentStatus(lic.paymentStatus);
    setEditMaxUsers(lic.maxUsers);
    setEditIsRenewable(lic.isRenewable);
    setEditNotes(lic.notes || "");
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLicense) return;

    setIsSubmittingEdit(true);
    try {
      await updateLicense(editingLicense.id, {
        status: editStatus,
        expiryDate: editExpiryDate,
        paymentStatus: editPaymentStatus,
        maxUsers: Number(editMaxUsers) || 5,
        isRenewable: editIsRenewable,
        notes: editNotes,
      });

      setEditingLicense(null);
      fetchLicenses();
    } catch (err: any) {
      alert(err?.message || "Failed to update license");
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const handleToggleStatus = async (lic: SuperAdminLicense, targetStatus: string) => {
    try {
      await updateLicenseStatus(lic.id, targetStatus, `Status updated to ${targetStatus} from Super Admin portal`);
      fetchLicenses();
    } catch (err: any) {
      alert(err?.message || "Failed to update status");
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case "active":
        return <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30">Active</Badge>;
      case "expired":
        return <Badge className="bg-red-500/15 text-red-600 border-red-500/30">Expired</Badge>;
      case "suspended":
        return <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30">Suspended</Badge>;
      case "pending":
        return <Badge className="bg-blue-500/15 text-blue-600 border-blue-500/30">Pending</Badge>;
      case "revoked":
        return <Badge className="bg-zinc-500/15 text-zinc-600 border-zinc-500/30">Revoked</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Search, Filter & Create Bar */}
      <Card className="border border-slate-200/80 dark:border-slate-800 shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search by license key, company name, or plan type..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setPage(1);
                    fetchLicenses();
                  }
                }}
                className="pl-9 text-xs h-9 bg-slate-50/50 dark:bg-slate-900"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="text-xs h-9 px-3 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none"
              >
                <option value="all">All Statuses</option>
                <option value="Active">Active</option>
                <option value="Expired">Expired</option>
                <option value="Suspended">Suspended</option>
                <option value="Pending">Pending</option>
                <option value="Revoked">Revoked</option>
              </select>

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setPage(1);
                  fetchLicenses();
                }}
                className="text-xs h-9 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
              </Button>

              <Button
                size="sm"
                onClick={() => handleOpenCreateModal()}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs h-9 shadow-sm cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Create New License
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Licenses Table */}
      <Card className="border border-slate-200/80 dark:border-slate-800 shadow-sm">
        <CardHeader className="p-5 pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold">License Directory ({total})</CardTitle>
              <CardDescription className="text-xs">
                Master enterprise licenses issued to Singapore tenant businesses
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center space-y-2">
              <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-slate-500">Loading licenses...</p>
            </div>
          ) : licenses.length === 0 ? (
            <div className="py-16 text-center text-xs text-slate-500">
              No licenses found matching your filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/75 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border-y border-slate-200/80 dark:border-slate-800">
                  <tr>
                    <th className="py-3 px-4 font-medium">License Key</th>
                    <th className="py-3 px-4 font-medium">Company</th>
                    <th className="py-3 px-4 font-medium">Plan Type</th>
                    <th className="py-3 px-4 font-medium">Purchase / Expiry</th>
                    <th className="py-3 px-4 font-medium">Payment</th>
                    <th className="py-3 px-4 font-medium">Status</th>
                    <th className="py-3 px-4 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {licenses.map((lic) => {
                    const expiry = new Date(lic.expiryDate);
                    const today = new Date();
                    const diffDays = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                    const isOverdue = diffDays < 0;

                    return (
                      <tr
                        key={lic.id}
                        className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="py-3.5 px-4 font-mono">
                          <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                            <Key className="w-3.5 h-3.5 text-indigo-500" />
                            <span>{lic.licenseKey}</span>
                          </div>
                          <div className="text-[10px] text-slate-400 font-sans mt-0.5">
                            Max Users: {lic.maxUsers === -1 ? "Unlimited" : lic.maxUsers} • {lic.isRenewable ? "Renewable" : "Non-Renewable"}
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="font-medium text-slate-900 dark:text-slate-100 flex items-center gap-1">
                            <Building2 className="w-3 h-3 text-slate-400" />
                            <span>{lic.companyName || `Company #${lic.companyId}`}</span>
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {lic.companyEmail || (lic.companySlug ? `slug: ${lic.companySlug}` : "—")}
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <span className="font-medium text-slate-800 dark:text-slate-200">
                            {lic.planType}
                          </span>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="space-y-0.5">
                            <div className="text-[11px] text-slate-700 dark:text-slate-300 font-mono">
                              Exp: {lic.expiryDate}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {isOverdue ? (
                                <span className="text-red-500 font-medium">Expired {Math.abs(diffDays)}d ago</span>
                              ) : diffDays <= 30 ? (
                                <span className="text-orange-500 font-medium">{diffDays} days left</span>
                              ) : (
                                <span>{diffDays} days left</span>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            lic.paymentStatus === "Paid"
                              ? "bg-emerald-500/15 text-emerald-600"
                              : lic.paymentStatus === "Pending"
                              ? "bg-amber-500/15 text-amber-600"
                              : "bg-red-500/15 text-red-600"
                          }`}>
                            {lic.paymentStatus}
                          </span>
                        </td>

                        <td className="py-3.5 px-4">
                          {getStatusBadge(lic.status)}
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => onRenewLicense(lic)}
                              className="text-xs h-7 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-900 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 cursor-pointer"
                            >
                              <RotateCcw className="w-3 h-3 mr-1" />
                              Renew
                            </Button>

                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenEditModal(lic)}
                              className="text-xs h-7 cursor-pointer"
                            >
                              <Edit className="w-3 h-3" />
                            </Button>

                            {lic.status === "Active" ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleToggleStatus(lic, "Suspended")}
                                className="text-xs h-7 text-amber-600 hover:text-amber-700 cursor-pointer"
                                title="Suspend License"
                              >
                                Suspend
                              </Button>
                            ) : lic.status === "Suspended" ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleToggleStatus(lic, "Active")}
                                className="text-xs h-7 text-emerald-600 hover:text-emerald-700 cursor-pointer"
                                title="Activate License"
                              >
                                Activate
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          <div className="p-4 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
            <div>
              Showing page <span className="font-medium text-slate-800 dark:text-slate-200">{page}</span> of{" "}
              <span className="font-medium text-slate-800 dark:text-slate-200">{totalPages}</span> ({total} licenses)
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || isLoading}
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                className="h-7 text-xs px-2.5 cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || isLoading}
                onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                className="h-7 text-xs px-2.5 cursor-pointer"
              >
                Next <ChevronRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Create License Modal */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Key className="w-5 h-5 text-indigo-600" />
              Create & Issue New License
            </DialogTitle>
            <DialogDescription className="text-xs">
              Provision a verified Singapore ERP license key for a registered tenant
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateSubmit} className="space-y-4 py-2 text-xs">
            {/* License Key Field with Auto-Generator */}
            <div className="space-y-1.5">
              <Label className="text-xs">License Key Number</Label>
              <div className="flex gap-2">
                <Input
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  placeholder="BIZ-SG-XXXX-XXXX-XXXX"
                  required
                  className="font-mono text-xs uppercase h-9"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleRegenerateKey}
                  className="h-9 px-3 text-xs cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 mr-1 text-indigo-500" />
                  Generate
                </Button>
              </div>
            </div>

            {/* Target Company */}
            <div className="space-y-1.5">
              <Label className="text-xs">Target Registered Company</Label>
              <select
                value={selectedCompanyId}
                onChange={(e) => setSelectedCompanyId(Number(e.target.value))}
                required
                className="w-full text-xs h-9 px-3 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
              >
                <option value="">-- Select Registered Company --</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} (slug: {c.slug}) {c.license?.status ? `[Current: ${c.license.status}]` : "[No License]"}
                  </option>
                ))}
              </select>
            </div>

            {/* Plan Selector */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Plan Type</Label>
                <select
                  value={selectedPlanId}
                  onChange={(e) => handlePlanSelectChange(e.target.value)}
                  className="w-full text-xs h-9 px-3 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
                >
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.duration})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Max User Accounts</Label>
                <Input
                  type="number"
                  value={maxUsers}
                  onChange={(e) => setMaxUsers(Number(e.target.value))}
                  placeholder="5 (-1 for unlimited)"
                  className="text-xs h-9"
                />
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Purchase Date</Label>
                <Input
                  type="date"
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  required
                  className="text-xs h-9"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Expiry Date</Label>
                <Input
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  required
                  className="text-xs h-9"
                />
              </div>
            </div>

            {/* Status & Payment */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">License Status</Label>
                <select
                  value={createStatus}
                  onChange={(e) => setCreateStatus(e.target.value)}
                  className="w-full text-xs h-9 px-3 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
                >
                  <option value="Active">Active</option>
                  <option value="Pending">Pending</option>
                  <option value="Suspended">Suspended</option>
                  <option value="Revoked">Revoked</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Payment Status</Label>
                <select
                  value={paymentStatus}
                  onChange={(e) => setPaymentStatus(e.target.value)}
                  className="w-full text-xs h-9 px-3 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
                >
                  <option value="Paid">Paid</option>
                  <option value="Pending">Pending</option>
                  <option value="Overdue">Overdue</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>
            </div>

            {/* Renewable Toggle */}
            <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-800">
              <div>
                <span className="font-medium text-slate-800 dark:text-slate-200 block">Allow License Renewals</span>
                <span className="text-[11px] text-slate-400">Company can be renewed without issuing a new key</span>
              </div>
              <Switch checked={isRenewable} onCheckedChange={setIsRenewable} />
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label className="text-xs">Notes / Special Terms</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Contract reference, discount terms, or custom SLA notes..."
                className="text-xs min-h-[60px]"
              />
            </div>

            <DialogFooter className="mt-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsCreateOpen(false)}
                className="text-xs cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isSubmittingCreate}
                className="bg-indigo-600 hover:bg-indigo-500 text-xs cursor-pointer"
              >
                {isSubmittingCreate ? "Issuing License..." : "Issue License"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit License Modal */}
      <Dialog open={!!editingLicense} onOpenChange={(open) => !open && setEditingLicense(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Edit className="w-4 h-4 text-indigo-600" />
              Edit License ({editingLicense?.licenseKey})
            </DialogTitle>
            <DialogDescription className="text-xs">
              Update status, dates, and parameters for {editingLicense?.companyName}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleEditSubmit} className="space-y-4 py-2 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">License Status</Label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="w-full text-xs h-9 px-3 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
                >
                  <option value="Active">Active</option>
                  <option value="Pending">Pending</option>
                  <option value="Suspended">Suspended</option>
                  <option value="Expired">Expired</option>
                  <option value="Revoked">Revoked</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Payment Status</Label>
                <select
                  value={editPaymentStatus}
                  onChange={(e) => setEditPaymentStatus(e.target.value)}
                  className="w-full text-xs h-9 px-3 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
                >
                  <option value="Paid">Paid</option>
                  <option value="Pending">Pending</option>
                  <option value="Overdue">Overdue</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Expiry Date</Label>
                <Input
                  type="date"
                  value={editExpiryDate}
                  onChange={(e) => setEditExpiryDate(e.target.value)}
                  required
                  className="text-xs h-9"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Max Users</Label>
                <Input
                  type="number"
                  value={editMaxUsers}
                  onChange={(e) => setEditMaxUsers(Number(e.target.value))}
                  className="text-xs h-9"
                />
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-800">
              <span className="font-medium text-slate-800 dark:text-slate-200">Allow Renewals</span>
              <Switch checked={editIsRenewable} onCheckedChange={setEditIsRenewable} />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                className="text-xs min-h-[60px]"
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditingLicense(null)}
                className="text-xs cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isSubmittingEdit}
                className="bg-indigo-600 hover:bg-indigo-500 text-xs cursor-pointer"
              >
                {isSubmittingEdit ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

