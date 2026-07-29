import React, { createContext, useContext, useEffect, useState } from "react";
import { useGetMe, getGetMeQueryKey, useLogout, type User, type UserCompany } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ALL_MODULES, DEFAULT_MODULES, type AppModule } from "./auth-modules";

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  logout: () => void;
  isAdmin: boolean;
  isAccountant: boolean;
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
  const isAccountant = user?.role === "accountant";
  const isExternal = user?.role === "external";
  const effectiveCompanyId = localCompanyId ?? user?.selectedCompanyId ?? null;
  const selectedCompany = user?.companies?.find(c => c.id === effectiveCompanyId) ?? null;

  const hasModuleAccess = (module: AppModule): boolean => {
    // Admin + Accountant both get access to all modules
    // (System Settings page is separately gated to isAdmin only in the shell)
    if (isAdmin || isAccountant) return true;
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
      isAccountant,
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
