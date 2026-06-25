// @refresh reset
import React, { createContext, useContext, useEffect, useState } from "react";
import { useGetMe, getGetMeQueryKey, useLogout, type User, type UserCompany } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";

export const ALL_MODULES = [
  "dashboard",
  "purchase_orders", "quotations", "invoices", "delivery_orders", "grn", "stock_items",
  "vendors", "customers",
  "accounting_coa", "accounting_je", "accounting_gl", "accounting_tb", "accounting_bs",
  "accounting_pl", "accounting_cf",
  "accounting_gst_f5", "accounting_gst_f7", "accounting_gst_io",
  "accounting_wht", "accounting_eci", "accounting_formcs", "accounting_iaf",
  "accounting_ar_aging", "accounting_cust_stmt", "accounting_ap_aging", "accounting_vendor_stmt",
] as const;

export const DEFAULT_MODULES = ["purchase_orders", "quotations", "invoices", "delivery_orders"] as const;
export type AppModule = typeof ALL_MODULES[number];

export const MODULE_LABELS: Record<AppModule, string> = {
  dashboard: "Dashboard",
  purchase_orders: "Purchase Orders",
  quotations: "Quotations",
  invoices: "Invoices",
  delivery_orders: "Delivery Orders",
  grn: "Goods Receipt",
  stock_items: "Stock Items",
  vendors: "Vendors",
  customers: "Customers",
  accounting_coa: "Chart of Accounts",
  accounting_je: "Journal Entries",
  accounting_gl: "General Ledger",
  accounting_tb: "Trial Balance",
  accounting_bs: "Balance Sheet",
  accounting_pl: "Profit & Loss",
  accounting_cf: "Cash Flow",
  accounting_gst_f5: "GST F5 Return",
  accounting_gst_f7: "GST F7 (Amended)",
  accounting_gst_io: "GST IO Listing",
  accounting_wht: "Withholding Tax",
  accounting_eci: "ECI",
  accounting_formcs: "Form C-S",
  accounting_iaf: "IRAS Audit File",
  accounting_ar_aging: "AR Aging",
  accounting_cust_stmt: "Customer Statement",
  accounting_ap_aging: "AP Aging",
  accounting_vendor_stmt: "Vendor Statement",
};

export interface ModuleGroup {
  id: string;
  label: string;
  sgOnly?: boolean;
  modules: AppModule[];
}

export const MODULE_GROUPS: ModuleGroup[] = [
  {
    id: "documents",
    label: "Documents",
    modules: ["purchase_orders", "quotations", "invoices", "delivery_orders", "grn", "stock_items"],
  },
  {
    id: "directory",
    label: "Directory",
    modules: ["vendors", "customers"],
  },
  {
    id: "accounting",
    label: "Accounting",
    sgOnly: true,
    modules: [
      "accounting_coa", "accounting_je", "accounting_gl", "accounting_tb", "accounting_bs",
      "accounting_pl", "accounting_cf",
      "accounting_gst_f5", "accounting_gst_f7", "accounting_gst_io",
      "accounting_wht", "accounting_eci", "accounting_formcs", "accounting_iaf",
      "accounting_ar_aging", "accounting_cust_stmt", "accounting_ap_aging", "accounting_vendor_stmt",
    ],
  },
];

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  logout: () => void;
  isAdmin: boolean;
  isExternal: boolean;
  selectedCompany: UserCompany | null;
  setSelectedCompanyId: (id: number) => void;
  hasModuleAccess: (module: AppModule) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [localCompanyId, setLocalCompanyId] = useState<number | null>(null);

  const { data: user, isLoading } = useGetMe({
    query: {
      queryKey: getGetMeQueryKey(),
      retry: false,
    },
  });

  useEffect(() => {
    if (user?.selectedCompanyId && !localCompanyId) {
      setLocalCompanyId(user.selectedCompanyId);
    }
  }, [user?.selectedCompanyId]);

  const logoutMutation = useLogout();

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        queryClient.setQueryData(getGetMeQueryKey(), null);
        setLocalCompanyId(null);
        setLocation("/login");
      },
    });
  };

  const setSelectedCompanyId = (id: number) => {
    setLocalCompanyId(id);
    queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
  };

  const isAdmin = user?.role === "admin";
  const isExternal = user?.role === "external";
  const effectiveCompanyId = localCompanyId ?? user?.selectedCompanyId ?? null;
  const selectedCompany = user?.companies?.find(c => c.id === effectiveCompanyId) ?? null;

  const hasModuleAccess = (module: AppModule): boolean => {
    if (isAdmin) return true;
    if (!selectedCompany) return false;
    const mods = selectedCompany.modules ?? [];
    if (mods.length === 0) {
      return (DEFAULT_MODULES as readonly string[]).includes(module);
    }
    return mods.includes(module);
  };

  return (
    <AuthContext.Provider value={{
      user: user || null,
      isLoading,
      logout: handleLogout,
      isAdmin,
      isExternal,
      selectedCompany,
      setSelectedCompanyId,
      hasModuleAccess,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
