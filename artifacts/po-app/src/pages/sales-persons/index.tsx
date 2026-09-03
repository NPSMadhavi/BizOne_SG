import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit2, Trash2 } from "lucide-react";
import {
  ManagementPageHeader,
  ManagementSearchBar,
  ManagementTableCard,
  ManagementTableContainer,
  ManagementEmptyState,
  ManagementIconAction,
} from "@/operations-8june/components/layout/ManagementPageUI";
import { useSalesPersons, type SalesPerson } from "@/hooks/use-sales-persons";
import { usePagination } from "@/hooks/use-pagination";

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

  const { page, setPage, totalPages, paginatedItems } = usePagination(filteredSalesPersons);

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
    <>
      <ManagementPageHeader
        title="Sales Persons"
        action={
          <Button
            className="gap-2 bg-[#2563EB] text-white shadow-sm hover:bg-[#2563EB]"
            onClick={handleOpenNew}
          >
            <Plus className="h-4 w-4" /> Create Sales Person
          </Button>
        }
      />

      <div className="mb-6 flex items-center justify-between gap-2">
        <div className="w-full max-w-md [&>div]:mb-0">
          <ManagementSearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search..."
          />
        </div>
      </div>

      <ManagementTableCard pagination={{ page, totalPages, onPageChange: setPage }}>
        {filteredSalesPersons.length > 0 ? (
          <ManagementTableContainer>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Employment Code</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead className="w-px text-left">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedItems.map((person) => (
                  <TableRow key={person.id}>
                    <TableCell className="font-medium text-[#111827]">{person.name}</TableCell>
                    <TableCell>
                      {person.employmentCode
                        ? <Badge variant="outline" className="font-mono text-xs">{person.employmentCode}</Badge>
                        : <span className="text-xs text-[#6B7280]">—</span>}
                    </TableCell>
                    <TableCell className="text-[#444651]">{person.department || "—"}</TableCell>
                    <TableCell className="text-[#444651]">{person.phone || "—"}</TableCell>
                    <TableCell className="text-[#444651]">{person.country || "—"}</TableCell>
                    <TableCell className="max-w-xs truncate text-xs text-[#6B7280]" title={person.address}>
                      {person.address || "—"}
                    </TableCell>
                    <TableCell className="w-px whitespace-nowrap">
                      <div className="flex items-center justify-start gap-2">
                        <ManagementIconAction label="Edit sales person" onClick={() => handleOpenEdit(person)}>
                          <Edit2 className="h-4 w-4" />
                        </ManagementIconAction>
                        <ManagementIconAction
                          variant="delete"
                          label="Delete sales person"
                          onClick={() => setDeleteTargetId(person.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </ManagementIconAction>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ManagementTableContainer>
        ) : (
          <ManagementEmptyState
            title={search ? "No results found" : "No sales persons yet"}
            description={
              search
                ? "Try adjusting your search terms."
                : "Create your first sales person to assign on invoices and reports."
            }
            action={
              !search ? (
                <Button
                  className="bg-[#2563EB] text-white shadow-sm hover:bg-[#2563EB]"
                  onClick={handleOpenNew}
                >
                  <Plus className="mr-2 h-4 w-4" /> Create Sales Person
                </Button>
              ) : undefined
            }
          />
        )}
      </ManagementTableCard>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Sales Person" : "Create Sales Person"}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSave} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>
                Sales Person Name <span className="text-red-500">*</span>
              </Label>
              <Input
                placeholder="Enter sales person name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Employment Code</Label>
                <Input
                  placeholder="e.g. EMP-1001"
                  value={form.employmentCode}
                  onChange={(e) => setForm({ ...form, employmentCode: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Department</Label>
                <Input
                  placeholder="e.g. Sales / Marketing"
                  value={form.department}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Phone Number</Label>
                <Input
                  placeholder="e.g. +65 9123 4567"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Country</Label>
                <Input
                  placeholder="e.g. Singapore"
                  value={form.country}
                  onChange={(e) => setForm({ ...form, country: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Address</Label>
              <Textarea
                rows={3}
                placeholder="Enter full address"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>

            <DialogFooter className="gap-2 pt-3">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-[#2563EB] hover:bg-[#2563EB]">
                {editingId ? "Update Sales Person" : "Save Sales Person"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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
              className="bg-destructive hover:bg-destructive/90"
              onClick={handleDeleteConfirm}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
