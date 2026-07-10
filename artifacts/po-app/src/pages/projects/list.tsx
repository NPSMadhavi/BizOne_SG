import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, FolderKanban, ChevronRight, TrendingUp } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";

interface Project {
  id: number;
  name: string;
  code: string | null;
  description: string | null;
  status: string;
  budget: number | null;
  spent: number;
  startDate: string | null;
  endDate: string | null;
  createdByUsername: string | null;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-700 border-green-200",
  completed: "bg-blue-100 text-blue-700 border-blue-200",
  "on-hold": "bg-amber-100 text-amber-700 border-amber-200",
};

function fmt(n: number, currency = "SGD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2 }).format(n);
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function ProjectList() {
  const [, setLocation] = useLocation();
  const { isAdmin, hasModuleAccess } = useAuth();

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: async () => {
      const r = await fetch("/api/projects", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to fetch projects");
      return r.json();
    },
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <FolderKanban className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Projects</h1>
            <p className="text-sm text-muted-foreground">Track project expenses with vouchers</p>
          </div>
        </div>
        {(isAdmin || hasModuleAccess("projects")) && (
          <Button onClick={() => setLocation("/projects/new")} className="gap-2">
            <Plus className="h-4 w-4" />
            New Project
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed border-border rounded-xl">
          <FolderKanban className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground font-medium">No projects yet</p>
          <p className="text-sm text-muted-foreground mt-1">Create your first project to start tracking expenses</p>
          <Button className="mt-4 gap-2" onClick={() => setLocation("/projects/new")}>
            <Plus className="h-4 w-4" />
            Create Project
          </Button>
        </div>
      ) : (
        <div className="grid gap-4">
          {projects.map((p) => {
            const pct = p.budget && p.budget > 0 ? Math.min((p.spent / p.budget) * 100, 100) : null;
            const over = p.budget && p.spent > p.budget;
            return (
              <div
                key={p.id}
                className="bg-card border border-border rounded-xl p-5 hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer group"
                onClick={() => setLocation(`/projects/${p.id}`)}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h2 className="font-semibold text-foreground text-base truncate">{p.name}</h2>
                      {p.code && (
                        <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
                          {p.code}
                        </span>
                      )}
                      <Badge className={`text-xs border shrink-0 ${STATUS_COLORS[p.status] || "bg-gray-100 text-gray-600"}`}>
                        {p.status.charAt(0).toUpperCase() + p.status.slice(1)}
                      </Badge>
                    </div>
                    {p.description && (
                      <p className="text-sm text-muted-foreground line-clamp-1 mb-2">{p.description}</p>
                    )}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {p.startDate && <span>Start: {fmtDate(p.startDate)}</span>}
                      {p.endDate && <span>End: {fmtDate(p.endDate)}</span>}
                      {p.createdByUsername && <span>By: {p.createdByUsername}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right">
                      <div className="flex items-center gap-1.5 justify-end">
                        <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className={`text-sm font-semibold ${over ? "text-red-600" : "text-foreground"}`}>
                          {fmt(p.spent)}
                        </span>
                      </div>
                      {p.budget !== null && (
                        <div className="text-xs text-muted-foreground mt-0.5">of {fmt(p.budget)} budget</div>
                      )}
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                </div>

                {p.budget !== null && p.budget > 0 && pct !== null && (
                  <div className="mt-3">
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${over ? "bg-red-500" : pct > 80 ? "bg-amber-500" : "bg-green-500"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex justify-between mt-0.5">
                      <span className="text-[10px] text-muted-foreground">{pct.toFixed(0)}% used</span>
                      {over && <span className="text-[10px] text-red-600 font-medium">Over budget!</span>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
