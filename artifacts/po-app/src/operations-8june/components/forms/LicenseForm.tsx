import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { insertLicenseSchema, License, Asset } from "@shared/schema";
import { apiRequest, queryClient } from "@/operations-8june/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
} from "@/components/ui/dialog";
import {
  FormModalShell,
  ModalCancelButton,
  ModalSaveButton,
  ModalSectionHeader,
} from "@/operations-8june/components/forms/FormModalShell";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SyncBridgeDatePicker } from "@/components/ui/sync-bridge-date-picker";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { isAfter, isBefore } from "date-fns";
import {
  Users,
  CheckCircle,
  Search,
  Plus,
  Eye,
  EyeOff,
  Clock,
  Calendar,
  Settings,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formFieldBoxClass, formFieldGrid2Class } from "@/lib/form-ui";
import {
  TooltipProvider,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import { VendorCreateDialog } from "@/components/vendor-create-dialog";
import {
  Dialog as TypeDialog,
  DialogContent as TypeDialogContent,
  DialogFooter as TypeDialogFooter,
  DialogHeader as TypeDialogHeader,
  DialogTitle as TypeDialogTitle,
} from "@/components/ui/dialog";

const LICENSE_TYPE_STORAGE_KEY = "license-custom-types-v1";

const DEFAULT_LICENSE_TYPES = [
  { value: "software", label: "Software" },
  { value: "hardware", label: "Hardware" },
  { value: "subscription", label: "Subscription" },
  { value: "service", label: "Service" },
  { value: "other", label: "Other" },
] as const;

const ENUM_LICENSE_TYPES = new Set(DEFAULT_LICENSE_TYPES.map((t) => t.value));

type LicenseTypeOption = { value: string; label: string };

function loadCustomLicenseTypes(): LicenseTypeOption[] {
  try {
    const raw = localStorage.getItem(LICENSE_TYPE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const value = String((item as any).value || "").trim().toLowerCase();
        const label = String((item as any).label || "").trim();
        if (!value || !label) return null;
        return { value, label };
      })
      .filter((item): item is LicenseTypeOption => !!item);
  } catch {
    return [];
  }
}

function saveCustomLicenseTypes(types: LicenseTypeOption[]) {
  try {
    localStorage.setItem(LICENSE_TYPE_STORAGE_KEY, JSON.stringify(types));
  } catch {
    // ignore
  }
}

function slugifyLicenseType(label: string) {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || `custom-${Date.now()}`;
}

function parseLicenseTypeTag(notes?: string | null): string | null {
  if (!notes) return null;
  const match = notes.match(/^__LT__:([^|\n]+)/);
  return match ? match[1].trim() : null;
}

function stripLicenseTypeTag(notes?: string | null): string {
  if (!notes) return "";
  return notes.replace(/^__LT__:[^|\n]+\|?/, "").trim();
}

// Function to create the schema based on whether license key is required
const createLicenseFormSchema = (hasLicenseKey: boolean) => {
  const baseSchema = insertLicenseSchema.extend({
    name: z.string().min(1, "Name is required"),
    licenseKey: hasLicenseKey
      ? z.string().min(1, "License key is required")
      : z.string().optional().nullable(),
    type: z.string().min(1, "License type is required"),
    assetId: z.number().nullable().optional(),
    // Accept both string (ISO format from date input) and Date objects
    purchaseDate: z.union([z.string(), z.date()]).optional().nullable().transform((val) => {
      if (!val) return null;
      return val instanceof Date ? val : val;
    }),
    expiryDate: z.union([z.string(), z.date()]).optional().nullable().transform((val) => {
      if (!val) return null;
      return val instanceof Date ? val : val;
    }),
    cost: z.string()
      .optional()
      .nullable()
      .refine((val) => !val || /^\d+(\.\d{1,2})?$/.test(val), "Cost must be a valid decimal number"),
    seats: z.number().int().min(1).optional().nullable(),
    notes: z.string().optional().nullable(),
    vendorId: z.number().nullable().optional(),
    renewalCycle: z.enum(["none", "monthly", "yearly", "custom"]).optional().nullable(),
    customRenewalEvery: z.coerce.number().int().min(1).optional(),
    customRenewalUnit: z.enum(["days", "weeks", "months", "years"]).optional(),
    status: z.enum(["active", "expired", "revoked", "assigned"]).optional().nullable(),
  });
  
  return baseSchema.refine((data) => {
    // Validate that expiry date is after purchase date
    if (data.purchaseDate && data.expiryDate) {
      const purchase = data.purchaseDate instanceof Date ? data.purchaseDate : new Date(data.purchaseDate);
      const expiry = data.expiryDate instanceof Date ? data.expiryDate : new Date(data.expiryDate);
      return isAfter(expiry, purchase);
    }
    return true;
  }, {
    message: "Expiry date must be after purchase date",
    path: ["expiryDate"],
  });
};

