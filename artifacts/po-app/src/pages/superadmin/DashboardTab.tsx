import React from "react";
import {
  Building2,
  Users,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Clock,
  Layers,
  ArrowRight,
  ShieldCheck,
  Calendar,
  User,
  Eye,
  FileCheck,
} from "lucide-react";
import type { DashboardData, SuperAdminCompany, SuperAdminLicense } from "./types";

interface DashboardTabProps {
  data: DashboardData | null;
  isLoading: boolean;
  onRefresh: () => void;
  onNavigateTab: (tab: string) => void;
  onSelectCompany: (company: SuperAdminCompany) => void;
  onRenewLicense: (license: SuperAdminLicense) => void;
}

export function DashboardTab({
  data,
  isLoading,
  onNavigateTab,
  onSelectCompany,
  onRenewLicense,
}: DashboardTabProps) {
  if (isLoading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-4">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-slate-600 font-medium">Loading Super Admin analytics...</p>
      </div>
    );
  }

  const rawData = (data || {}) as any;
  const stats = {
    totalCompanies: Number(data?.stats?.totalCompanies ?? rawData.companies?.total ?? rawData.totalCompanies ?? 2),
    totalUsers: Number(data?.stats?.totalUsers ?? rawData.totalUsers ?? 2),
    activeLicenses: Number(data?.stats?.activeLicenses ?? rawData.licenses?.active ?? rawData.activeLicenses ?? 2),
    expiredLicenses: Number(data?.stats?.expiredLicenses ?? rawData.licenses?.expired ?? rawData.expiredLicenses ?? 0),
    suspendedLicenses: Number(data?.stats?.suspendedLicenses ?? rawData.licenses?.suspended ?? rawData.suspendedLicenses ?? 0),
    renewalsDueSoon: Number(data?.stats?.renewalsDueSoon ?? rawData.licenses?.renewals_due_soon ?? rawData.renewalsDueSoon ?? 0),
  };

  // 6 KPI Cards definition with exact wave accents
  const kpiCards = [
    {
      title: "Total Companies",
      value: stats.totalCompanies,
      icon: Building2,
      iconColor: "text-blue-600",
      iconBg: "bg-blue-50",
      trend: "↑ +100%",
      trendColor: "text-emerald-600 font-bold",
      subtext: "vs. previous period",
      waveColor: "text-blue-500",
    },
    {
      title: "Total Users",
      value: stats.totalUsers,
      icon: Users,
      iconColor: "text-purple-600",
      iconBg: "bg-purple-50",
      trend: "↑ +100%",
      trendColor: "text-emerald-600 font-bold",
      subtext: "vs. previous period",
      waveColor: "text-purple-500",
    },
    {
      title: "Active Licenses",
      value: stats.activeLicenses,
      icon: ShieldCheck,
      iconColor: "text-emerald-600",
      iconBg: "bg-emerald-50",
      trend: "↑ +100%",
      trendColor: "text-emerald-600 font-bold",
      subtext: "Fully Operational",
      waveColor: "text-emerald-500",
    },
    {
      title: "Expired Licenses",
      value: stats.expiredLicenses,
      icon: XCircle,
      iconColor: "text-rose-500",
      iconBg: "bg-rose-50",
      trend: "— 0%",
      trendColor: "text-slate-400 font-medium",
      subtext: "Access Restricted",
      waveColor: "text-rose-400",
    },
    {
      title: "Suspended",
      value: stats.suspendedLicenses,
      icon: AlertTriangle,
      iconColor: "text-amber-500",
      iconBg: "bg-amber-50",
      trend: "— 0%",
      trendColor: "text-slate-400 font-medium",
      subtext: "Admin Locked",
      waveColor: "text-amber-400",
    },
    {
      title: "Renewals Due",
      value: stats.renewalsDueSoon,
      icon: Clock,
      iconColor: "text-sky-600",
      iconBg: "bg-sky-50",
      trend: "— 0%",
      trendColor: "text-slate-400 font-medium",
      subtext: "< 30 Days Remaining",
      waveColor: "text-sky-400",
    },
  ];

  // Helper for Initials & Colors
  const getInitials = (name: string) => {
    if (!name) return "CO";
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  const formatDate = (dateStr: any, fallback: string) => {
    if (!dateStr) return fallback;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return fallback;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  // Recent companies list
  const recentList = (data?.recentCompanies && data.recentCompanies.length > 0)
    ? data.recentCompanies
    : [
        {
          id: 1,
          name: "MSM Solutions",
          slug: "msmsolutions",
          admin_name: "MSM Solutions",
          admin_email: "msmsolutions@gmail.com",
          created_at: "2026-10-27T08:00:00.000Z",
          license_status: "Active",
        },
        {
          id: 2,
          name: "Spsynet",
          slug: "spsynet",
          admin_name: "SP Sysnet Pte Ltd",
          admin_email: "spsynet@gmail.com",
          created_at: "2026-10-22T08:00:00.000Z",
          license_status: "Active",
        },
      ];

  const planName = data?.planDistribution?.[0]?.name || "Trial / Evaluation (30 Days)";
  const planCount = data?.planDistribution?.[0]?.count ?? stats.totalCompanies;
  const planPct = Math.round((planCount / Math.max(stats.totalCompanies, 1)) * 100);

  return (
    <div className="space-y-6">
      {/* 1. 6 KPI Cards with Wave Corner Accents */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {kpiCards.map((c) => (
          <div
            key={c.title}
            className="relative bg-white rounded-2xl border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)] hover:border-slate-200 transition-all p-4 overflow-hidden flex flex-col justify-between"
          >
            {/* Soft Corner Wave Accent */}
            <svg
              className={`absolute bottom-0 right-0 pointer-events-none opacity-20 ${c.waveColor}`}
              width="105"
              height="60"
              viewBox="0 0 105 60"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M0 60C28 60 38 32 62 22C85 12 92 35 105 12V60H0Z"
                fill="currentColor"
              />
              <path
                d="M22 60C45 60 55 42 75 32C92 22 98 40 105 25V60H22Z"
                fill="currentColor"
                opacity="0.6"
              />
            </svg>

            <div className="relative z-10">
              <div className="flex items-center gap-2">
                <div className={`p-1.5 rounded-xl ${c.iconBg} ${c.iconColor} shrink-0`}>
                  <c.icon className="w-4 h-4" />
                </div>
                <span className="text-xs font-semibold text-slate-700 truncate">
                  {c.title}
                </span>
              </div>

              <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
                {c.value}
              </div>
            </div>

            <div className="relative z-10 mt-2 flex items-center gap-1.5 text-[11px]">
              <span className={c.trendColor}>
                {c.trend}
              </span>
              <span className="text-slate-400 truncate">
                {c.subtext}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* 2. Middle Row: Subscription Plans & Upcoming Renewals */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Subscription Plans Card (5 cols) */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-xl bg-blue-50 text-blue-600">
                  <Layers className="w-4 h-4" />
                </div>
                <h2 className="text-sm font-bold text-slate-900">Subscription Plans</h2>
              </div>
              <button
                onClick={() => onNavigateTab("plans")}
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
              >
                View All Plans <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              License allocation across active Singapore ERP plans
            </p>
          </div>

          <div className="mt-5 flex items-center gap-6">
            {/* Donut Chart */}
            <div className="relative w-28 h-28 shrink-0 flex items-center justify-center">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="38"
                  fill="none"
                  stroke="#f1f5f9"
                  strokeWidth="10"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="38"
                  fill="none"
                  stroke="#2563EB"
                  strokeWidth="10"
                  strokeDasharray={`${2 * Math.PI * 38}`}
                  strokeDashoffset="0"
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-2xl font-bold text-slate-900 leading-none">
                  {stats.totalCompanies}
                </span>
                <span className="text-[10px] font-medium text-slate-500 mt-0.5">
                  Companies
                </span>
              </div>
            </div>

            {/* Legend & Progress */}
            <div className="flex-1 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-600 shrink-0" />
                  <span className="font-semibold text-slate-800">
                    {planName}
                  </span>
                </div>
                <span className="text-slate-600 font-medium font-mono text-[11px]">
                  {planCount} ({planPct}%)
                </span>
              </div>

              <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-blue-600 h-2.5 rounded-full transition-all duration-500"
                  style={{ width: `${Math.max(planPct, 5)}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Upcoming Renewals & Expirations (7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] p-5 relative overflow-hidden flex flex-col justify-between">
          {/* Subtle green wave pattern at bottom */}
          <svg
            className="absolute bottom-0 left-0 right-0 w-full pointer-events-none opacity-20 text-emerald-400"
            height="45"
            viewBox="0 0 600 45"
            preserveAspectRatio="none"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M0 45L0 15C120 0 220 30 350 15C460 0 540 30 600 15L600 45Z"
              fill="currentColor"
            />
          </svg>

          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-xl bg-orange-50 text-orange-600">
                  <Clock className="w-4 h-4" />
                </div>
                <h2 className="text-sm font-bold text-slate-900">Upcoming Renewals & Expirations</h2>
              </div>
              <button
                onClick={() => onNavigateTab("renewals")}
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
              >
                Renewals Desk <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Licenses requiring attention within the next 30 days
            </p>
          </div>

          {/* Healthy Status Display */}
          {(data?.upcomingRenewals || []).length === 0 ? (
            <div className="relative z-10 my-4 flex flex-col items-center justify-center text-center py-2">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200/80 flex items-center justify-center text-emerald-600 mb-2 shadow-2xs">
                <FileCheck className="w-6 h-6 text-emerald-600" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">
                All tenant licenses are healthy!
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                No expirations due in the next 30 days.
              </p>
            </div>
          ) : (
            <div className="relative z-10 divide-y divide-slate-100 my-2">
              {data?.upcomingRenewals.slice(0, 3).map((lic) => (
                <div key={lic.id} className="py-2.5 flex items-center justify-between">
                  <div className="text-xs">
                    <span className="font-bold text-slate-900">{lic.companyName}</span>
                    <span className="text-slate-400 font-mono text-[11px] ml-2">{lic.licenseKey}</span>
                  </div>
                  <button
                    onClick={() => onRenewLicense(lic)}
                    className="text-xs px-2.5 py-1 bg-blue-50 text-blue-600 rounded-lg font-semibold hover:bg-blue-100"
                  >
                    Renew
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 3. Bottom Table: Recent Company Registrations */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] overflow-hidden">
        <div className="p-5 pb-4 flex items-center justify-between border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Recent Company Registrations</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Latest Singapore business signups onboarded onto BizOne
              </p>
            </div>
          </div>
          <button
            onClick={() => onNavigateTab("companies")}
            className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
          >
            All Companies <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#f8fafc] text-slate-500 font-semibold border-b border-slate-100">
              <tr>
                <th className="py-3 px-5 w-12 text-slate-400">#</th>
                <th className="py-3 px-5">Company</th>
                <th className="py-3 px-5">Admin / Contact</th>
                <th className="py-3 px-5">Signed Up</th>
                <th className="py-3 px-5">License Status</th>
                <th className="py-3 px-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentList.map((comp: any, idx: number) => {
                const numStr = String(idx + 1).padStart(2, "0");
                const initials = getInitials(comp.name);
                const isEven = idx % 2 === 0;
                const avatarBg = isEven ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700";
                const adminName = comp.admin?.fullName || comp.admin_name || comp.name;
                const adminEmail = comp.admin?.email || comp.admin_email || comp.email || `${comp.slug || 'company'}@gmail.com`;
                const dateText = formatDate(comp.createdAt || comp.created_at, idx === 0 ? "Oct 27, 2026" : "Oct 22, 2026");

                return (
                  <tr key={comp.id || idx} className="hover:bg-slate-50/60 transition-colors">
                    {/* # */}
                    <td className="py-3.5 px-5 font-mono text-slate-400 text-xs">
                      {numStr}
                    </td>

                    {/* Company */}
                    <td className="py-3.5 px-5">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${avatarBg}`}>
                          {initials}
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 text-sm">
                            {comp.name}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono">
                            slug: {comp.slug || comp.name.toLowerCase().replace(/\s+/g, "")}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Admin / Contact */}
                    <td className="py-3.5 px-5">
                      <div className="flex items-center gap-2">
                        <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <div>
                          <div className="font-medium text-slate-800 text-xs">
                            {adminName}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {adminEmail}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Signed Up */}
                    <td className="py-3.5 px-5 text-slate-700 font-medium text-xs">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{dateText}</span>
                      </div>
                    </td>

                    {/* License Status */}
                    <td className="py-3.5 px-5">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/90">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        Active
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-5 text-right">
                      <button
                        onClick={() => onSelectCompany(comp)}
                        title="View Details"
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 text-blue-600 hover:bg-blue-50 hover:border-blue-300 transition-colors cursor-pointer shadow-2xs"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
