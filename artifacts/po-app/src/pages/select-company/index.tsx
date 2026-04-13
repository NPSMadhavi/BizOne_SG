import { useAuth } from "@/contexts/auth-context";
import { useSelectCompany } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { Building2, Globe, MapPin } from "lucide-react";
import logo from "@assets/logo_1776054030755.png";

export default function SelectCompany() {
  const { user, setSelectedCompanyId } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const selectCompany = useSelectCompany();

  const companies = user?.companies ?? [];

  function handleSelect(companyId: number) {
    selectCompany.mutate({ data: { companyId } }, {
      onSuccess: () => {
        setSelectedCompanyId(companyId);
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        setLocation("/dashboard");
      },
    });
  }

  const getFlagEmoji = (country: string) => {
    if (country === "Singapore") return "🇸🇬";
    if (country === "India") return "🇮🇳";
    return "🌐";
  };

  return (
    <div className="min-h-screen bg-muted/20 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-2xl space-y-8">
        <div className="text-center space-y-3">
          <img src={logo} alt="Logo" className="h-12 mx-auto" />
          <h1 className="text-3xl font-bold tracking-tight">Select Company</h1>
          <p className="text-muted-foreground">
            Choose the company you want to work with for this session.
          </p>
        </div>

        <div className={`grid gap-4 ${companies.length === 1 ? "grid-cols-1 max-w-sm mx-auto" : companies.length === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-3"}`}>
          {companies.map((company) => (
            <button
              key={company.id}
              onClick={() => handleSelect(company.id)}
              disabled={selectCompany.isPending}
              className="group flex flex-col gap-3 p-6 rounded-xl border bg-card text-left hover:border-primary hover:shadow-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50"
            >
              <div className="flex items-start justify-between">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <span className="text-2xl">{getFlagEmoji(company.country)}</span>
              </div>
              <div className="space-y-1">
                <h3 className="font-semibold text-sm leading-tight group-hover:text-primary transition-colors">
                  {company.name}
                </h3>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Globe className="h-3 w-3 shrink-0" />
                  {company.country}
                </div>
                {company.address && (
                  <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3 shrink-0 mt-0.5" />
                    <span className="line-clamp-2">{company.address}</span>
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Logged in as <span className="font-medium">{user?.username}</span>
        </p>
      </div>
    </div>
  );
}