const licenseFormSchema = createLicenseFormSchema(true);

type LicenseFormValues = z.infer<typeof licenseFormSchema>;

type CustomRenewalUnit = "days" | "weeks" | "months" | "years";

function parseCustomRenewal(notes?: string | null): { every: number; unit: CustomRenewalUnit } {
  const cleaned = stripLicenseTypeTag(notes);
  if (!cleaned) return { every: 3, unit: "months" };
  const tagged = cleaned.match(/^__CR__:(\d+):(days|weeks|months|years)$/);
  if (tagged) {
    return { every: Number(tagged[1]), unit: tagged[2] as CustomRenewalUnit };
  }
  const readable = cleaned.match(/^Renews every (\d+) (days|weeks|months|years)$/i);
  if (readable) {
    return { every: Number(readable[1]), unit: readable[2].toLowerCase() as CustomRenewalUnit };
  }
  return { every: 3, unit: "months" };
}

interface LicenseFormProps {
  isOpen: boolean;
  onClose: () => void;
  license?: License;
  formId?: string;
  hideShell?: boolean;
  onPendingChange?: (pending: boolean) => void;
}

export default function LicenseForm({
  isOpen,
  onClose,
  license,
  formId = "license-form",
  hideShell = false,
  onPendingChange,
}: LicenseFormProps) {
  const { toast } = useToast();
  const [selectedAssetId, setSelectedAssetId] = useState<number | null>(
    license?.assetId || null
  );
  const [assetSearchOpen, setAssetSearchOpen] = useState(false);
  const [hasLicenseKey, setHasLicenseKey] = useState<boolean>(
    !!(license?.licenseKey)
  );
  const [isVendorFormOpen, setIsVendorFormOpen] = useState(false);
  const [showLicenseKey, setShowLicenseKey] = useState(false);
  const [customLicenseTypes, setCustomLicenseTypes] = useState<LicenseTypeOption[]>(() => loadCustomLicenseTypes());
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const [typeDialogOpen, setTypeDialogOpen] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");

  // Fetch all assets for the asset selection
  const { data: assets = [] } = useQuery<Asset[]>({
    queryKey: ["/api/assets"],
  });

  // Fetch all vendors for the vendor selection
  const { data: vendors = [] } = useQuery({
    queryKey: ["/api/vendors"],
  });

  const licenseTypeOptions = useMemo(() => {
    const seen = new Set<string>();
    const merged: LicenseTypeOption[] = [];
    for (const option of [...DEFAULT_LICENSE_TYPES, ...customLicenseTypes]) {
      if (seen.has(option.value)) continue;
      seen.add(option.value);
      merged.push(option);
    }
    return merged;
  }, [customLicenseTypes]);

  // Initialize form with default values or existing license data
  const parsedCustom = parseCustomRenewal(license?.notes);
  const storedTypeLabel = parseLicenseTypeTag(license?.notes);
  const initialType =
    storedTypeLabel
      ? slugifyLicenseType(storedTypeLabel)
      : license?.type || "software";
  const form = useForm<LicenseFormValues>({
    resolver: zodResolver(createLicenseFormSchema(hasLicenseKey)),
    defaultValues: {
      name: license?.name || "",
      licenseKey: license?.licenseKey || "",
      type: initialType,
      assetId: license?.assetId || null,
      purchaseDate: license?.purchaseDate ? new Date(license.purchaseDate) : null,
      expiryDate: license?.expiryDate ? new Date(license.expiryDate) : null,
      cost: license?.cost || "",
      seats: license?.seats || null,
      notes: license?.notes || "",
      vendorId: license?.vendorId || null,
      renewalCycle: license?.renewalCycle || "none",
      customRenewalEvery: parsedCustom.every,
      customRenewalUnit: parsedCustom.unit,
      status: license?.status || "active",
    },
  });

  const isEditMode = !!license;

  // Check if license is expired
  const isExpired = form.watch("expiryDate") && isBefore(form.watch("expiryDate")!, new Date());

  useEffect(() => {
    const label = parseLicenseTypeTag(license?.notes);
    if (!label) return;
    const value = slugifyLicenseType(label);
    setCustomLicenseTypes((prev) => {
      if (prev.some((t) => t.value === value)) return prev;
      const next = [...prev, { value, label }];
      saveCustomLicenseTypes(next);
      return next;
    });
  }, [license?.notes]);

  // Update form validation when hasLicenseKey changes
  useEffect(() => {
    // Clear license key when toggle is turned off
    if (!hasLicenseKey) {
      form.setValue("licenseKey", "");
    }
  }, [hasLicenseKey, form]);

  // Handle keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    }
  };

  // Create license mutation
  const createMutation = useMutation({
    mutationFn: async (values: LicenseFormValues) => {
      const res = await apiRequest("POST", "/api/licenses", values);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/licenses"] });
      toast({
        title: "License created",
        description: "The license has been created successfully.",
      });
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `Failed to create license: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // Update license mutation
  const updateMutation = useMutation({
    mutationFn: async (values: LicenseFormValues) => {
      const res = await apiRequest(
        "PUT",
        `/api/licenses/${license?.id}`,
        values
      );
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/licenses"] });
      toast({
        title: "License updated",
        description: "The license has been updated successfully.",
      });
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `Failed to update license: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // Handle form submission
  const onSubmit = (values: LicenseFormValues) => {
    const { customRenewalEvery, customRenewalUnit, ...rest } = values;
    const every = customRenewalEvery && customRenewalEvery > 0 ? customRenewalEvery : 3;
    const unit = customRenewalUnit || "months";
    const selectedType = licenseTypeOptions.find((t) => t.value === values.type);
    const isCustomType = !!values.type && !ENUM_LICENSE_TYPES.has(values.type);
    const apiType = ENUM_LICENSE_TYPES.has(values.type) ? values.type : "other";
    const crNotes =
      values.renewalCycle === "custom" ? `__CR__:${every}:${unit}` : "";
    const typeTag =
      isCustomType && selectedType?.label ? `__LT__:${selectedType.label}` : "";
    const notes =
      typeTag && crNotes ? `${typeTag}|${crNotes}` : typeTag || crNotes || null;

    const updatedValues: LicenseFormValues = {
      ...rest,
      type: apiType as LicenseFormValues["type"],
      purchaseDate: values.purchaseDate ? new Date(values.purchaseDate) : null,
      expiryDate: values.expiryDate ? new Date(values.expiryDate) : null,
      seats: values.seats ?? null,
      notes,
    };

    // Auto-set status to expired if expiry date has passed
    if (updatedValues.expiryDate && isBefore(updatedValues.expiryDate, new Date())) {
      updatedValues.status = "expired";
    }

    if (license) {
      updateMutation.mutate(updatedValues);
    } else {
      createMutation.mutate(updatedValues);
    }
  };

  const handleCreateLicenseType = () => {
    const label = newTypeName.trim();
    if (!label) {
      toast({ title: "Name required", description: "Enter a license type name.", variant: "destructive" });
      return;
    }
    const value = slugifyLicenseType(label);
    const existing = licenseTypeOptions.find(
      (t) => t.value === value || t.label.toLowerCase() === label.toLowerCase(),
    );
    if (existing) {
      form.setValue("type", existing.value, { shouldDirty: true, shouldValidate: true });
      setTypeDialogOpen(false);
      setNewTypeName("");
      toast({ title: "Type selected", description: `${existing.label} is now selected.` });
      return;
    }
    const next = [...customLicenseTypes, { value, label }];
    setCustomLicenseTypes(next);
    saveCustomLicenseTypes(next);
    form.setValue("type", value, { shouldDirty: true, shouldValidate: true });
    setTypeDialogOpen(false);
    setNewTypeName("");
    toast({ title: "License type created", description: `${label} added to the list.` });
  };

  useEffect(() => {
    onPendingChange?.(createMutation.isPending || updateMutation.isPending);
  }, [createMutation.isPending, updateMutation.isPending, onPendingChange]);

  if (hideShell && !isOpen) return null;

  const formBody = (
        <TooltipProvider>
          <Form {...form}>
            <form
              id={formId}
              onSubmit={form.handleSubmit(onSubmit)}
              onKeyDown={handleKeyDown}
              className="space-y-8"
            >
              <section className="space-y-4">
                <ModalSectionHeader title="License Information" />
                <div className={formFieldGrid2Class}>
                          {/* Name */}
                          <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>
                                  License Name <span className="text-[#DC2626]">*</span>
                                </FormLabel>
                                <FormControl>
                                  <Input 
                                    placeholder="" 
                                    {...field} 
                                    autoFocus
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          {/* Type */}
                          <FormField
                            control={form.control}
                            name="type"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>
                                  License Type <span className="text-[#DC2626]">*</span>
                                </FormLabel>
                                <Select
                                  open={typeMenuOpen}
                                  onOpenChange={setTypeMenuOpen}
                                  onValueChange={field.onChange}
                                  value={field.value || undefined}
                                >
                                  <FormControl>
                                    <SelectTrigger className="w-full">
                                      <SelectValue placeholder="" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent className="max-h-[14rem]">
                                    <div
                                      className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm font-medium text-primary hover:bg-accent"
                                      onClick={(event) => {
                                        event.preventDefault();
                                        setTypeMenuOpen(false);
                                        setNewTypeName("");
                                        setTypeDialogOpen(true);
                                      }}
                                    >
                                      <Plus className="h-4 w-4" />
                                      Create New License Type
                                    </div>
                                    <div className="my-1 border-t" />
                                    {licenseTypeOptions.map((option) => (
                                      <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          {/* Have License Key Toggle */}
                          <div className="flex min-h-10 flex-col justify-center">
                            <div className="flex items-center gap-3">
                              <Label className="text-sm font-medium text-[#111827]">Have License Key</Label>
                              <Switch
                                checked={hasLicenseKey}
                                onCheckedChange={(checked) => {
                                  setHasLicenseKey(checked);
                                }}
                                data-testid="toggle-license-key"
                              />
                            </div>
                            <p className="mt-1 text-xs text-[#6B7280]">
                              Enable if this license has a product key
                            </p>
                          </div>

                          {/* License Key - Conditional */}
                          {hasLicenseKey && (
                            <FormField
                              control={form.control}
                              name="licenseKey"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>
                                    License Key <span className="text-[#DC2626]">*</span>
                                  </FormLabel>
                                  <FormControl>
                                    <div className="relative flex w-full items-center">
                                      <Input
                                        type={showLicenseKey ? "text" : "password"}
                                        placeholder=""
                                        {...field}
                                        value={field.value || ""}
                                        className="w-full pr-10 font-mono text-sm"
                                        onChange={(e) => {
                                          // Auto-format license key to uppercase and add hyphens
                                          let value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
                                          if (value.length > 4) {
                                            value = value.match(/.{1,4}/g)?.join('-') || value;
                                          }
                                          field.onChange(value);
                                        }}
                                      />
                                      <button
                                        type="button"
                                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none"
                                        onClick={() => setShowLicenseKey(!showLicenseKey)}
                                      >
                                        {showLicenseKey ? (
                                          <EyeOff className="h-4 w-4" />
                                        ) : (
                                          <Eye className="h-4 w-4" />
                                        )}
                                      </button>
                                    </div>
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          )}

                </div>
              </section>

              <section className="space-y-4">
                <ModalSectionHeader title="Purchase Details" />
                <div className={formFieldGrid2Class}>

                          {/* Cost */}
                          <FormField
                            control={form.control}
                            name="cost"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Purchase Value ($)</FormLabel>
                                <FormControl>
                                  <Input
                                    type="text"
                                    inputMode="decimal"
                                    placeholder=""
                                    name={field.name}
                                    ref={field.ref}
                                    onBlur={field.onBlur}
                                    value={field.value || ""}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      if (v === "" || /^\d*\.?\d*$/.test(v)) {
                                        field.onChange(v);
                                      }
                                    }}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          {/* Purchase Date */}
                          <FormField
                            control={form.control}
                            name="purchaseDate"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Purchase Date</FormLabel>
                                <FormControl>
                                  <SyncBridgeDatePicker
                                    value={field.value ? String(field.value).split('T')[0] : ""}
                                    onChange={(v) => field.onChange(v || null)}
                                    max={new Date().toISOString().split('T')[0]}
                                    min="1900-01-01"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          {/* Expiry Date */}
                          <FormField
                            control={form.control}
                            name="expiryDate"
                            render={({ field }) => {
                              const dateValue = field.value 
                                ? (field.value instanceof Date ? field.value : new Date(field.value))
                                : null;
                              const isExpiredLicense = dateValue && isBefore(dateValue, new Date());
                              const purchaseDate = form.watch("purchaseDate");
                              const purchaseDateObj = purchaseDate 
                                ? (purchaseDate instanceof Date ? purchaseDate : new Date(purchaseDate))
                                : null;
                              
                              return (
                                <FormItem>
                                  <FormLabel className="flex items-center gap-2">
                                    Expiry Date
                                    {isExpiredLicense && (
                                      <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-700">
                                        Expired
                                      </span>
                                    )}
                                  </FormLabel>
                                  <FormControl>
                                    <SyncBridgeDatePicker
                                      value={dateValue ? dateValue.toISOString().split('T')[0] : ''}
                                      onChange={(v) => field.onChange(v || null)}
                                      min={purchaseDateObj ? purchaseDateObj.toISOString().split('T')[0] : "1900-01-01"}
                                      className={cn(isExpiredLicense && "border-red-500")}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              );
                            }}
                          />

                          {/* Status */}
                          <FormField
                            control={form.control}
                            name="status"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-sm font-medium text-[#111827]">Status</FormLabel>
                                <Select
                                  onValueChange={field.onChange}
                                  defaultValue={field.value || "active"}
                                >
                                  <FormControl>
                                    <SelectTrigger className="w-full">
                                      <SelectValue placeholder="" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="active">
                                      <div className="flex items-center gap-2">
                                        <CheckCircle className="h-3 w-3 text-green-600" />
                                        Active
                                      </div>
                                    </SelectItem>
                                    <SelectItem value="expired">
                                      <div className="flex items-center gap-2">
                                        <span className="h-3 w-3 rounded-full bg-red-600"></span>
                                        Expired
                                      </div>
                                    </SelectItem>
                                    <SelectItem value="revoked">
                                      <div className="flex items-center gap-2">
                                        <span className="h-3 w-3 rounded-full bg-gray-600"></span>
                                        Revoked
                                      </div>
                                    </SelectItem>
                                    <SelectItem value="assigned">
                                      <div className="flex items-center gap-2">
                                        <Users className="h-3 w-3 text-blue-600" />
                                        Assigned
                                      </div>
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                        {/* Asset Licenses - Searchable */}
                        <FormField
                          control={form.control}
                          name="assetId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Asset Licenses</FormLabel>
                              <Popover open={assetSearchOpen} onOpenChange={setAssetSearchOpen}>
                                <PopoverTrigger asChild>
                                  <FormControl>
                                    <Button
                                      variant="outline"
                                      role="combobox"
                                      aria-expanded={assetSearchOpen}
                                      className={cn(
                                        formFieldBoxClass,
                                        "w-full justify-between px-3 font-normal hover:bg-[#F8FAFC]",
                                      )}
                                    >
                                      <span className="truncate">
                                      {field.value && field.value !== null
                                        ? (() => {
                                            const selectedAsset = assets.find(asset => asset.id === field.value);
                                            return selectedAsset 
                                              ? `${selectedAsset.tag} - ${selectedAsset.type} (${selectedAsset.manufacturer} ${selectedAsset.model})`
                                              : "None";
                                          })()
                                        : "Select asset (optional)..."}
                                      </span>
                                      <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
                                  </FormControl>
                                </PopoverTrigger>
                                <PopoverContent className="w-full p-0">
                                  <Command>
                                    <CommandInput placeholder="Search assets..." />
                                    <CommandEmpty>No asset found.</CommandEmpty>
                                    <CommandGroup className="max-h-64 overflow-auto">
                                      <CommandItem
                                        value="none"
                                        onSelect={() => {
                                          field.onChange(null);
                                          setSelectedAssetId(null);
                                          setAssetSearchOpen(false);
                                        }}
                                      >
                                        <CheckCircle
                                          className={cn(
                                            "mr-2 h-4 w-4",
                                            field.value === null ? "opacity-100" : "opacity-0"
                                          )}
                                        />
                                        None
                                      </CommandItem>
                                      {assets.map((asset) => (
                                        <CommandItem
                                          key={asset.id}
                                          value={`${asset.tag} ${asset.type} ${asset.manufacturer} ${asset.model}`}
                                          onSelect={() => {
                                            field.onChange(asset.id);
                                            setSelectedAssetId(asset.id);
                                            setAssetSearchOpen(false);
                                          }}
                                        >
                                          <CheckCircle
                                            className={cn(
                                              "mr-2 h-4 w-4",
                                              field.value === asset.id ? "opacity-100" : "opacity-0"
                                            )}
                                          />
                                          <div className="flex flex-col">
                                            <span className="font-medium">{asset.tag} - {asset.type}</span>
                                            <span className="text-xs text-muted-foreground">
                                              {asset.manufacturer} {asset.model}
                                            </span>
                                          </div>
                                        </CommandItem>
                                      ))}
                                    </CommandGroup>
                                  </Command>
                                </PopoverContent>
                              </Popover>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                      {/* Vendor */}
                      <FormField
                        control={form.control}
                        name="vendorId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Vendor</FormLabel>
                              <Select
                                onValueChange={(value) => field.onChange(value === "none" ? null : parseInt(value))}
                                value={field.value?.toString() || "none"}
                              >
                                <FormControl>
                                  <SelectTrigger className="w-full">
                                    <SelectValue placeholder="" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <div
                                    className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm font-medium text-primary hover:bg-accent"
                                    onClick={(event) => {
                                      event.preventDefault();
                                      setIsVendorFormOpen(true);
                                    }}
                                  >
                                    <Plus className="h-4 w-4" />
                                    Create New Vendor
                                  </div>
                                  <div className="my-1 border-t" />
                                  <SelectItem value="none">
                                    <span className="text-gray-500">No vendor</span>
                                  </SelectItem>
                                  {Array.isArray(vendors) && vendors.map((vendor: any) => (
                                    <SelectItem key={vendor.id} value={vendor.id.toString()}>
                                      {vendor.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Renewal Cycle */}
                      <div className="space-y-3">
                        <FormField
                          control={form.control}
                          name="renewalCycle"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="inline-flex items-center gap-1.5">
                                Renewal Cycle
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button type="button" className="text-[#9CA3AF] hover:text-[#6B7280]">
                                      <Info className="h-3.5 w-3.5" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    How often this license renews
                                  </TooltipContent>
                                </Tooltip>
                              </FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                value={field.value || "none"}
                              >
                                <FormControl>
                                  <SelectTrigger className="w-full">
                                    <SelectValue placeholder="" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="none">
                                    <div className="flex items-center gap-2">
                                      <Clock className="h-4 w-4 text-[#9CA3AF]" />
                                      One-time
                                    </div>
                                  </SelectItem>
                                  <SelectItem value="monthly">
                                    <div className="flex items-center gap-2">
                                      <Calendar className="h-4 w-4 text-emerald-600" />
                                      Monthly
                                    </div>
                                  </SelectItem>
                                  <SelectItem value="yearly">
                                    <div className="flex items-center gap-2">
                                      <Calendar className="h-4 w-4 text-orange-500" />
                                      Yearly
                                    </div>
                                  </SelectItem>
                                  <SelectItem value="custom">
                                    <div className="flex items-center gap-2">
                                      <Settings className="h-4 w-4 text-violet-600" />
                                      Custom
                                    </div>
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        {form.watch("renewalCycle") === "custom" && (
                          <div className="space-y-4 rounded-xl border border-[#E0E7FF] bg-[#F8FAFF] p-4 md:col-span-2">
                            <div className="flex items-start gap-3">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EDE9FE]">
                                <Settings className="h-4 w-4 text-violet-600" />
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-[#111827]">Custom Renewal Period</p>
                                <p className="text-xs text-[#6B7280]">
                                  Set your own renewal period by choosing the interval and unit.
                                </p>
                              </div>
                            </div>

                            <div className="flex items-start gap-4">
                              <FormField
                                control={form.control}
                                name="customRenewalEvery"
                                render={({ field }) => (
                                  <FormItem className="w-[140px] gap-0 space-y-0">
                                    <FormLabel className="mb-1.5 block h-4 text-xs font-medium leading-4 text-[#6B7280]">
                                      Repeat every
                                    </FormLabel>
                                    <FormControl>
                                      <Input
                                        type="number"
                                        min={1}
                                        className="!mt-0 h-10 w-full"
                                        value={field.value ?? 3}
                                        onChange={(e) => {
                                          const n = parseInt(e.target.value, 10);
                                          field.onChange(Number.isFinite(n) && n > 0 ? n : 1);
                                        }}
                                      />
                                    </FormControl>
                                  </FormItem>
                                )}
                              />

                              <FormField
                                control={form.control}
                                name="customRenewalUnit"
                                render={({ field }) => (
                                  <FormItem className="w-[160px] gap-0 space-y-0">
                                    <FormLabel className="mb-1.5 block h-4 text-xs font-medium leading-4 text-[#6B7280]">
                                      Unit
                                    </FormLabel>
                                    <Select
                                      value={field.value || "months"}
                                      onValueChange={field.onChange}
                                    >
                                      <FormControl>
                                        <SelectTrigger className="!mt-0 h-10 w-full">
                                          <SelectValue />
                                        </SelectTrigger>
                                      </FormControl>
                                      <SelectContent>
                                        <SelectItem value="days">Days</SelectItem>
                                        <SelectItem value="weeks">Weeks</SelectItem>
                                        <SelectItem value="months">Months</SelectItem>
                                        <SelectItem value="years">Years</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </FormItem>
                                )}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                </div>
              </section>
            </form>
          </Form>
        </TooltipProvider>
  );

  return (
    <>
      {hideShell ? (
        formBody
      ) : (
        <Dialog open={isOpen} onOpenChange={onClose}>
          <FormModalShell
            title={isEditMode ? "Edit license" : "Create new license"}
            maxWidth="max-w-5xl"
            onClose={onClose}
            footer={
              <>
                <ModalCancelButton
                  onClick={() => {
                    form.reset();
                    onClose();
                  }}
                />
                <ModalSaveButton
                  form={formId}
                  loading={createMutation.isPending || updateMutation.isPending}
                  label="Save"
                  loadingLabel="Saving..."
                />
              </>
            }
          >
            {formBody}
          </FormModalShell>
        </Dialog>
      )}

      <VendorCreateDialog
        open={isVendorFormOpen}
        onOpenChange={setIsVendorFormOpen}
        onSuccess={(vendor) => {
          queryClient.invalidateQueries({ queryKey: ["/api/vendors"] });
          form.setValue("vendorId", vendor.id);
        }}
      />

      <TypeDialog open={typeDialogOpen} onOpenChange={setTypeDialogOpen}>
        <TypeDialogContent className="sm:max-w-md">
          <TypeDialogHeader>
            <TypeDialogTitle>Create New License Type</TypeDialogTitle>
          </TypeDialogHeader>
          <Input
            autoFocus
            value={newTypeName}
            onChange={(event) => setNewTypeName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleCreateLicenseType();
              }
            }}
            placeholder=""
          />
          <TypeDialogFooter>
            <Button type="button" variant="outline" onClick={() => setTypeDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleCreateLicenseType}>
              Save
            </Button>
          </TypeDialogFooter>
        </TypeDialogContent>
      </TypeDialog>
    </>
  );
}