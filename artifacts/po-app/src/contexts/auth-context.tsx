import React, { createContext, useContext, useEffect, useState } from "react";
import { useGetMe, getGetMeQueryKey, useLogout, type User, type Company } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  logout: () => void;
  isAdmin: boolean;
  selectedCompany: Company | null;
  setSelectedCompanyId: (id: number) => void;
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
  const effectiveCompanyId = localCompanyId ?? user?.selectedCompanyId ?? null;
  const selectedCompany = user?.companies?.find(c => c.id === effectiveCompanyId) ?? null;

  return (
    <AuthContext.Provider value={{
      user: user || null,
      isLoading,
      logout: handleLogout,
      isAdmin,
      selectedCompany,
      setSelectedCompanyId,
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
