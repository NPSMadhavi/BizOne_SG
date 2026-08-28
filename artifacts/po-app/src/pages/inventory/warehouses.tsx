import { useEffect, useState, useMemo } from "react";
import { inventoryApi } from "@/lib/inventory-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Search, Warehouse } from "lucide-react";
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
import { InventoryPageHeader, InventorySectionCard, InventoryStatusBadge } from "./inventory-page-ui";
import { usePagination } from "@/hooks/use-pagination";
import { ListPagination } from "@/components/list-pagination";
import { CountrySelect } from "@/operations-8june/components/forms/CountrySelect";
import { useSalesPersons } from "@/hooks/use-sales-persons";

const EMPTY = {
  code: "",
  name: "",
  address: "",
  city: "",
  state: "",
  pinCode: "",
  country: "Singapore",
  contactPerson: "",
  contactNumber: "",
  email: "",
  salesPerson: "",
  isActive: true,
  description: "",
  remarks: "",
};

export default function WarehousesPage() {
  const { toast } = useToast();
  const { salesPersons } = useSalesPersons();
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRow, setEditRow] = useState<any>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setRows(await inventoryApi.getWarehouses(search || undefined));
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function openCreate() {
    setEditRow(null);
    setForm({ ...EMPTY });
    setDialogOpen(true);
  }

  function openEdit(row: any) {
    setEditRow(row);
    setForm({
      code: row.code || "",
      name: row.name || "",
      address: row.address || "",
      city: row.city || "",
      state: row.state || "",
      pinCode: row.pinCode || "",
      country: row.country || "Singapore",
      contactPerson: row.contactPerson || "",
      contactNumber: row.contactNumber || "",
      email: row.email || "",
      salesPerson: row.salesPerson || "",
      isActive: row.isActive ?? true,
      description: row.description || "",
      remarks: row.remarks || "",
    });
    setDialogOpen(true);
  }

  function updateField<K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (!form.code.trim() || !form.name.trim() || !form.address.trim() || !form.city.trim()) {
      toast({
        title: "Missing required fields",
        description: "Warehouse code, name, address and city are required.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      if (editRow) await inventoryApi.updateWarehouse(editRow.id, form);
      else await inventoryApi.createWarehouse(form);
      toast({
        title: editRow ? "Warehouse updated" : "Warehouse created",
        description: "Warehouse saved successfully.",
      });
      setDialogOpen(false);
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    try {
      await inventoryApi.deleteWarehouse(deleteId);
      toast({ title: "Deleted", description: "Warehouse deleted." });
      setDeleteId(null);
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  }

  const filtered = useMemo(() => rows.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.code.toLowerCase().includes(q) ||
      r.name.toLowerCase().includes(q) ||
      (r.city || "").toLowerCase().includes(q)
    );
  }), [rows, search]);

  const { page, setPage, totalPages, paginatedItems } = usePagination(filtered);

  return (
    <div className="space-y-6 pb-8">
      <InventoryPageHeader
        title="Warehouses"
        subtitle="Manage all warehouses and create new warehouse locations."
        action={
          <Button className="gap-2 bg-[#2563EB] hover:bg-[#1D4ED8]" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Create Warehouse
          </Button>
        }
      />

      <InventorySectionCard>
        <div className="mb-4 flex items-center gap-2">
          <Search className="h-4 w-4 text-[#9CA3AF]" />
          <Input
            placeholder="Search warehouses..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
        </div>

        {loading ? (
          <p className="text-[#6B7280]">Loading...</p>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-[#6B7280]">
            <Warehouse className="mx-auto mb-3 h-10 w-10 opacity-40" />
            <p>No warehouses found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-[#6B7280]">
                  <th className="py-3 pr-4">Code</th>
                  <th className="py-3 pr-4">Name</th>
                  <th className="py-3 pr-4">City</th>
                  <th className="py-3 pr-4">State</th>
                  <th className="py-3 pr-4">Contact</th>
                  <th className="py-3 pr-4">Sales Person</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedItems.map((r) => (
                  <tr key={r.id} className="border-b border-[#F3F4F6] hover:bg-[#F9FAFB]">
                    <td className="py-3 pr-4 font-mono text-[#111827]">
                      {r.code}
                      {r.isDefault ? (
                        <Badge className="ml-2" variant="secondary">
                          Default
                        </Badge>
                      ) : null}
                    </td>
                    <td className="py-3 pr-4 font-medium text-[#111827]">{r.name}</td>
                    <td className="py-3 pr-4 text-[#444651]">{r.city || "-"}</td>
                    <td className="py-3 pr-4 text-[#444651]">{r.state || "-"}</td>
                    <td className="py-3 pr-4 text-[#444651]">{r.contactPerson || "-"}</td>
                    <td className="py-3 pr-4 text-[#444651]">{r.salesPerson || "-"}</td>
                    <td className="py-3 pr-4">
                      <InventoryStatusBadge status={r.isActive ? "active" : "inactive"} />
                    </td>
                    <td className="py-3">
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(r)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => setDeleteId(r.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ListPagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        )}
      </InventorySectionCard>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editRow ? "Edit Warehouse" : "Create Warehouse"}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 py-2 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Warehouse Code *</Label>
              <Input
                placeholder="Enter unique warehouse code"
                value={form.code}
                onChange={(e) => updateField("code", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Warehouse Name *</Label>
              <Input
                placeholder="Enter warehouse name"
                value={form.name}
                onChange={(e) => updateField("name", e.target.value)}
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Address *</Label>
              <Textarea
                rows={2}
                placeholder="Enter full address"
                value={form.address}
                onChange={(e) => updateField("address", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>City *</Label>
              <Input
                placeholder="Enter city"
                value={form.city}
                onChange={(e) => updateField("city", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Postal Code *</Label>
              <Input
                placeholder="Enter postal code"
                value={form.pinCode}
                onChange={(e) => updateField("pinCode", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Country *</Label>
              <CountrySelect
                value={form.country}
                onChange={(v) => updateField("country", v)}
                singleChevron
                className="h-9 shadow-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Contact Person</Label>
              <Input
                placeholder="Enter contact person name"
                value={form.contactPerson}
                onChange={(e) => updateField("contactPerson", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Phone Number</Label>
              <Input
                placeholder="Enter phone number"
                value={form.contactNumber}
                onChange={(e) => updateField("contactNumber", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Status *</Label>
              <Select
                value={form.isActive ? "active" : "inactive"}
                onValueChange={(v) => updateField("isActive", v === "active")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input
                type="email"
                placeholder="Enter email address"
                value={form.email}
                onChange={(e) => updateField("email", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Sales Person</Label>
              <Select
                value={form.salesPerson || ""}
                onValueChange={(v) => updateField("salesPerson", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select Sales Person" />
                </SelectTrigger>
                <SelectContent>
                  {salesPersons.map((sp) => (
                    <SelectItem key={sp.id} value={sp.name}>
                      {sp.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Description</Label>
              <Textarea
                rows={2}
                placeholder="Enter description"
                value={form.description}
                onChange={(e) => updateField("description", e.target.value)}
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Remarks</Label>
              <Textarea
                rows={2}
                placeholder="Enter remarks"
                value={form.remarks}
                onChange={(e) => updateField("remarks", e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button className="bg-[#2563EB] hover:bg-[#1D4ED8]" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : editRow ? "Update Warehouse" : "Save Warehouse"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId != null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete warehouse?</AlertDialogTitle>
            <AlertDialogDescription>Only empty warehouses can be deleted.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
