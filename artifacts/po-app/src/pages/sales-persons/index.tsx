import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Edit2, Trash2, UserCheck, Phone, MapPin, Building, Globe } from "lucide-react";
import { useSalesPersons, type SalesPerson } from "@/hooks/use-sales-persons";

const blankForm = (): Omit<SalesPerson, "id" | "createdAt"> => ({
  name: "",
  employmentCode: "",
  department: "",
  phone: "",
  country: "Singapore",
  address: "",
});

export default function SalesPersonsPage() {
  const { toast } = useToast();
  const { salesPersons, saveSalesPerson, deleteSalesPerson } = useSalesPersons();

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<SalesPerson, "id" | "createdAt">>(blankForm());
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const filteredSalesPersons = useMemo(() => {
    const term = search.toLowerCase().trim();
    if (!term) return salesPersons;
    return salesPersons.filter(
      (sp) =>
        sp.name.toLowerCase().includes(term) ||
        sp.employmentCode.toLowerCase().includes(term) ||
        sp.department.toLowerCase().includes(term) ||
        sp.phone.toLowerCase().includes(term) ||
        sp.country.toLowerCase().includes(term)
    );
  }, [salesPersons, search]);

  const handleOpenNew = () => {
    setEditingId(null);
    setForm(blankForm());
    setDialogOpen(true);
  };

  const handleOpenEdit = (person: SalesPerson) => {
    setEditingId(person.id);
    setForm({
      name: person.name,
      employmentCode: person.employmentCode,
      department: person.department,
      phone: person.phone,
      country: person.country,
      address: person.address,
    });
    setDialogOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast({
        title: "Validation Error",
        description: "Sales Person Name is required.",
        variant: "destructive",
      });
      return;
    }

    saveSalesPerson({
      ...form,
      id: editingId || undefined,
    });

    toast({
      title: editingId ? "Sales Person Updated" : "Sales Person Created",
      description: `${form.name} has been ${editingId ? "updated" : "created"} successfully.`,
    });

    setDialogOpen(false);
    setEditingId(null);
    setForm(blankForm());
  };

  const handleDeleteConfirm = () => {
    if (!deleteTargetId) return;
    deleteSalesPerson(deleteTargetId);
    toast({
      title: "Sales Person Deleted",
      description: "The sales person record has been deleted.",
    });
    setDeleteTargetId(null);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#132d52] flex items-center gap-2">
            <UserCheck className="h-7 w-7 text-[#1265d8]" /> Sales Persons
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage sales personnel, employment codes, departments, and contact details.
          </p>
        </div>
        <Button onClick={handleOpenNew} className="gap-2 bg-[#1265d8] hover:bg-[#0d55b8] shadow-sm">
          <Plus className="h-4 w-4" /> Create Sales Person
        </Button>
      </div>

      {/* Main Card */}
      <Card className="shadow-sm">
        <CardHeader className="border-b py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base font-semibold text-slate-800">
              Sales Personnel List ({filteredSalesPersons.length})
            </CardTitle>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, code, dept..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 text-xs"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#102d52] text-left text-white uppercase text-[11px] font-semibold">
                <tr>
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Sales Person Name</th>
                  <th className="px-4 py-3">Employment Code</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">Phone Number</th>
                  <th className="px-4 py-3">Country</th>
                  <th className="px-4 py-3">Address</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y text-slate-700">
                {filteredSalesPersons.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                      No sales persons found. Click "Create Sales Person" to add one.
                    </td>
                  </tr>
                ) : (
                  filteredSalesPersons.map((person, index) => (
                    <tr key={person.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3 font-semibold text-slate-500">{index + 1}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900 flex items-center gap-2">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[#1265d8] font-bold text-[11px]">
                          {person.name.charAt(0).toUpperCase()}
                        </div>
                        {person.name}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="font-mono text-[10px] bg-slate-50 border-slate-300">
                          {person.employmentCode || "—"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className="bg-blue-50 text-[#1265d8] border-blue-200 hover:bg-blue-50">
                          {person.department || "Sales"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 text-slate-600">
                          <Phone className="h-3 w-3 text-slate-400" />
                          {person.phone || "—"}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 text-slate-600">
                          <Globe className="h-3 w-3 text-slate-400" />
                          {person.country || "—"}
                        </div>
                      </td>
                      <td className="px-4 py-3 max-w-xs truncate text-slate-500" title={person.address}>
                        {person.address || "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-slate-600 hover:text-[#1265d8] hover:bg-blue-50"
                            onClick={() => handleOpenEdit(person)}
                            title="Edit sales person"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-slate-600 hover:text-red-600 hover:bg-red-50"
                            onClick={() => setDeleteTargetId(person.id)}
                            title="Delete sales person"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Popup Modal / Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-[#132d52] flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-[#1265d8]" />
              {editingId ? "Edit Sales Person" : "Create Sales Person"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSave} className="space-y-4 py-2">
            {/* Sales Person Name */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">
                Sales Person Name <span className="text-red-500">*</span>
              </Label>
              <Input
                placeholder="Enter sales person name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>

            {/* Employment Code & Department */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Employment Code</Label>
                <Input
                  placeholder="e.g. EMP-1001"
                  value={form.employmentCode}
                  onChange={(e) => setForm({ ...form, employmentCode: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Department</Label>
                <Input
                  placeholder="e.g. Sales / Marketing"
                  value={form.department}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                />
              </div>
            </div>

            {/* Phone Number & Country */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Phone Number</Label>
                <Input
                  placeholder="e.g. +65 9123 4567"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Country</Label>
                <Input
                  placeholder="e.g. Singapore"
                  value={form.country}
                  onChange={(e) => setForm({ ...form, country: e.target.value })}
                />
              </div>
            </div>

            {/* Address */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Address</Label>
              <Textarea
                rows={3}
                placeholder="Enter full address"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>

            <DialogFooter className="pt-3 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" className="bg-[#1265d8] hover:bg-[#0d55b8]">
                {editingId ? "Update Sales Person" : "Save Sales Person"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Alert */}
      <AlertDialog open={Boolean(deleteTargetId)} onOpenChange={(open) => !open && setDeleteTargetId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Sales Person</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this sales person? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={handleDeleteConfirm}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
