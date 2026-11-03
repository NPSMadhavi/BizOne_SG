import React, { useState, useEffect } from "react";
import {
  Building2,
  Search,
  Filter,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Users,
  Database,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  Key,
  RefreshCw,
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
import { getCompanies, getCompanyDetails, updateCompanyStatus } from "./api";
import type { SuperAdminCompany, SuperAdminLicense } from "./types";

interface CompaniesTabProps {
  onCreateLicenseForCompany: (company: SuperAdminCompany) => void;
  selectedCompanyForModal?: SuperAdminCompany | null;
  onClearSelectedCompany?: () => void;
}

export function CompaniesTab({
  onCreateLicenseForCompany,
  selectedCompanyForModal,
  onClearSelectedCompany,
}: CompaniesTabProps) {
  const [companies, setCompanies] = useState<SuperAdminCompany[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(false);

  // Detail Modal
  const [activeCompany, setActiveCompany] = useState<SuperAdminCompany | null>(null);
  const [companyDetails, setCompanyDetails] = useState<{
    company: SuperAdminCompany;
    users: any[];
    licenses: SuperAdminLicense[];
  } | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  // Status Change Dialog
  const [statusModalCompany, setStatusModalCompany] = useState<SuperAdminCompany | null>(null);
  const [newStatus, setNewStatus] = useState<string>("Active");
  const [statusNotes, setStatusNotes] = useState("");
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const fetchCompanies = async () => {
    setIsLoading(true);
    try {
      const res = await getCompanies({
        search: search.trim() || undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
        page,
        limit: 10,
        sortBy: "created_at",
        sortOrder: "desc",
      });
      setCompanies(res.companies || []);
      setTotal(res.total || 0);
      setTotalPages(res.totalPages || 1);
    } catch (err) {
      console.error("Failed to load companies:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCompanies();
  }, [page, statusFilter]);

  // Handle external selection (from dashboard)
  useEffect(() => {
    if (selectedCompanyForModal) {
      handleOpenDetails(selectedCompanyForModal);
      if (onClearSelectedCompany) onClearSelectedCompany();
    }
  }, [selectedCompanyForModal]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchCompanies();
  };

  const handleOpenDetails = async (company: SuperAdminCompany) => {
    setActiveCompany(company);
    setIsLoadingDetails(true);
    try {
      const details = await getCompanyDetails(company.id);
      setCompanyDetails(details);
    } catch (err) {
      console.error("Failed to load company details:", err);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const handleOpenStatusModal = (company: SuperAdminCompany) => {
    setStatusModalCompany(company);
    setNewStatus(company.status || "Active");
    setStatusNotes(company.notes || "");
  };

  const handleSaveStatus = async () => {
    if (!statusModalCompany) return;
    setIsUpdatingStatus(true);
    try {
      await updateCompanyStatus(statusModalCompany.id, newStatus, statusNotes);
      setStatusModalCompany(null);
      fetchCompanies();
      if (activeCompany?.id === statusModalCompany.id) {
        handleOpenDetails(statusModalCompany);
      }
    } catch (err: any) {
      alert(err?.message || "Failed to update company status");
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case "active":
        return <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30">Active</Badge>;
      case "suspended":
        return <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30">Suspended</Badge>;
      case "inactive":
        return <Badge className="bg-slate-500/15 text-slate-600 border-slate-500/30">Inactive</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getLicenseBadge = (status?: string) => {
    switch (status?.toLowerCase()) {
      case "active":
        return <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30">Active</Badge>;
      case "expired":
        return <Badge className="bg-red-500/15 text-red-600 border-red-500/30">Expired</Badge>;
      case "suspended":
        return <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30">Suspended</Badge>;
      case "pending":
        return <Badge className="bg-blue-500/15 text-blue-600 border-blue-500/30">Pending</Badge>;
      default:
        return <Badge variant="outline">No License</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Search & Filter Header */}
      <Card className="border border-slate-200/80 dark:border-slate-800 shadow-sm">
        <CardContent className="p-4">
          <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search companies by name, slug, email, admin, or phone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 text-xs h-9 bg-slate-50/50 dark:bg-slate-900"
              />
            </div>

            <div className="flex items-center gap-2">
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
                <option value="Suspended">Suspended</option>
                <option value="Inactive">Inactive</option>
              </select>

              <Button type="submit" size="sm" className="bg-indigo-600 hover:bg-indigo-500 text-xs h-9 cursor-pointer">
                Filter
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setStatusFilter("all");
                  setPage(1);
                  fetchCompanies();
                }}
                className="text-xs h-9 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Companies Table */}
      <Card className="border border-slate-200/80 dark:border-slate-800 shadow-sm">
        <CardHeader className="p-5 pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold">Registered Companies ({total})</CardTitle>
              <CardDescription className="text-xs">
                All Singapore multi-tenant enterprise registrations with live database bindings
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center space-y-2">
              <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-slate-500">Loading companies...</p>
            </div>
          ) : companies.length === 0 ? (
            <div className="py-16 text-center text-xs text-slate-500">
              No registered companies found matching the criteria.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/75 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border-y border-slate-200/80 dark:border-slate-800">
                  <tr>
                    <th className="py-3 px-4 font-medium">Company Name & Slug</th>
                    <th className="py-3 px-4 font-medium">Admin / Contact</th>
                    <th className="py-3 px-4 font-medium">Database / Type</th>
                    <th className="py-3 px-4 font-medium">Registration Date</th>
                    <th className="py-3 px-4 font-medium">Account Status</th>
                    <th className="py-3 px-4 font-medium">License Status</th>
                    <th className="py-3 px-4 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {companies.map((comp) => (
                    <tr
                      key={comp.id}
                      className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-indigo-500" />
                          <span>{comp.name}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                          ID: #{comp.id} • slug: <span className="text-slate-700 dark:text-slate-300 font-medium">{comp.slug}</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="text-slate-900 dark:text-slate-100 font-medium">
                          {comp.admin?.fullName || comp.admin?.username || "—"}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {comp.admin?.email || comp.email || "—"}
                        </div>
                        {comp.phone && (
                          <div className="text-[10px] text-slate-400">
                            {comp.phone}
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4 font-mono text-[11px]">
                        <div className="flex items-center gap-1 text-slate-700 dark:text-slate-300">
                          <Database className="w-3 h-3 text-slate-400" />
                          <span className="truncate max-w-[140px]">{comp.databaseName || "—"}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 capitalize">
                          {comp.businessType || "Trading & Distribution"}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-slate-500 text-[11px]">
                        {comp.createdAt ? new Date(comp.createdAt).toLocaleDateString() : "—"}
                      </td>

                      <td className="py-3.5 px-4">
                        {getStatusBadge(comp.status)}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="space-y-0.5">
                          {getLicenseBadge(comp.license?.status)}
                          {comp.license?.planType && (
                            <div className="text-[10px] text-slate-500 truncate max-w-[120px]">
                              {comp.license.planType}
                            </div>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenDetails(comp)}
                            className="text-xs h-7 cursor-pointer"
                          >
                            Details
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenStatusModal(comp)}
                            className="text-xs h-7 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                          >
                            Status
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onCreateLicenseForCompany(comp)}
                            className="text-xs h-7 text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 cursor-pointer"
                          >
                            <Key className="w-3 h-3 mr-1" />
                            License
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          <div className="p-4 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
            <div>
              Showing page <span className="font-medium text-slate-800 dark:text-slate-200">{page}</span> of{" "}
              <span className="font-medium text-slate-800 dark:text-slate-200">{totalPages}</span> ({total} companies)
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

      {/* Details Dialog */}
      <Dialog open={!!activeCompany} onOpenChange={(open) => !open && setActiveCompany(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Building2 className="w-5 h-5 text-indigo-600" />
              <span>{activeCompany?.name}</span>
              {activeCompany && getStatusBadge(activeCompany.status)}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Singapore Tenant Isolation & Master Registry Details
            </DialogDescription>
          </DialogHeader>

          {isLoadingDetails ? (
            <div className="py-12 text-center text-xs text-slate-500">
              <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              Loading details...
            </div>
          ) : (
            <div className="space-y-5 text-xs">
              {/* Summary grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
                <div>
                  <span className="text-slate-400 text-[11px] block">Company ID</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">#{activeCompany?.id}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[11px] block">Slug</span>
                  <span className="font-mono font-medium text-slate-800 dark:text-slate-200">{activeCompany?.slug}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[11px] block">Tenant Database</span>
                  <span className="font-mono text-slate-800 dark:text-slate-200">{activeCompany?.databaseName || "—"}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[11px] block">Country</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">{activeCompany?.country || "SG"}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[11px] block">Business Type</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">{activeCompany?.businessType || "Standard"}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[11px] block">Registered On</span>
                  <span className="text-slate-800 dark:text-slate-200">
                    {activeCompany?.createdAt ? new Date(activeCompany.createdAt).toLocaleDateString() : "—"}
                  </span>
                </div>
              </div>

              {/* Users under this company */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-purple-500" />
                    <span>Registered Company Users ({companyDetails?.users.length || 0})</span>
                  </h4>
                </div>
                <div className="border border-slate-200/80 dark:border-slate-800 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500">
                      <tr>
                        <th className="py-2 px-3 font-medium">Username</th>
                        <th className="py-2 px-3 font-medium">Email</th>
                        <th className="py-2 px-3 font-medium">Role</th>
                        <th className="py-2 px-3 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {(companyDetails?.users || []).map((u) => (
                        <tr key={u.id}>
                          <td className="py-2 px-3 font-medium text-slate-800 dark:text-slate-200">{u.username}</td>
                          <td className="py-2 px-3 text-slate-500">{u.email || "—"}</td>
                          <td className="py-2 px-3 capitalize text-slate-700 dark:text-slate-300">{u.role}</td>
                          <td className="py-2 px-3">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${u.isActive ? "bg-emerald-500/15 text-emerald-600" : "bg-red-500/15 text-red-600"}`}>
                              {u.isActive ? "Active" : "Disabled"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Company Licenses */}
              <div className="space-y-2">
                <h4 className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Key className="w-4 h-4 text-indigo-500" />
                  <span>Assigned Licenses ({companyDetails?.licenses.length || 0})</span>
                </h4>
                {(companyDetails?.licenses || []).length === 0 ? (
                  <p className="text-slate-400 py-3 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
                    No license assigned yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {companyDetails?.licenses.map((lic) => (
                      <div
                        key={lic.id}
                        className="p-3 rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between"
                      >
                        <div>
                          <div className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                            {lic.licenseKey}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            Plan: {lic.planType} • Expiry: {lic.expiryDate} • Payment: {lic.paymentStatus}
                          </div>
                        </div>
                        {getLicenseBadge(lic.status)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="mt-4 gap-2">
            {activeCompany && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const comp = activeCompany;
                  setActiveCompany(null);
                  handleOpenStatusModal(comp);
                }}
                className="text-xs cursor-pointer"
              >
                Change Status
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => {
                if (activeCompany) {
                  const comp = activeCompany;
                  setActiveCompany(null);
                  onCreateLicenseForCompany(comp);
                }
              }}
              className="bg-indigo-600 hover:bg-indigo-500 text-xs cursor-pointer"
            >
              Issue New License
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Status Dialog */}
      <Dialog open={!!statusModalCompany} onOpenChange={(open) => !open && setStatusModalCompany(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">
              Update Company Status
            </DialogTitle>
            <DialogDescription className="text-xs">
              Change operational access for <span className="font-semibold text-slate-800 dark:text-slate-200">{statusModalCompany?.name}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div className="space-y-1.5">
              <Label className="text-xs">Account Status</Label>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                className="w-full text-xs h-9 px-3 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
              >
                <option value="Active">Active (Normal Access)</option>
                <option value="Suspended">Suspended (Access Restricted)</option>
                <option value="Inactive">Inactive (Disabled)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Admin Reason / Notes</Label>
              <Textarea
                placeholder="Reason for suspension or status update..."
                value={statusNotes}
                onChange={(e) => setStatusNotes(e.target.value)}
                className="text-xs min-h-[80px]"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStatusModalCompany(null)}
              className="text-xs cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={isUpdatingStatus}
              onClick={handleSaveStatus}
              className="bg-indigo-600 hover:bg-indigo-500 text-xs cursor-pointer"
            >
              {isUpdatingStatus ? "Updating..." : "Save Status"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

