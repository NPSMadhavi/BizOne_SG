import React, { useState, useEffect } from "react";
import {
  Layers,
  Plus,
  Edit,
  CheckCircle,
  XCircle,
  Users,
  DollarSign,
  Calendar,
  Sparkles,
  RefreshCw,
  Check,
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
import { getPlans, createPlan, updatePlan, updatePlanStatus } from "./api";
import type { SuperAdminPlan } from "./types";

const ALL_ERP_MODULES = [
  // Sales & Billing
  { key: "invoices", label: "Invoices & Billing", group: "Sales" },
  { key: "quotations", label: "Quotations & Estimates", group: "Sales" },
  { key: "sales_orders", label: "Sales Orders", group: "Sales" },
  { key: "delivery_orders", label: "Delivery Orders", group: "Sales" },
  { key: "proforma_invoices", label: "Proforma Invoices", group: "Sales" },
  { key: "credit_notes", label: "Credit Notes", group: "Sales" },
  { key: "customers", label: "Customer Directory", group: "Sales" },

  // Purchasing & Vendors
  { key: "purchase_orders", label: "Purchase Orders", group: "Purchasing" },
  { key: "purchase_quotations", label: "Purchase Quotations", group: "Purchasing" },
  { key: "vendor_invoices", label: "Vendor Invoices", group: "Purchasing" },
  { key: "vendor_proforma_invoices", label: "Vendor Proforma Invoices", group: "Purchasing" },
  { key: "debit_notes", label: "Debit Notes", group: "Purchasing" },
  { key: "vendors", label: "Vendor Directory", group: "Purchasing" },

  // Accounting & Singapore Tax
  { key: "accounting_coa", label: "Chart of Accounts", group: "Accounting" },
  { key: "accounting_je", label: "Journal Entries", group: "Accounting" },
  { key: "accounting_gl", label: "General Ledger", group: "Accounting" },
  { key: "accounting_tb", label: "Trial Balance", group: "Accounting" },
  { key: "accounting_bs", label: "Balance Sheet", group: "Accounting" },
  { key: "accounting_pl", label: "Profit & Loss", group: "Accounting" },
  { key: "accounting_cf", label: "Cash Flow Statement", group: "Accounting" },
  { key: "accounting_bank_recon", label: "Bank Reconciliation", group: "Accounting" },
  { key: "accounting_gst_f5", label: "Singapore GST F5 Return", group: "Tax & Compliance" },
  { key: "accounting_gst_f7", label: "Singapore GST F7 Amendment", group: "Tax & Compliance" },
  { key: "accounting_gst_io", label: "GST Input/Output Tax Audit", group: "Tax & Compliance" },
  { key: "accounting_iaf", label: "IRAS IAF Audit File Export", group: "Tax & Compliance" },
  { key: "accounting_wht", label: "Withholding Tax (WHT)", group: "Tax & Compliance" },
  { key: "accounting_ar", label: "Accounts Receivable & Aging", group: "Accounting" },
  { key: "accounting_ap", label: "Accounts Payable & Aging", group: "Accounting" },

  // Inventory & Operations
  { key: "stock_items", label: "Stock Items & Catalog", group: "Inventory" },
  { key: "warehouses", label: "Multi-Warehouses & Locations", group: "Inventory" },
  { key: "stock_transfer", label: "Stock Transfers", group: "Inventory" },
  { key: "grn", label: "Goods Received Notes (GRN)", group: "Inventory" },
  { key: "inventory_reports", label: "Inventory Valuation Reports", group: "Inventory" },
  { key: "multi_price_level", label: "Multi-Tier Price Lists", group: "Inventory" },
  { key: "bill_of_materials", label: "Bill of Materials (BOM)", group: "Inventory" },

  // Point of Sale (POS)
  { key: "point_of_sale", label: "POS Core Register", group: "POS" },
  { key: "pos_retail", label: "POS Retail Mode", group: "POS" },
  { key: "pos_supermarket", label: "POS Supermarket Scanner", group: "POS" },
  { key: "pos_restaurants", label: "POS F&B Restaurant", group: "POS" },
  { key: "pos_reports", label: "POS Daily Z-Reports", group: "POS" },

  // Operations & HR
  { key: "projects", label: "Project Costing & Vouchers", group: "Projects" },
  { key: "assets", label: "Fixed Assets & Depreciation", group: "Operations" },
  { key: "payroll", label: "Singapore Payroll & IR8A", group: "Payroll" },
  { key: "employees", label: "Employee Management", group: "Payroll" },
  { key: "report_templates", label: "Custom Invoice Template Designer", group: "Reporting" },
];

export function PlansTab() {
  const [plans, setPlans] = useState<SuperAdminPlan[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Create Modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState("Yearly");
  const [durationDays, setDurationDays] = useState(365);
  const [price, setPrice] = useState<number>(888);
  const [currency, setCurrency] = useState("SGD");
  const [maxUsers, setMaxUsers] = useState<number>(5);
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);

  // Edit Modal
  const [editingPlan, setEditingPlan] = useState<SuperAdminPlan | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPrice, setEditPrice] = useState<number>(0);
  const [editMaxUsers, setEditMaxUsers] = useState<number>(5);
  const [editModules, setEditModules] = useState<string[]>([]);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  const fetchPlans = async () => {
    setIsLoading(true);
    try {
      const res = await getPlans();
      setPlans(res.plans || []);
    } catch (err) {
      console.error("Failed to load plans:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  const handleOpenCreateModal = () => {
    setName("");
    setCode("");
    setDescription("");
    setDuration("Yearly");
    setDurationDays(365);
    setPrice(888);
    setCurrency("SGD");
    setMaxUsers(5);
    // Default to core modules
    setSelectedModules([
      "dashboard", "invoices", "quotations", "sales_orders", "purchase_orders",
      "vendors", "customers", "accounting_coa", "accounting_je", "accounting_gl",
      "accounting_tb", "accounting_bs", "accounting_pl", "accounting_gst_f5"
    ]);
    setIsCreateOpen(true);
  };

  const handleDurationChange = (dur: string) => {
    setDuration(dur);
    if (dur === "Monthly") setDurationDays(30);
    else if (dur === "Quarterly") setDurationDays(90);
    else if (dur === "Yearly") setDurationDays(365);
  };

  const toggleModule = (modKey: string, isEdit = false) => {
    if (isEdit) {
      setEditModules((prev) =>
        prev.includes(modKey) ? prev.filter((m) => m !== modKey) : [...prev, modKey]
      );
    } else {
      setSelectedModules((prev) =>
        prev.includes(modKey) ? prev.filter((m) => m !== modKey) : [...prev, modKey]
      );
    }
  };

  const selectAllModules = (isEdit = false) => {
    const allKeys = ALL_ERP_MODULES.map((m) => m.key);
    if (isEdit) setEditModules(allKeys);
    else setSelectedModules(allKeys);
  };

  const clearAllModules = (isEdit = false) => {
    if (isEdit) setEditModules([]);
    else setSelectedModules([]);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !code.trim()) {
      alert("Please provide both plan name and a unique code.");
      return;
    }

    setIsSubmittingCreate(true);
    try {
      await createPlan({
        name: name.trim(),
        code: code.trim().toLowerCase(),
        description: description.trim() || undefined,
        duration,
        durationDays: Number(durationDays) || 365,
        price: Number(price) || 0,
        currency,
        maxUsers: Number(maxUsers) || 5,
        modules: selectedModules,
      });

      setIsCreateOpen(false);
      fetchPlans();
    } catch (err: any) {
      alert(err?.message || "Failed to create plan");
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  const handleOpenEditModal = (p: SuperAdminPlan) => {
    setEditingPlan(p);
    setEditName(p.name);
    setEditDescription(p.description || "");
    setEditPrice(p.price);
    setEditMaxUsers(p.maxUsers);
    setEditModules(p.modules || []);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlan) return;

    setIsSubmittingEdit(true);
    try {
      await updatePlan(editingPlan.id, {
        name: editName.trim(),
        description: editDescription.trim(),
        price: Number(editPrice),
        maxUsers: Number(editMaxUsers),
        modules: editModules,
      });

      setEditingPlan(null);
      fetchPlans();
    } catch (err: any) {
      alert(err?.message || "Failed to update plan");
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const handleTogglePlanActive = async (p: SuperAdminPlan) => {
    try {
      await updatePlanStatus(p.id, !p.isActive);
      fetchPlans();
    } catch (err: any) {
      alert(err?.message || "Failed to toggle status");
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-600" />
            Singapore Subscription Plans
          </h2>
          <p className="text-xs text-slate-500">
            Define pricing tiers, user allocations, and feature module bundles for tenants.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchPlans}
            disabled={isLoading}
            className="text-xs h-9 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          <Button
            size="sm"
            onClick={handleOpenCreateModal}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs h-9 shadow-sm cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            New Subscription Plan
          </Button>
        </div>
      </div>

      {/* Plans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {plans.map((p) => (
          <Card
            key={p.id}
            className={`border transition-all shadow-sm ${
              p.isActive
                ? "border-slate-200/90 dark:border-slate-800 hover:border-indigo-400"
                : "border-slate-200 dark:border-slate-800 opacity-60 bg-slate-50/50 dark:bg-slate-900/50"
            }`}
          >
            <CardHeader className="p-5 pb-3">
              <div className="flex items-center justify-between mb-1.5">
                <Badge
                  variant="outline"
                  className="font-mono text-[10px] tracking-wide uppercase px-2 py-0.5 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800"
                >
                  {p.code}
                </Badge>
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] font-medium ${p.isActive ? "text-emerald-600" : "text-slate-400"}`}>
                    {p.isActive ? "Active" : "Archived"}
                  </span>
                  <Switch
                    checked={p.isActive}
                    onCheckedChange={() => handleTogglePlanActive(p)}
                  />
                </div>
              </div>

              <CardTitle className="text-base font-bold text-slate-900 dark:text-white">
                {p.name}
              </CardTitle>
              <CardDescription className="text-xs line-clamp-2 min-h-[32px]">
                {p.description || "Full Singapore ERP suite subscription."}
              </CardDescription>
            </CardHeader>

            <CardContent className="p-5 pt-0 space-y-4 text-xs">
              {/* Pricing Display */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/90 border border-slate-200/70 dark:border-slate-800 flex items-baseline justify-between">
                <div>
                  <span className="text-2xl font-black text-slate-900 dark:text-white">
                    {p.currency} {Number(p.price).toFixed(2)}
                  </span>
                  <span className="text-slate-500 text-[11px] ml-1">/ {p.duration.toLowerCase()}</span>
                </div>
                <div className="text-[11px] font-medium text-slate-600 dark:text-slate-300 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  {p.durationDays} days
                </div>
              </div>

              {/* Users & Features */}
              <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-800/80">
                <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-slate-400" /> Maximum Users:
                  </span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {p.maxUsers === -1 ? "Unlimited" : `${p.maxUsers} Users`}
                  </span>
                </div>

                <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400" /> Enabled Modules:
                  </span>
                  <span className="font-semibold text-indigo-600 dark:text-indigo-400 font-mono">
                    {p.modules?.length || 0} modules
                  </span>
                </div>
              </div>

              {/* Modules Tags Snippet */}
              <div className="flex flex-wrap gap-1 max-h-16 overflow-hidden">
                {(p.modules || []).slice(0, 6).map((m) => (
                  <span
                    key={m}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                  >
                    {m.replace(/_/g, " ")}
                  </span>
                ))}
                {(p.modules?.length || 0) > 6 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-300 font-medium">
                    +{(p.modules?.length || 0) - 6} more
                  </span>
                )}
              </div>

              {/* Action */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleOpenEditModal(p)}
                className="w-full text-xs h-8 cursor-pointer border-slate-200 dark:border-slate-800"
              >
                <Edit className="w-3 h-3 mr-1.5" />
                Configure Plan & Modules
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Create Plan Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Plus className="w-5 h-5 text-indigo-600" />
              Create Singapore Subscription Plan
            </DialogTitle>
            <DialogDescription className="text-xs">
              Add a new commercial plan tier with tailored ERP modules and pricing
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateSubmit} className="space-y-4 py-2 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Plan Name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Enterprise Cloud Suite"
                  required
                  className="text-xs h-9"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Unique Plan Code</Label>
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="e.g. sg_cloud_suite"
                  required
                  className="text-xs h-9 font-mono lowercase"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Description</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief summary of target business profile and included perks..."
                className="text-xs h-9"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Duration</Label>
                <select
                  value={duration}
                  onChange={(e) => handleDurationChange(e.target.value)}
                  className="w-full text-xs h-9 px-3 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
                >
                  <option value="Monthly">Monthly</option>
                  <option value="Quarterly">Quarterly</option>
                  <option value="Yearly">Yearly</option>
                  <option value="Custom">Custom Days</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Duration Days</Label>
                <Input
                  type="number"
                  value={durationDays}
                  onChange={(e) => setDurationDays(Number(e.target.value))}
                  className="text-xs h-9"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Price (SGD)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(Number(e.target.value))}
                  className="text-xs h-9"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
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

              <div className="space-y-1.5">
                <Label className="text-xs">Currency</Label>
                <Input
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="text-xs h-9 font-semibold"
                />
              </div>
            </div>

            {/* Modules Checkbox Matrix */}
            <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs font-semibold">Included ERP Modules ({selectedModules.length})</Label>
                  <p className="text-[11px] text-slate-400">Select which features are enabled for this plan tier</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => selectAllModules(false)}
                    className="text-xs h-7 text-indigo-600 dark:text-indigo-400"
                  >
                    Select All
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => clearAllModules(false)}
                    className="text-xs h-7 text-slate-500"
                  >
                    Clear All
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 rounded-lg border border-slate-200 dark:border-slate-800 max-h-56 overflow-y-auto">
                {ALL_ERP_MODULES.map((m) => {
                  const isChecked = selectedModules.includes(m.key);
                  return (
                    <label
                      key={m.key}
                      onClick={() => toggleModule(m.key, false)}
                      className={`flex items-center gap-2 p-1.5 rounded cursor-pointer transition-colors ${
                        isChecked
                          ? "bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-950 dark:text-indigo-200"
                          : "hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}}
                        className="rounded text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                      />
                      <span className="text-[11px] truncate">{m.label}</span>
                    </label>
                  );
                })}
              </div>
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
                {isSubmittingCreate ? "Saving Plan..." : "Create Plan"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Plan Dialog */}
      <Dialog open={!!editingPlan} onOpenChange={(open) => !open && setEditingPlan(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Edit className="w-5 h-5 text-indigo-600" />
              Configure Plan: {editingPlan?.name}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Update pricing, capacity, and active ERP features
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleEditSubmit} className="space-y-4 py-2 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Plan Name</Label>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                  className="text-xs h-9"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Price (SGD)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editPrice}
                  onChange={(e) => setEditPrice(Number(e.target.value))}
                  className="text-xs h-9"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Max Users</Label>
                <Input
                  type="number"
                  value={editMaxUsers}
                  onChange={(e) => setEditMaxUsers(Number(e.target.value))}
                  className="text-xs h-9"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Description</Label>
                <Input
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="text-xs h-9"
                />
              </div>
            </div>

            {/* Modules Checkbox Matrix */}
            <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs font-semibold">Enabled Modules ({editModules.length})</Label>
                  <p className="text-[11px] text-slate-400">Toggle individual modules available in this plan</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => selectAllModules(true)}
                    className="text-xs h-7 text-indigo-600 dark:text-indigo-400"
                  >
                    Select All
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => clearAllModules(true)}
                    className="text-xs h-7 text-slate-500"
                  >
                    Clear All
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 rounded-lg border border-slate-200 dark:border-slate-800 max-h-56 overflow-y-auto">
                {ALL_ERP_MODULES.map((m) => {
                  const isChecked = editModules.includes(m.key);
                  return (
                    <label
                      key={m.key}
                      onClick={() => toggleModule(m.key, true)}
                      className={`flex items-center gap-2 p-1.5 rounded cursor-pointer transition-colors ${
                        isChecked
                          ? "bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-950 dark:text-indigo-200"
                          : "hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}}
                        className="rounded text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                      />
                      <span className="text-[11px] truncate">{m.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <DialogFooter className="mt-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditingPlan(null)}
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
                {isSubmittingEdit ? "Updating..." : "Save Plan Configuration"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

