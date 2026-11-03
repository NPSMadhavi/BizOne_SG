import React, { useState, useEffect } from "react";
import {
  RotateCcw,
  Clock,
  AlertTriangle,
  CheckCircle,
  Bell,
  Calendar,
  Building2,
  Key,
  DollarSign,
  History,
  Send,
  RefreshCw,
  Search,
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
import { getLicenses, getRenewals, renewLicense, sendRenewalNotice } from "./api";
import type { SuperAdminLicense, SuperAdminRenewal } from "./types";

interface RenewalsTabProps {
  selectedLicenseForRenewal?: SuperAdminLicense | null;
  onClearSelectedLicense?: () => void;
}

export function RenewalsTab({
  selectedLicenseForRenewal,
  onClearSelectedLicense,
}: RenewalsTabProps) {
  const [licenses, setLicenses] = useState<SuperAdminLicense[]>([]);
  const [renewalsHistory, setRenewalsHistory] = useState<SuperAdminRenewal[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [notifyingId, setNotifyingId] = useState<number | null>(null);

  // Renewal Modal
  const [activeRenewalLicense, setActiveRenewalLicense] = useState<SuperAdminLicense | null>(null);
  const [newExpiryDate, setNewExpiryDate] = useState("");
  const [paymentAmount, setPaymentAmount] = useState<number>(588);
  const [paymentStatus, setPaymentStatus] = useState("Paid");
  const [paymentReference, setPaymentReference] = useState("");
  const [renewalNotes, setRenewalNotes] = useState("");
  const [isSubmittingRenewal, setIsSubmittingRenewal] = useState(false);

  const fetchRenewalsData = async () => {
    setIsLoading(true);
    try {
      const [licRes, renRes] = await Promise.all([
        getLicenses({ limit: 100 }),
        getRenewals(),
      ]);
      setLicenses(licRes.licenses || []);
      setRenewalsHistory(renRes.renewals || []);
    } catch (err) {
      console.error("Failed to load renewals data:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRenewalsData();
  }, []);

  // Handle external selection
  useEffect(() => {
    if (selectedLicenseForRenewal) {
      handleOpenRenewModal(selectedLicenseForRenewal);
      if (onClearSelectedLicense) onClearSelectedLicense();
    }
  }, [selectedLicenseForRenewal]);

  const handleOpenRenewModal = (lic: SuperAdminLicense) => {
    setActiveRenewalLicense(lic);
    const currExpiry = new Date(lic.expiryDate);
    // Default +1 year
    const nextYear = new Date(currExpiry);
    if (isNaN(nextYear.getTime()) || nextYear.getTime() < Date.now()) {
      nextYear.setTime(Date.now());
    }
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    setNewExpiryDate(nextYear.toISOString().slice(0, 10));
    setPaymentAmount(588);
    setPaymentStatus("Paid");
    setPaymentReference(`REN-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`);
    setRenewalNotes("Annual Singapore ERP renewal");
  };

  const handleAddMonths = (months: number) => {
    if (!activeRenewalLicense) return;
    const base = new Date(activeRenewalLicense.expiryDate);
    const start = isNaN(base.getTime()) || base.getTime() < Date.now() ? new Date() : base;
    start.setMonth(start.getMonth() + months);
    setNewExpiryDate(start.toISOString().slice(0, 10));
  };

  const handleSubmitRenewal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRenewalLicense || !newExpiryDate) return;

    setIsSubmittingRenewal(true);
    try {
      await renewLicense(activeRenewalLicense.id, {
        newExpiryDate,
        paymentAmount: Number(paymentAmount) || 0,
        paymentStatus,
        paymentReference: paymentReference.trim() || undefined,
        notes: renewalNotes.trim() || undefined,
      });

      setActiveRenewalLicense(null);
      fetchRenewalsData();
      alert(`License ${activeRenewalLicense.licenseKey} has been renewed successfully until ${newExpiryDate}!`);
    } catch (err: any) {
      alert(err?.message || "Failed to renew license");
    } finally {
      setIsSubmittingRenewal(false);
    }
  };

  const handleSendNotice = async (lic: SuperAdminLicense) => {
    setNotifyingId(lic.id);
    try {
      await sendRenewalNotice(lic.id);
      alert(`Automated renewal reminder dispatched to company administrator for ${lic.companyName || lic.licenseKey}!`);
    } catch (err: any) {
      alert(err?.message || "Failed to send notice");
    } finally {
      setNotifyingId(null);
    }
  };

  // Group licenses into expiring soon (< 30 days) and expired
  const nowTime = Date.now();
  const expiringOrExpired = licenses
    .map((lic) => {
      const expTime = new Date(lic.expiryDate).getTime();
      const diffDays = Math.ceil((expTime - nowTime) / (1000 * 60 * 60 * 24));
      return { ...lic, diffDays, isExpired: diffDays < 0 };
    })
    .filter((lic) => lic.diffDays <= 30 || lic.status === "Expired")
    .sort((a, b) => a.diffDays - b.diffDays);

  return (
    <div className="space-y-6">
      {/* Top Banner / Summary */}
      <div className="bg-gradient-to-r from-orange-950/40 via-slate-900 to-indigo-950/40 border border-orange-500/20 p-5 rounded-2xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-1 rounded-md bg-orange-500/20 text-orange-400">
                <Clock className="w-4 h-4" />
              </span>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                License Renewal Management Desk
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Track upcoming expirations, dispatch automated reminders, and log formal renewal transactions.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchRenewalsData}
              disabled={isLoading}
              className="text-xs h-8 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Counter cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs">
            <span className="text-slate-400 text-[11px] block">Needs Action</span>
            <span className="text-xl font-bold text-orange-400">{expiringOrExpired.length} Licenses</span>
          </div>
          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs">
            <span className="text-slate-400 text-[11px] block">Total Renewals Logged</span>
            <span className="text-xl font-bold text-emerald-400">{renewalsHistory.length} Cycles</span>
          </div>
          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs col-span-2 sm:col-span-1">
            <span className="text-slate-400 text-[11px] block">Grace Period Policy</span>
            <span className="text-xl font-bold text-indigo-400">3 Days Grace</span>
          </div>
        </div>
      </div>

      {/* Expirations Due Soon Table */}
      <Card className="border border-slate-200/80 dark:border-slate-800 shadow-sm">
        <CardHeader className="p-5 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-500" />
              <CardTitle className="text-sm font-semibold">Expirations & Renewals Due Soon</CardTitle>
            </div>
          </div>
          <CardDescription className="text-xs">
            Tenant licenses requiring immediate manual renewal or notification
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-12 text-center text-xs text-slate-500">
              <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              Loading renewals queue...
            </div>
          ) : expiringOrExpired.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              <CheckCircle className="w-8 h-8 text-emerald-500/50 mx-auto mb-2" />
              All active Singapore tenant licenses are up-to-date! No expirations within 30 days.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/75 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border-y border-slate-200/80 dark:border-slate-800">
                  <tr>
                    <th className="py-3 px-4 font-medium">Company Name</th>
                    <th className="py-3 px-4 font-medium">License Key</th>
                    <th className="py-3 px-4 font-medium">Plan Type</th>
                    <th className="py-3 px-4 font-medium">Expiry Date</th>
                    <th className="py-3 px-4 font-medium">Urgency</th>
                    <th className="py-3 px-4 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {expiringOrExpired.map((lic) => (
                    <tr
                      key={lic.id}
                      className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3.5 px-4 font-medium text-slate-900 dark:text-white">
                        <div className="flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-slate-400" />
                          <span>{lic.companyName || `Company #${lic.companyId}`}</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-mono text-slate-700 dark:text-slate-300">
                        {lic.licenseKey}
                      </td>

                      <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">
                        {lic.planType}
                      </td>

                      <td className="py-3.5 px-4 font-mono text-slate-800 dark:text-slate-200">
                        {lic.expiryDate}
                      </td>

                      <td className="py-3.5 px-4">
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            lic.isExpired
                              ? "bg-red-500/15 text-red-600 border border-red-500/30"
                              : lic.diffDays <= 7
                              ? "bg-orange-500/15 text-orange-600 border border-orange-500/30"
                              : "bg-amber-500/15 text-amber-600 border border-amber-500/30"
                          }`}
                        >
                          {lic.isExpired ? `Expired (${Math.abs(lic.diffDays)}d ago)` : `${lic.diffDays} days left`}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={notifyingId === lic.id}
                            onClick={() => handleSendNotice(lic)}
                            className="text-xs h-7 text-slate-600 dark:text-slate-400 hover:text-indigo-600 cursor-pointer"
                            title="Dispatch Email Reminder"
                          >
                            <Send className="w-3 h-3 mr-1" />
                            {notifyingId === lic.id ? "Sending..." : "Notice"}
                          </Button>

                          <Button
                            size="sm"
                            onClick={() => handleOpenRenewModal(lic)}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs h-7 cursor-pointer"
                          >
                            <RotateCcw className="w-3 h-3 mr-1" />
                            Renew Now
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Historical Renewals Log */}
      <Card className="border border-slate-200/80 dark:border-slate-800 shadow-sm">
        <CardHeader className="p-5 pb-3">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-purple-500" />
            <CardTitle className="text-sm font-semibold">Renewal History Log ({renewalsHistory.length})</CardTitle>
          </div>
          <CardDescription className="text-xs">
            Complete audit trail of all manual license extension transactions
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {renewalsHistory.length === 0 ? (
            <p className="text-xs text-slate-500 py-8 text-center">No renewal cycles recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/75 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border-y border-slate-200/80 dark:border-slate-800">
                  <tr>
                    <th className="py-2.5 px-4 font-medium">Renewal Date</th>
                    <th className="py-2.5 px-4 font-medium">Company</th>
                    <th className="py-2.5 px-4 font-medium">License Key</th>
                    <th className="py-2.5 px-4 font-medium">Old Expiry</th>
                    <th className="py-2.5 px-4 font-medium">New Expiry</th>
                    <th className="py-2.5 px-4 font-medium">Amount (SGD)</th>
                    <th className="py-2.5 px-4 font-medium">Reference</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {renewalsHistory.map((ren) => (
                    <tr key={ren.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 px-4 text-slate-600 dark:text-slate-400">
                        {ren.renewalDate}
                      </td>
                      <td className="py-2.5 px-4 font-medium text-slate-900 dark:text-white">
                        {ren.companyName || `Company #${ren.companyId}`}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-slate-700 dark:text-slate-300">
                        {ren.licenseKey || `Lic #${ren.licenseId}`}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-slate-500">
                        {ren.previousExpiryDate}
                      </td>
                      <td className="py-2.5 px-4 font-mono font-medium text-emerald-600">
                        {ren.newExpiryDate}
                      </td>
                      <td className="py-2.5 px-4 font-medium text-slate-900 dark:text-white">
                        ${Number(ren.paymentAmount).toFixed(2)}
                      </td>
                      <td className="py-2.5 px-4 text-slate-500 font-mono text-[11px]">
                        {ren.paymentReference || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Renew Modal Dialog */}
      <Dialog open={!!activeRenewalLicense} onOpenChange={(open) => !open && setActiveRenewalLicense(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <RotateCcw className="w-5 h-5 text-indigo-600" />
              Renew License: {activeRenewalLicense?.licenseKey}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Extend access for <span className="font-semibold">{activeRenewalLicense?.companyName}</span>
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmitRenewal} className="space-y-4 py-2 text-xs">
            {/* Current Expiry Banner */}
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-slate-400 text-[11px] block">Current Expiration</span>
                <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                  {activeRenewalLicense?.expiryDate}
                </span>
              </div>
              <Badge variant="outline" className="text-xs">
                Plan: {activeRenewalLicense?.planType}
              </Badge>
            </div>

            {/* Quick Extension Presets */}
            <div className="space-y-1.5">
              <Label className="text-xs">Quick Period Preset</Label>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleAddMonths(1)}
                  className="text-xs h-8 cursor-pointer"
                >
                  +1 Month
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleAddMonths(3)}
                  className="text-xs h-8 cursor-pointer"
                >
                  +3 Months (Quarter)
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleAddMonths(12)}
                  className="text-xs h-8 cursor-pointer"
                >
                  +1 Year (Annual)
                </Button>
              </div>
            </div>

            {/* New Expiry Date */}
            <div className="space-y-1.5">
              <Label className="text-xs">New Expiry Date</Label>
              <Input
                type="date"
                value={newExpiryDate}
                onChange={(e) => setNewExpiryDate(e.target.value)}
                required
                className="text-xs h-9 font-semibold"
              />
            </div>

            {/* Payment Fields */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Renewal Fee (SGD)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(Number(e.target.value))}
                  className="text-xs h-9"
                />
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
                </select>
              </div>
            </div>

            {/* Payment Reference */}
            <div className="space-y-1.5">
              <Label className="text-xs">Payment Reference / Invoice Number</Label>
              <Input
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                placeholder="e.g. INV-2026-9021 or STRIPE-TXN-..."
                className="text-xs h-9 font-mono"
              />
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label className="text-xs">Renewal Notes</Label>
              <Textarea
                value={renewalNotes}
                onChange={(e) => setRenewalNotes(e.target.value)}
                placeholder="Contract notes, discount terms, or bank reference..."
                className="text-xs min-h-[50px]"
              />
            </div>

            <DialogFooter className="mt-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setActiveRenewalLicense(null)}
                className="text-xs cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isSubmittingRenewal}
                className="bg-indigo-600 hover:bg-indigo-500 text-xs cursor-pointer"
              >
                {isSubmittingRenewal ? "Processing Renewal..." : "Confirm License Renewal"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

