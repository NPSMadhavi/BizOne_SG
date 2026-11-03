import React, { useState, useEffect } from "react";
import {
  Shield,
  LayoutDashboard,
  Building2,
  Key,
  Layers,
  RotateCcw,
  ShieldAlert,
  LogOut,
  User,
  Sparkles,
  RefreshCw,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Bell,
  Crown,
  Cloud,
  MoreVertical,
  Calendar,
  Menu,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { clearBrowserSessionLive } from "@/lib/browser-session";
import bizoneLogo from "@assets/bizone_logo_optimized.webp";
import bizoneSgLogo from "@assets/bizone_sg_optimized.webp";
import bizoneLogoPng from "@/assets/BizOne_logo.png";
import bizoneIcon from "@/assets/BizOne_icon.png";
import singaporeSeamless from "@/assets/singapore_seamless.jpg";
import { SuperAdminLogin } from "./SuperAdminLogin";
import { DashboardTab } from "./DashboardTab";
import { CompaniesTab } from "./CompaniesTab";
import { LicensesTab } from "./LicensesTab";
import { PlansTab } from "./PlansTab";
import { RenewalsTab } from "./RenewalsTab";
import { AuditLogsTab } from "./AuditLogsTab";
import {
  getSuperAdminMe,
  superAdminLogout,
  getDashboardData,
} from "./api";
import type {
  SuperAdminUser,
  DashboardData,
  SuperAdminCompany,
  SuperAdminLicense,
} from "./types";

export default function SuperAdminPage() {
  const [currentUser, setCurrentUser] = useState<SuperAdminUser | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [activeTab, setActiveTab] = useState<string>("dashboard");
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);

  // Dashboard Data
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [isDashboardLoading, setIsDashboardLoading] = useState(false);

  // Cross-tab interaction states
  const [selectedCompanyForLicense, setSelectedCompanyForLicense] = useState<SuperAdminCompany | null>(null);
  const [selectedLicenseForRenewal, setSelectedLicenseForRenewal] = useState<SuperAdminLicense | null>(null);
  const [selectedCompanyForDetails, setSelectedCompanyForDetails] = useState<SuperAdminCompany | null>(null);

  // 1. Initial Auth Check
  const checkAuth = async () => {
    setIsCheckingAuth(true);
    try {
      const res = await getSuperAdminMe();
      if (res?.user && res.user.role === "super_admin") {
        setCurrentUser(res.user);
      } else {
        setCurrentUser(null);
      }
    } catch {
      setCurrentUser(null);
    } finally {
      setIsCheckingAuth(false);
    }
  };

  useEffect(() => {
    checkAuth();
    document.documentElement.classList.remove("app-shell-lock");
  }, []);

  // 2. Fetch Dashboard Data
  const fetchDashboard = async () => {
    if (!currentUser) return;
    setIsDashboardLoading(true);
    try {
      const data = await getDashboardData();
      setDashboardData(data);
    } catch (err) {
      console.error("Failed to load dashboard data:", err);
    } finally {
      setIsDashboardLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser) {
      fetchDashboard();
    }
  }, [currentUser]);

  const handleLogout = async () => {
    try {
      await superAdminLogout();
    } catch (err) {
      console.warn("Logout error:", err);
    } finally {
      clearBrowserSessionLive();
      setCurrentUser(null);
      setDashboardData(null);
      setIsProfileMenuOpen(false);
    }
  };

  // Cross-tab handlers
  const handleCreateLicenseForCompany = (company: SuperAdminCompany) => {
    setSelectedCompanyForLicense(company);
    setActiveTab("licenses");
    setIsMobileSidebarOpen(false);
  };

  const handleRenewLicenseDirect = (license: SuperAdminLicense) => {
    setSelectedLicenseForRenewal(license);
    setActiveTab("renewals");
    setIsMobileSidebarOpen(false);
  };

  const handleSelectCompanyFromDashboard = (company: SuperAdminCompany) => {
    setSelectedCompanyForDetails(company);
    setActiveTab("companies");
    setIsMobileSidebarOpen(false);
  };

  // 3. Loading state
  if (isCheckingAuth) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#061234] text-white space-y-4">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-semibold text-slate-300">Verifying Super Admin Authorization...</p>
      </div>
    );
  }

  // 4. Unauthenticated -> Render Dedicated Super Admin Login
  if (!currentUser) {
    return (
      <SuperAdminLogin
        onLoginSuccess={(user) => {
          setCurrentUser(user);
        }}
      />
    );
  }

  // 5. Authenticated -> Navigation Tabs (All arrows removed per request)
  const navTabs = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "companies", label: "Registered Companies", icon: Building2 },
    { id: "licenses", label: "License Management", icon: Key },
    { id: "plans", label: "Subscription Plans", icon: Layers },
    { id: "renewals", label: "Renewal Desk", icon: RotateCcw },
    { id: "audit", label: "Security & Audit", icon: ShieldAlert },
  ];

  const activeTabMeta = navTabs.find((t) => t.id === activeTab) || navTabs[0];

  return (
    <div className="h-screen w-full overflow-hidden bg-[#f4f6fa] text-slate-900 flex font-sans antialiased">
      {/* Mobile Sidebar Overlay */}
      {isMobileSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-xs md:hidden"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}

      {/* LEFT SIDEBAR (Dark Navy Blue #061234 matching exact target mockup) */}
      <aside
        className={`fixed md:static top-0 left-0 z-50 h-screen ${
          isSidebarCollapsed ? "w-20" : "w-64"
        } bg-[#061234] text-white border-r border-[#152347] flex flex-col shrink-0 transition-all duration-300 ease-in-out select-none md:translate-x-0 ${
          isMobileSidebarOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full md:translate-x-0"
        }`}
      >
        {/* Top Header: Official BizOne Logo */}
        {!isSidebarCollapsed ? (
          <div className="px-4 pt-4 pb-2 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <img
                src={bizoneLogoPng || bizoneSgLogo || bizoneLogo}
                alt="BizOne"
                className="h-13 sm:h-15 w-auto object-contain object-left max-w-[195px] filter drop-shadow-[0_2px_8px_rgba(0,0,0,0.3)]"
                onError={(e) => {
                  if (bizoneLogo) (e.currentTarget as HTMLImageElement).src = bizoneLogo;
                }}
              />
            </div>

            {/* Collapse Arrow */}
            <button
              onClick={() => {
                if (window.innerWidth < 768) {
                  setIsMobileSidebarOpen(false);
                } else {
                  setIsSidebarCollapsed(true);
                }
              }}
              title="Collapse sidebar"
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer shrink-0 ml-1"
            >
              <ChevronLeft className="w-4 h-4 text-slate-300" />
            </button>
          </div>
        ) : (
          <div className="px-2 pt-4 pb-2 flex flex-col items-center gap-2 shrink-0">
            {/* Collapsed official B1° circle emblem */}
            <img
              src={bizoneIcon}
              alt="BizOne"
              className="w-11 h-11 object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,0.3)] select-none"
            />

            {/* Expand Arrow */}
            <button
              onClick={() => {
                if (window.innerWidth < 768) {
                  setIsMobileSidebarOpen(false);
                } else {
                  setIsSidebarCollapsed(false);
                }
              }}
              title="Expand sidebar"
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
            >
              <ChevronRight className="w-4 h-4 text-white" />
            </button>
          </div>
        )}

        {/* Sidebar Navigation Items - Pinned to the TOP directly under header */}
        <nav className="px-3 py-2 space-y-1 shrink-0">
          {navTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setIsMobileSidebarOpen(false);
                }}
                title={tab.label}
                className={`w-full flex items-center ${
                  isSidebarCollapsed ? "justify-center px-2 py-3" : "justify-start px-3.5 py-2.5"
                } rounded-xl text-xs transition-all text-left cursor-pointer ${
                  isActive
                    ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white font-bold shadow-md shadow-blue-600/30"
                    : "text-slate-300 hover:text-white hover:bg-white/5 font-medium"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-white" : "text-slate-400"}`} />
                  {!isSidebarCollapsed && <span>{tab.label}</span>}
                </div>
              </button>
            );
          })}
        </nav>

        {/* Seamless Singapore Skyline Background (Expanded) or Spacer (Collapsed) */}
        {!isSidebarCollapsed ? (
          <div className="relative w-full flex-1 min-h-[220px] overflow-hidden select-none pointer-events-none mt-1">
            <img
              src={singaporeSeamless}
              alt="Singapore Marina Bay Sands Skyline"
              className="w-full h-full object-cover object-bottom"
            />
            {/* Soft top gradient to ensure 100% invisible transition */}
            <div className="absolute top-0 inset-x-0 h-16 bg-gradient-to-b from-[#061234] via-[#061234]/70 to-transparent pointer-events-none" />
          </div>
        ) : (
          <div className="flex-1" />
        )}

        {/* Sidebar Footer: Floating Profile Card */}
        <div className="p-3 shrink-0 relative z-10 mt-auto">
          <div className={`p-2.5 bg-[#05112f]/85 backdrop-blur-md border border-white/10 rounded-2xl flex items-center ${
            isSidebarCollapsed ? "justify-center" : "justify-between"
          } shadow-lg`}>
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="relative shrink-0">
                <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 text-white font-bold text-xs flex items-center justify-center ring-2 ring-blue-500/30">
                  SA
                </div>
                {/* Green online status dot */}
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-[#05112f]" />
              </div>
              {!isSidebarCollapsed && (
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white truncate leading-tight">
                    BizOne Super Administrator
                  </div>
                  <div className="text-[11px] text-slate-300 truncate mt-0.5" title={currentUser.email}>
                    {currentUser.email}
                  </div>
                </div>
              )}
            </div>

            {!isSidebarCollapsed && (
              <div className="relative">
                <button
                  onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                  className="p-1 text-slate-400 hover:text-white rounded-md cursor-pointer transition-colors"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>

                {isProfileMenuOpen && (
                  <div className="absolute bottom-full right-0 mb-2 w-44 bg-[#0a183d] border border-slate-700/80 rounded-xl shadow-xl py-1 z-50 text-xs">
                    <div className="px-3 py-1.5 border-b border-slate-800 text-[10px] text-slate-400 truncate">
                      Signed in as: {currentUser.username || "superadmin"}
                    </div>
                    <button
                      onClick={handleLogout}
                      className="w-full text-left px-3 py-2 text-rose-400 hover:bg-rose-950/40 flex items-center gap-2 cursor-pointer transition-colors"
                    >
                      <LogOut className="w-3.5 h-3.5 text-rose-400" />
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* RIGHT MAIN CONTENT AREA - SCROLLABLE */}
      <div className="flex-1 h-screen min-w-0 flex flex-col overflow-hidden">
        {/* Top Header Bar */}
        <header className="shrink-0 bg-white border-b border-slate-200/80 px-6 py-4 flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsMobileSidebarOpen(true)}
              className="md:hidden p-1.5 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight leading-tight">
              {activeTabMeta.label}
            </h1>
          </div>
        </header>

        {/* Scrollable Main Content Body */}
        <main className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6 lg:p-7">
          <div className="max-w-7xl mx-auto w-full pb-16">
            {activeTab === "dashboard" && (
              <DashboardTab
                data={dashboardData}
                isLoading={isDashboardLoading}
                onRefresh={fetchDashboard}
                onNavigateTab={(tab) => setActiveTab(tab)}
                onSelectCompany={handleSelectCompanyFromDashboard}
                onRenewLicense={handleRenewLicenseDirect}
              />
            )}

            {activeTab === "companies" && (
              <CompaniesTab
                onCreateLicenseForCompany={handleCreateLicenseForCompany}
                selectedCompanyForModal={selectedCompanyForDetails}
                onClearSelectedCompany={() => setSelectedCompanyForDetails(null)}
              />
            )}

            {activeTab === "licenses" && (
              <LicensesTab
                onRenewLicense={handleRenewLicenseDirect}
                preselectedCompanyForNewLicense={selectedCompanyForLicense}
                onClearPreselectedCompany={() => setSelectedCompanyForLicense(null)}
              />
            )}

            {activeTab === "plans" && <PlansTab />}

            {activeTab === "renewals" && (
              <RenewalsTab
                selectedLicenseForRenewal={selectedLicenseForRenewal}
                onClearSelectedLicense={() => setSelectedLicenseForRenewal(null)}
              />
            )}

            {activeTab === "audit" && <AuditLogsTab />}
          </div>
        </main>
      </div>
    </div>
  );
}
