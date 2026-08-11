import { useState, useEffect, useMemo, useRef } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertAssetSchema, type Employee, type Asset } from "@shared/schema";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/operations-8june/lib/queryClient";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DatePicker } from "@/operations-8june/components/ui/date-picker";
import { ModalSectionHeader } from "@/operations-8june/components/forms/FormModalShell";
import {
  formatFileSize,
  loadAssetAttachments,
  readFileAsDataUrl,
  saveAssetAttachments,
  type AssetAttachment,
} from "@/operations-8june/lib/asset-attachments";
import { 
  Package, 
  User, 
  CreditCard, 
  Calculator,
  FileText,
  HelpCircle,
  UserPlus,
  Plus,
  Paperclip,
  Upload,
  X
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Asset types for dropdown
const assetTypes = [
  "Laptop", "Desktop", "Monitor", "Phone", "Tablet", "Server", 
  "Printer", "Scanner", "Router", "Switch", "Projector", "Camera"
];

// Asset categories for dropdown
const assetCategories = [
  "Hardware", "Software", "Furniture", "Office Equipment", "Network Equipment"
];

// Manufacturers for dropdown
const manufacturers = [
  "Apple", "Dell", "HP", "Lenovo", "Microsoft", "Samsung", "LG", 
  "Asus", "Acer", "Canon", "Epson", "Cisco", "Netgear"
];

// Locations for dropdown
const locations = [
  "Headquarters", "Branch Office", "Remote", "Warehouse", "IT Room", 
  "Conference Room", "Reception"
];

type CustomOptionTarget = "type" | "category" | "manufacturer" | "location";

const optionLabels: Record<CustomOptionTarget, string> = {
  type: "Asset Type",
  category: "Category",
  manufacturer: "Manufacturer",
  location: "Location",
};

function loadCustomOptions(target: CustomOptionTarget): string[] {
  try {
    const value = localStorage.getItem(`asset-custom-options-${target}`);
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

// Depreciation methods
const depreciationMethods = [
  "Straight Line", "Reducing Balance", "Sum of Years Digits"
];

// Enhanced form schema with better validation
const formSchema = insertAssetSchema.extend({
  tag: z.string().min(3, "Asset tag must be at least 3 characters"),
  type: z.string().min(1, "Asset type is required"),
  category: z.string().min(1, "Category is required"),
  serial: z.string().min(1, "Serial number is required"),
  model: z.string().optional(),
  manufacturer: z.string().optional(),
  status: z.string().min(1, "Status is required"),
  condition: z.string().optional(),
  assignedTo: z.string().optional(),
  location: z.string().optional(),
  vendor: z.string().optional(),
  invoiceNumber: z.string().optional(),
  purchaseDate: z.date().optional(),
  warrantyExpiry: z.date().optional(),
  depreciationStartDate: z.date().optional(),
  usefulLifeYears: z.number().min(1).max(20).optional(),
  depreciationMethod: z.string().optional(),
  description: z.string().optional(),
});

type AssetFormData = z.infer<typeof formSchema>;

interface AssetFormProps {
  assetId?: number;
  initialAsset?: Asset | null;
  onSuccess?: () => void;
  formId?: string;
  hideFooter?: boolean;
  onPendingChange?: (pending: boolean) => void;
}

type AssetRecord = Record<string, unknown>;

function pickField(data: AssetRecord, camel: string, snake: string): unknown {
  return data[camel] ?? data[snake];
}

function normalizeAssetRecord(data: AssetRecord): AssetRecord {
  return {
    ...data,
    type: pickField(data, "type", "asset_type") ?? pickField(data, "assetType", "asset_type"),
    category: pickField(data, "category", "category"),
    assignedTo: pickField(data, "assignedTo", "assigned_to"),
    location: pickField(data, "location", "location"),
    manufacturer: pickField(data, "manufacturer", "manufacturer"),
    model: pickField(data, "model", "model"),
    invoiceNumber: pickField(data, "invoiceNumber", "invoice_number"),
    purchaseDate: pickField(data, "purchaseDate", "purchase_date"),
    warrantyExpiry: pickField(data, "warrantyExpiry", "warranty_expiry"),
    depreciationStartDate: pickField(data, "depreciationStartDate", "depreciation_start_date"),
    usefulLifeYears: pickField(data, "usefulLifeYears", "useful_life_years"),
    depreciationMethod: pickField(data, "depreciationMethod", "depreciation_method"),
    vendorId: pickField(data, "vendorId", "vendor_id"),
  };
}

function matchSelectValue(stored: unknown, options: readonly string[]): string {
  if (stored == null || stored === "") return "";
  const normalized = String(stored).trim().toLowerCase();
  if (normalized === "other") return "";
  const match = options.find((option) => option.toLowerCase() === normalized);
  return match ? match.toLowerCase() : normalized;
}

function withStoredOption(options: readonly string[], stored: unknown): string[] {
  if (stored == null || String(stored).trim() === "") return [...options];
  const normalized = String(stored).trim().toLowerCase();
  if (normalized === "other") return [...options];
  if (options.some((option) => option.toLowerCase() === normalized)) return [...options];
  return [...options, String(stored).trim()];
}

function getExistingAssetOptions(
  assets: AssetRecord[],
  camelField: string,
  snakeField: string,
): string[] {
  const seen = new Set<string>();
  return assets.flatMap((asset) => {
    const value = pickField(asset, camelField, snakeField);
    if (value == null) return [];
    const label = String(value).trim();
    const normalized = label.toLowerCase();
    if (!label || normalized === "other" || seen.has(normalized)) return [];
    seen.add(normalized);
    return [label];
  });
}

function mergeOptions(...groups: readonly string[][]): string[] {
  const seen = new Set<string>();
  return groups.flatMap((group) =>
    group.filter((option) => {
      const normalized = option.trim().toLowerCase();
      if (!normalized || normalized === "other" || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    }),
  );
}

function toDateValue(value: unknown): Date | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function mapAssetToFormValues(data: AssetRecord): AssetFormData {
  const normalized = normalizeAssetRecord(data);
  return {
    tag: String(normalized.tag ?? ""),
    type: matchSelectValue(normalized.type, assetTypes),
    category: matchSelectValue(normalized.category, assetCategories),
    serial: String(normalized.serial ?? ""),
    model: String(normalized.model ?? ""),
    manufacturer: matchSelectValue(normalized.manufacturer, manufacturers),
    status:
      matchSelectValue(normalized.status, ["available", "assigned", "maintenance", "retired"]) ||
      "available",
    condition:
      matchSelectValue(normalized.condition, ["new", "used", "refurbished", "damaged"]) || "new",
    assignedTo: String(normalized.assignedTo ?? ""),
    location: matchSelectValue(normalized.location, locations),
    vendor: String(normalized.vendor ?? ""),
    invoiceNumber: String(normalized.invoiceNumber ?? ""),
    purchaseDate: toDateValue(normalized.purchaseDate),
    warrantyExpiry: toDateValue(normalized.warrantyExpiry),
    depreciationStartDate: toDateValue(normalized.depreciationStartDate),
    usefulLifeYears: normalized.usefulLifeYears != null && normalized.usefulLifeYears !== ""
      ? Number(normalized.usefulLifeYears)
      : undefined,
    depreciationMethod:
      matchSelectValue(normalized.depreciationMethod, depreciationMethods) || "straight line",
    description: String(normalized.description ?? ""),
    vendorId: normalized.vendorId as number | undefined,
    cost: normalized.cost as string | undefined,
  };
}

const emptyFormValues: AssetFormData = {
  tag: "",
  type: "",
  category: "",
  serial: "",
  model: "",
  manufacturer: "",
  status: "available",
  condition: "new",
  assignedTo: "",
  location: "",
  vendor: "",
  invoiceNumber: "",
  purchaseDate: undefined,
  warrantyExpiry: undefined,
  depreciationStartDate: undefined,
  usefulLifeYears: undefined,
  depreciationMethod: "straight line",
  description: "",
  vendorId: undefined,
  cost: undefined,
};

export default function AssetForm({ assetId, initialAsset, onSuccess, formId, hideFooter, onPendingChange }: AssetFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const isEditMode = !!assetId;
  const [customOptions, setCustomOptions] = useState<Record<CustomOptionTarget, string[]>>(() => ({
    type: loadCustomOptions("type"),
    category: loadCustomOptions("category"),
    manufacturer: loadCustomOptions("manufacturer"),
    location: loadCustomOptions("location"),
  }));
  const [createOptionTarget, setCreateOptionTarget] = useState<CustomOptionTarget | null>(null);
  const [newOptionName, setNewOptionName] = useState("");
  const [attachments, setAttachments] = useState<AssetAttachment[]>(() => loadAssetAttachments(assetId));
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Fetch vendors for dropdown
  const { data: vendors = [] } = useQuery({
    queryKey: ["/api/vendors"],
  });
  
  // Fetch employees for dropdown
  const { data: employees = [], isLoading: isLoadingEmployees } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
  });

  // Existing asset values make newly created options available to every user
  // in the selected company, not only in the browser that created them.
  const { data: existingAssets = [] } = useQuery<Asset[]>({
    queryKey: ["/api/assets"],
  });
  
  // Fetch asset data if in edit mode
  const { data: assetData, isLoading: isLoadingAsset } = useQuery({
    queryKey: ["/api/assets", assetId],
    enabled: !!assetId,
    staleTime: 0,
  });

  const resolvedAsset = useMemo(() => {
    const source = (assetData ?? initialAsset) as AssetRecord | null | undefined;
    return source ? normalizeAssetRecord(source) : undefined;
  }, [assetData, initialAsset]);

  const editFormValues = useMemo(() => {
    if (!assetId || !resolvedAsset) return undefined;
    return mapAssetToFormValues(resolvedAsset);
  }, [assetId, resolvedAsset]);

  const typeOptions = useMemo(
    () => withStoredOption(
      mergeOptions(
        assetTypes,
        getExistingAssetOptions(existingAssets as AssetRecord[], "type", "asset_type"),
        customOptions.type,
      ),
      resolvedAsset?.type,
    ),
    [customOptions.type, existingAssets, resolvedAsset?.type],
  );
  const categoryOptions = useMemo(
    () => withStoredOption(
      mergeOptions(
        assetCategories,
        getExistingAssetOptions(existingAssets as AssetRecord[], "category", "category"),
        customOptions.category,
      ),
      resolvedAsset?.category,
    ),
    [customOptions.category, existingAssets, resolvedAsset?.category],
  );
  const manufacturerOptions = useMemo(
    () => withStoredOption(
      mergeOptions(
        manufacturers,
        getExistingAssetOptions(existingAssets as AssetRecord[], "manufacturer", "manufacturer"),
        customOptions.manufacturer,
      ),
      resolvedAsset?.manufacturer,
    ),
    [customOptions.manufacturer, existingAssets, resolvedAsset?.manufacturer],
  );
  const locationOptions = useMemo(
    () => withStoredOption(
      mergeOptions(
        locations,
        getExistingAssetOptions(existingAssets as AssetRecord[], "location", "location"),
        customOptions.location,
      ),
      resolvedAsset?.location,
    ),
    [customOptions.location, existingAssets, resolvedAsset?.location],
  );
  const depreciationMethodOptions = useMemo(
    () => withStoredOption(depreciationMethods, resolvedAsset?.depreciationMethod),
    [resolvedAsset?.depreciationMethod],
  );
  
  const form = useForm<AssetFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: editFormValues ?? emptyFormValues,
    values: editFormValues,
  });

  const assignedEmployeeName = String(resolvedAsset?.assignedTo ?? "").trim();
  const hasAssignedEmployeeOption = employees.some(
    (employee) => employee.name === assignedEmployeeName,
  );

  const handleOpenEmployeeForm = () => {
    setLocation("/employees/new");
  };

  const handleOpenCreateOption = (target: CustomOptionTarget) => {
    setCreateOptionTarget(target);
    setNewOptionName("");
  };

  const handleCreateOption = () => {
    if (!createOptionTarget) return;
    const name = newOptionName.trim();
    if (!name) {
      toast({
        title: "Name required",
        description: `Enter a ${optionLabels[createOptionTarget].toLowerCase()} name.`,
        variant: "destructive",
      });
      return;
    }

    const existingOptions = {
      type: typeOptions,
      category: categoryOptions,
      manufacturer: manufacturerOptions,
      location: locationOptions,
    }[createOptionTarget];

    const existing = existingOptions.find((option) => option.toLowerCase() === name.toLowerCase());
    const selectedName = existing ?? name;

    if (!existing) {
      setCustomOptions((current) => {
        const nextValues = [...current[createOptionTarget], name];
        try {
          localStorage.setItem(
            `asset-custom-options-${createOptionTarget}`,
            JSON.stringify(nextValues),
          );
        } catch {
          // The value still remains available for the current session.
        }
        return { ...current, [createOptionTarget]: nextValues };
      });
    }

    form.setValue(createOptionTarget, selectedName.toLowerCase(), {
      shouldDirty: true,
      shouldValidate: true,
    });
    setCreateOptionTarget(null);
    setNewOptionName("");
    toast({
      title: existing ? "Option selected" : `${optionLabels[createOptionTarget]} created`,
      description: `${selectedName} is now selected.`,
    });
  };
  
  const handleFilesSelected = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);

    try {
      const uploaded = await Promise.all(
        files.map(async (file) => ({
          id: `${Date.now()}-${file.name}-${Math.random().toString(36).slice(2, 8)}`,
          name: file.name,
          size: file.size,
          type: file.type,
          dataUrl: await readFileAsDataUrl(file),
        })),
      );
      if (uploaded.length === 0) return;
      setAttachments((current) => [...current, ...uploaded]);
      toast({
        title: uploaded.length === 1 ? "File attached" : "Files attached",
        description: `${uploaded.map((file) => file.name).join(", ")} will be saved with this asset.`,
      });
    } catch {
      toast({
        title: "Upload failed",
        description: "The selected file could not be read. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments((current) => current.filter((attachment) => attachment.id !== id));
  };

  const createAssetMutation = useMutation({
    mutationFn: async (data: AssetFormData) => {
      console.log("📤 Submitting asset data:", data);
      const res = await apiRequest("POST", "/api/assets", data);
      const responseData = await res.json();
      if (!res.ok) {
        console.error("❌ Asset creation failed:", responseData);
        throw new Error(responseData.message || "Failed to create asset");
      }
      return responseData;
    },
    onSuccess: async (created: any) => {
      toast({
        title: "Asset created",
        description: "The asset has been created successfully.",
      });
      if (created?.id != null) saveAssetAttachments(created.id, attachments);
      await queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      await queryClient.refetchQueries({ queryKey: ["/api/assets"] });
      form.reset(emptyFormValues);
      setAttachments([]);
      if (onSuccess) onSuccess();
    },
    onError: (error: any) => {
      console.error("❌ Asset creation error:", error);
      const errorMessage = error?.message || "Failed to create asset";
      toast({
        title: "Failed to create asset",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });
  
  const updateAssetMutation = useMutation({
    mutationFn: async (data: AssetFormData) => {
      const res = await apiRequest("PUT", `/api/assets/${assetId}`, data);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Asset updated",
        description: "The asset has been updated successfully.",
      });
      if (assetId != null) saveAssetAttachments(assetId, attachments);
      queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/assets", assetId] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      if (onSuccess) onSuccess();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update asset",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    onPendingChange?.(createAssetMutation.isPending || updateAssetMutation.isPending);
  }, [createAssetMutation.isPending, updateAssetMutation.isPending, onPendingChange]);

  const onSubmit = (data: AssetFormData) => {
    // Ensure all dates are properly converted to Date objects or ISO strings
    const cleanedData = {
      ...data,
      purchaseDate: data.purchaseDate ? (data.purchaseDate instanceof Date ? data.purchaseDate.toISOString() : new Date(data.purchaseDate).toISOString()) : undefined,
      warrantyExpiry: data.warrantyExpiry ? (data.warrantyExpiry instanceof Date ? data.warrantyExpiry.toISOString() : new Date(data.warrantyExpiry).toISOString()) : undefined,
      depreciationStartDate: data.depreciationStartDate ? (data.depreciationStartDate instanceof Date ? data.depreciationStartDate.toISOString() : new Date(data.depreciationStartDate).toISOString()) : undefined,
    };
    
    if (isEditMode) {
      updateAssetMutation.mutate(cleanedData);
    } else {
      createAssetMutation.mutate(cleanedData);
    }
  };

  // Handle keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      if (onSuccess) onSuccess();
    }
  };
  
  if (isEditMode && isLoadingAsset && !initialAsset) {
    return (
      <p className="py-8 text-center text-sm text-[#6B7280]">Loading...</p>
    );
  }
  
  return (
    <TooltipProvider>
      <Form {...form}>
        <form
          id={formId}
          onSubmit={form.handleSubmit(onSubmit)}
          onKeyDown={handleKeyDown}
          className="space-y-8"
        >
          {/* Basic Details */}
          <section className="space-y-4">
            <ModalSectionHeader icon={Package} title="Basic Details" />
            <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="tag"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="flex items-center gap-2 text-sm font-medium text-[#111827]">
                              Asset Tag *
                              <Tooltip>
                                <TooltipTrigger>
                                  <HelpCircle className="h-4 w-4 text-gray-400" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Unique identifier for tracking this asset</p>
                                </TooltipContent>
                              </Tooltip>
                            </FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="IT-LAP-001" 
                                className="w-full" 
                                autoFocus
                                {...field} 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="type"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-medium text-[#111827]">Asset Type *</FormLabel>
                            <Select
                              key={`type-${assetId ?? "new"}-${field.value}`}
                              onValueChange={field.onChange}
                              value={field.value || undefined}
                            >
                              <FormControl>
                                <SelectTrigger className="w-full">
                                  <SelectValue placeholder="Select asset type" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent className="max-h-[14rem]">
                                <div
                                  className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm font-medium text-primary hover:bg-accent"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    handleOpenCreateOption("type");
                                  }}
                                >
                                  <Plus className="h-4 w-4" />
                                  Create New Asset Type
                                </div>
                                <div className="my-1 border-t" />
                                {typeOptions.map((type) => (
                                  <SelectItem key={type} value={type.toLowerCase()}>
                                    {type}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="category"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-medium text-[#111827]">Category *</FormLabel>
                            <Select
                              key={`category-${assetId ?? "new"}-${field.value}`}
                              onValueChange={field.onChange}
                              value={field.value || undefined}
                            >
                              <FormControl>
                                <SelectTrigger className="w-full">
                                  <SelectValue placeholder="Select category" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent className="max-h-[14rem]">
                                <div
                                  className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm font-medium text-primary hover:bg-accent"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    handleOpenCreateOption("category");
                                  }}
                                >
                                  <Plus className="h-4 w-4" />
                                  Create New Category
                                </div>
                                <div className="my-1 border-t" />
                                {categoryOptions.map((category) => (
                                  <SelectItem key={category} value={category.toLowerCase()}>
                                    {category}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="serial"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-medium text-[#111827]">Serial Number *</FormLabel>
                            <FormControl>
                              <Input placeholder="C02XN1ABMD6R" className="w-full" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="model"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-medium text-[#111827]">Model Number</FormLabel>
                            <FormControl>
                              <Input placeholder="MacBook Pro 14-inch" className="w-full" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="manufacturer"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-medium text-[#111827]">Manufacturer</FormLabel>
                            <Select
                              key={`manufacturer-${assetId ?? "new"}-${field.value}`}
                              onValueChange={field.onChange}
                              value={field.value || undefined}
                            >
                              <FormControl>
                                <SelectTrigger className="w-full">
                                  <SelectValue placeholder="Select manufacturer" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent className="max-h-[14rem]">
                                <div
                                  className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm font-medium text-primary hover:bg-accent"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    handleOpenCreateOption("manufacturer");
                                  }}
                                >
                                  <Plus className="h-4 w-4" />
                                  Create New Manufacturer
                                </div>
                                <div className="my-1 border-t" />
                                {manufacturerOptions.map((manufacturer) => (
                                  <SelectItem key={manufacturer} value={manufacturer.toLowerCase()}>
                                    {manufacturer}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
            </div>
          </section>

          {/* Assignment & Status */}
          <section className="space-y-4">
            <ModalSectionHeader icon={User} title="Assignment & Status" />
            <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="status"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium text-[#111827]">Status *</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || undefined}>
                            <FormControl>
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select status" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="max-h-[14rem]">
                              <SelectItem value="available">Available</SelectItem>
                              <SelectItem value="assigned">Assigned</SelectItem>
                              <SelectItem value="maintenance">Under Repair</SelectItem>
                              <SelectItem value="retired">Retired</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="condition"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium text-[#111827]">Condition</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || undefined}>
                            <FormControl>
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select condition" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="max-h-[14rem]">
                              <SelectItem value="new">New</SelectItem>
                              <SelectItem value="used">Used</SelectItem>
                              <SelectItem value="refurbished">Refurbished</SelectItem>
                              <SelectItem value="damaged">Damaged</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="assignedTo"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium text-[#111827]">Assigned To</FormLabel>
                          <Select
                            key={`assigned-${assetId ?? "new"}-${field.value}`}
                            onValueChange={field.onChange}
                            value={field.value || undefined}
                          >
                            <FormControl>
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder={
                                  isLoadingEmployees 
                                    ? "Loading employees..." 
                                    : employees.length === 0 
                                      ? "No employees found - Create one first" 
                                      : "Select employee"
                                } />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="max-h-[14rem]">
                              <div 
                                className="flex items-center gap-2 px-2 py-1.5 text-sm font-medium text-primary cursor-pointer hover:bg-accent rounded-sm"
                                onClick={(e) => {
                                  e.preventDefault();
                                  handleOpenEmployeeForm();
                                }}
                              >
                                <UserPlus className="h-4 w-4" />
                                Create New Employee
                              </div>
                              {employees.length > 0 && (
                                <div className="border-t my-1" />
                              )}
                              {assignedEmployeeName && !hasAssignedEmployeeOption && (
                                <SelectItem value={assignedEmployeeName}>
                                  {assignedEmployeeName}
                                </SelectItem>
                              )}
                              {employees.map((employee) => (
                                <SelectItem key={employee.id} value={employee.name}>
                                  {employee.name} - {employee.designation}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormDescription className="text-xs text-[#6B7280]">
                            Leave empty if available for assignment
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="location"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium text-[#111827]">Location</FormLabel>
                          <Select
                            key={`location-${assetId ?? "new"}-${field.value}`}
                            onValueChange={field.onChange}
                            value={field.value || undefined}
                          >
                            <FormControl>
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select location" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="max-h-[14rem]">
                              <div
                                className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm font-medium text-primary hover:bg-accent"
                                onClick={(event) => {
                                  event.preventDefault();
                                  handleOpenCreateOption("location");
                                }}
                              >
                                <Plus className="h-4 w-4" />
                                Create New Location
                              </div>
                              <div className="my-1 border-t" />
                              {locationOptions.map((location) => (
                                <SelectItem key={location} value={location.toLowerCase()}>
                                  {location}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
            </div>
          </section>

          {/* Procurement Details */}
          <section className="space-y-4">
            <ModalSectionHeader icon={CreditCard} title="Procurement Details" />
            <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="vendor"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium text-[#111827]">Vendor</FormLabel>
                          <FormControl>
                            <Input placeholder="Vendor name" className="w-full" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="invoiceNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium text-[#111827]">Invoice Number</FormLabel>
                          <FormControl>
                            <Input placeholder="INV-2024-001" className="w-full" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="purchaseDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium text-[#111827]">Purchase Date</FormLabel>
                          <FormControl>
                            <DatePicker
                              date={field.value ? new Date(field.value) : undefined}
                              setDate={(date) => field.onChange(date)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="warrantyExpiry"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium text-[#111827]">Warranty Expiry Date</FormLabel>
                          <FormControl>
                            <DatePicker
                              date={field.value ? new Date(field.value) : undefined}
                              setDate={(date) => field.onChange(date)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
            </div>
          </section>

          {/* Finance Details (Optional) */}
          <section className="space-y-4">
            <ModalSectionHeader icon={Calculator} title="Finance Details (Optional)" />
            <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">
                        <FormField
                          control={form.control}
                          name="depreciationStartDate"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-sm font-medium text-[#111827]">Depreciation Start Date</FormLabel>
                              <FormControl>
                                <DatePicker
                                  date={field.value ? new Date(field.value) : undefined}
                                  setDate={(date) => field.onChange(date)}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="usefulLifeYears"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-sm font-medium text-[#111827]">Useful Life (Years)</FormLabel>
                              <FormControl>
                                <Input
                                  type="text"
                                  inputMode="numeric"
                                  placeholder="e.g. 3"
                                  value={field.value ?? ""}
                                  onChange={(e) => {
                                    const v = e.target.value.replace(/\D/g, "");
                                    field.onChange(v === "" ? undefined : parseInt(v, 10));
                                  }}
                                  onBlur={field.onBlur}
                                  name={field.name}
                                  ref={field.ref}
                                />
                              </FormControl>
                              <FormDescription className="text-xs text-[#6B7280]">
                                Expected useful life for depreciation calculation
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="depreciationMethod"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-sm font-medium text-[#111827]">Depreciation Method</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value || undefined}>
                                <FormControl>
                                  <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Select method" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent className="max-h-[14rem]">
                                  {depreciationMethodOptions.map((method) => (
                                    <SelectItem key={method} value={method.toLowerCase()}>
                                      {method}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
            </div>
          </section>

          {/* Additional Notes */}
          <section className="space-y-4">
            <ModalSectionHeader icon={FileText} title="Additional Notes" />
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium text-[#111827]">Description / Notes</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Additional information about this asset..."
                            className="min-h-[100px] resize-none"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription className="text-xs text-[#6B7280]">
                          Any additional details, specifications, or notes about the asset
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
          </section>

          {/* Attachments */}
          <section className="space-y-4">
            <ModalSectionHeader icon={Paperclip} title="Attachments" />
            <div className="space-y-3">
              <div className="flex flex-col items-start gap-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    void handleFilesSelected(event.target.files);
                    event.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="border-[#E5E7EB] text-[#111827]"
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Upload Files
                </Button>
                <p className="text-xs text-[#6B7280]">
                  Attach invoices, warranty cards or photos.
                </p>
              </div>

              {attachments.length > 0 && (
                <ul className="space-y-2">
                  {attachments.map((attachment) => (
                    <li
                      key={attachment.id}
                      className="flex items-center justify-between gap-3 rounded-md border border-[#E5E7EB] bg-white px-3 py-2"
                    >
                      <a
                        href={attachment.dataUrl}
                        download={attachment.name}
                        target="_blank"
                        rel="noreferrer"
                        className="min-w-0 flex-1 truncate text-sm font-medium text-[#2563EB] hover:underline"
                      >
                        {attachment.name}
                      </a>
                      <span className="shrink-0 text-xs text-[#6B7280]">
                        {formatFileSize(attachment.size)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveAttachment(attachment.id)}
                        className="shrink-0 rounded p-1 text-[#6B7280] transition-colors hover:bg-[#F3F4F6] hover:text-[#DC2626]"
                        aria-label={`Remove ${attachment.name}`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {!hideFooter && (
            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  form.reset(emptyFormValues);
                  if (onSuccess) onSuccess();
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createAssetMutation.isPending || updateAssetMutation.isPending}
                className="bg-[#2563EB] text-white hover:bg-[#2563EB]"
              >
                {isEditMode ? "Update Asset" : "Create Asset"}
              </Button>
            </div>
          )}
        </form>
      </Form>

      <Dialog
        open={createOptionTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOptionTarget(null);
            setNewOptionName("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Create New {createOptionTarget ? optionLabels[createOptionTarget] : "Option"}
            </DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={newOptionName}
            onChange={(event) => setNewOptionName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleCreateOption();
              }
            }}
            placeholder={`Enter ${createOptionTarget ? optionLabels[createOptionTarget].toLowerCase() : "option"} name`}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateOptionTarget(null)}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleCreateOption}>
              Create & Select
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
