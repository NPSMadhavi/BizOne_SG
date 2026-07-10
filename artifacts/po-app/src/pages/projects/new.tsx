import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, FolderKanban } from "lucide-react";

export default function ProjectNew() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [form, setForm] = useState({
    name: "",
    code: "",
    description: "",
    status: "active",
    budget: "",
    startDate: "",
    endDate: "",
  });

  const mutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const r = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ...data,
          budget: data.budget ? parseFloat(data.budget) : null,
        }),
      });
      if (!r.ok) {
        const err = await r.json();
        throw new Error(err.error || "Failed to create project");
      }
      return r.json();
    },
    onSuccess: (project) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast({ title: "Project created" });
      setLocation(`/projects/${project.id}`);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const set = (field: string, val: string) => setForm(f => ({ ...f, [field]: val }));

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/projects")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2">
          <FolderKanban className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold">New Project</h1>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-6 max-w-2xl">
        <div className="grid gap-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label htmlFor="name">Project Name *</Label>
              <Input
                id="name"
                className="mt-1"
                placeholder="e.g. Office Renovation Phase 1"
                value={form.name}
                onChange={e => set("name", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="code">Project Code</Label>
              <Input
                id="code"
                className="mt-1"
                placeholder="e.g. PROJ-001"
                value={form.code}
                onChange={e => set("code", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="status">Status</Label>
              <Select value={form.status} onValueChange={v => set("status", v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="on-hold">On Hold</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              className="mt-1"
              rows={3}
              placeholder="Brief description of the project..."
              value={form.description}
              onChange={e => set("description", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="budget">Budget (optional)</Label>
              <Input
                id="budget"
                className="mt-1"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={form.budget}
                onChange={e => set("budget", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="startDate">Start Date</Label>
              <Input
                id="startDate"
                className="mt-1"
                type="date"
                value={form.startDate}
                onChange={e => set("startDate", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="endDate">End Date</Label>
              <Input
                id="endDate"
                className="mt-1"
                type="date"
                value={form.endDate}
                onChange={e => set("endDate", e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6 pt-5 border-t border-border">
          <Button variant="outline" onClick={() => setLocation("/projects")}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate(form)}
            disabled={!form.name.trim() || mutation.isPending}
          >
            {mutation.isPending ? "Creating…" : "Create Project"}
          </Button>
        </div>
      </div>
    </div>
  );
}
