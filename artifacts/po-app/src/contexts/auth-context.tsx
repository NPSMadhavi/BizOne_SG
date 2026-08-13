import React, { createContext, useContext, useEffect, useState } from "react";
import { useGetMe, getGetMeQueryKey, useLogout, type User, type UserCompany } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { type AppModule } from "./auth-modules";
import { clearBrowserSessionLive, isBrowserSessionLive } from "@/lib/browser-session";

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  logout: () => void;
  isAdmin: boolean;
  isAccountant: boolean;
  isExternal: boolean;
  /** true for admin OR accountant — use this to gate edit/delete actions in all non-Settings pages */
  canManage: boolean;
  selectedCompany: UserCompany | null;
  setSelectedCompanyId: (id: number) => void;
  hasModuleAccess: (module: AppModule) => boolean;
  hasPermission: (permission: string) => boolean;
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
  const forcingLogin = React.useRef(false);

  const handleLogout = () => {
    clearBrowserSessionLive();
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        queryClient.setQueryData(getGetMeQueryKey(), null);
        setLocalCompanyId(null);
        setLocation("/");
      },
    });
  };

  // If server still has a cookie session but this browser run was closed, force login.
  useEffect(() => {
    if (isLoading || !user || forcingLogin.current) return;
    if (isBrowserSessionLive()) return;
    forcingLogin.current = true;
    clearBrowserSessionLive();
    logoutMutation.mutate(undefined, {
      onSettled: () => {
        queryClient.setQueryData(getGetMeQueryKey(), null);
        setLocalCompanyId(null);
        setLocation("/login");
        forcingLogin.current = false;
      },
    });
  }, [isLoading, user]);

  const sessionOk = !user || isBrowserSessionLive();
  const resolvedUser = sessionOk ? (user || null) : null;
  const resolvedLoading = isLoading || (!!user && !sessionOk);

  const setSelectedCompanyId = (id: number) => {
    setLocalCompanyId(id);
    queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
  };

  const rawRole = (resolvedUser?.role || "").trim().toLowerCase();
  const isAdmin = rawRole === "admin" || rawRole === "administrator";
  const isAccountant = rawRole === "accountant";
  const isExternal = rawRole === "external";
  const canManage = isAdmin || isAccountant;
  const effectiveCompanyId = localCompanyId ?? resolvedUser?.selectedCompanyId ?? null;
  const selectedCompany = resolvedUser?.companies?.find(c => c.id === effectiveCompanyId) ?? null;

  const hasModuleAccess = (module: AppModule): boolean => {
    // Only company admins get every module. Everyone else (user / accountant / external)
    // is gated strictly by user_companies.modules — no DEFAULT/ALL fallbacks.
    if (isAdmin) return true;
    if (!selectedCompany) return false;
    const mods = selectedCompany.modules;
    if (!Array.isArray(mods) || mods.length === 0) return false;
    return mods.includes(module);
  };

  const hasPermission = (permission: string): boolean => {
    if (!resolvedUser) return false;
    return (resolvedUser as any).permissions?.includes(permission) ?? false;
  };

  return (
    <AuthContext.Provider value={{
      user: resolvedUser,
      isLoading: resolvedLoading,
      logout: handleLogout,
      isAdmin,
      isAccountant,
      isExternal,
      canManage,
      selectedCompany,
      setSelectedCompanyId,
      hasModuleAccess,
      hasPermission,
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
