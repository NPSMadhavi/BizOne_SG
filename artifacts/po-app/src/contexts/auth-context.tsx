import React, { createContext, useContext, useEffect, useState } from "react";
import { useGetMe, getGetMeQueryKey, useLogout, type User, type UserCompany } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";

export const ALL_MODULES = ["dashboard", "purchase_orders", "quotations", "invoices", "delivery_orders", "grn", "stock_items"] as const;
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
};

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
    // dashboard is always opt-in — never auto-granted via empty-list fallback
    if (module === "dashboard") return mods.includes("dashboard");
    return mods.length === 0 || mods.includes(module);
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
