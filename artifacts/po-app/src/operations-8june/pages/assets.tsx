import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import {
  ManagementPageHeader,
  ManagementTableCard,
  ManagementTableContainer,
  ManagementEmptyState,
  ManagementSearchBar,
} from "@/operations-8june/components/layout/ManagementPageUI";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Asset } from "@shared/schema";
import { apiRequest, parseApiResponse } from "@/operations-8june/lib/queryClient";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import AssetViewDialog from "@/operations-8june/components/forms/AssetViewDialog";
import {
  Plus,
  Trash2,
  Edit2,
  Eye,
  UserPlus,
  ChevronDown,
  Printer,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
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
import AssignAssetModal from "@/operations-8june/components/modals/AssignAssetModal";
import { usePagination } from "@/hooks/use-pagination";

function formatAssetDate(value?: string | Date | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-SG");
}

function formatAssetCurrency(value?: string | number | null): string {
  const amount = typeof value === "string" ? parseFloat(value) : Number(value);
  if (!Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    minimumFractionDigits: 2,
  }).format(amount);
}

function calcAssetDepreciation(asset: Asset) {
  const purchaseValue = parseFloat(String(asset.cost ?? "")) || 0;
  if (purchaseValue <= 0) {
    return { purchaseValue: 0, depreciationValue: 0, writtenDownValue: 0 };
  }

  const usefulLifeYears = Number(asset.usefulLifeYears) || 0;
  const startRaw = asset.depreciationStartDate || asset.purchaseDate;
  if (!usefulLifeYears || !startRaw) {
    return { purchaseValue, depreciationValue: 0, writtenDownValue: purchaseValue };
  }

  const startDate = new Date(startRaw);
  if (Number.isNaN(startDate.getTime())) {
    return { purchaseValue, depreciationValue: 0, writtenDownValue: purchaseValue };
  }

  const today = new Date();
  const monthsElapsed = Math.max(
    0,
    (today.getFullYear() - startDate.getFullYear()) * 12 +
      (today.getMonth() - startDate.getMonth())
  );
  const maxMonths = usefulLifeYears * 12;
  const appliedMonths = Math.min(monthsElapsed, maxMonths);
  const monthlyDepreciation = purchaseValue / maxMonths;
  const depreciationValue = Math.round(monthlyDepreciation * appliedMonths * 100) / 100;
  const writtenDownValue = Math.max(0, Math.round((purchaseValue - depreciationValue) * 100) / 100);

  return { purchaseValue, depreciationValue, writtenDownValue };
}

export default function AssetsPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { selectedCompany, isLoading: authLoading } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState<number | null>(null);
  const [viewingAsset, setViewingAsset] = useState<Asset | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<string | "all">("all");
  const [locationReportSelected, setLocationReportSelected] = useState(false);
  
  const { data: assets = [], isLoading, isError, error } = useQuery<Asset[]>({
    queryKey: ["/api/assets"],
    enabled: !authLoading && !!selectedCompany,
    staleTime: 0,
  });
  
  const deleteAssetMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/assets/${id}`);
      const json = await res.json();
      return parseApiResponse(json);
    },
    onSuccess: async () => {
      toast({
        title: "Asset deleted",
        description: "The asset has been deleted successfully.",
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      await queryClient.refetchQueries({ queryKey: ["/api/assets"] });
      setIsDeleteDialogOpen(false);
      setSelectedAssetId(null);
    },
    onError: (error: Error) => {
      console.error("❌ Asset deletion failed:", error);
      toast({
        title: "Failed to delete asset",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  const handleViewAsset = (asset: Asset) => {
    setViewingAsset(asset);
    setIsViewDialogOpen(true);
  };

  const handleEditAsset = (asset: Asset) => {
    setLocation(`/assets/${asset.id}/edit`);
  };
  
  const handleDeleteAsset = (id: number) => {
    setSelectedAssetId(id);
    setIsDeleteDialogOpen(true);
  };
  
  const handleAssignAsset = (id: number) => {
    setSelectedAssetId(id);
    setIsAssignDialogOpen(true);
  };
  
  const confirmDelete = () => {
    if (selectedAssetId && !deleteAssetMutation.isPending) {
      deleteAssetMutation.mutate(selectedAssetId);
    }
  };

  const assetList = Array.isArray(assets) ? assets : [];

  // Default predefined locations
  const defaultLocations = [
    "Headquarters", "Branch Office", "Remote", "Warehouse", "IT Room", 
    "Conference Room", "Reception"
  ];

  // Load custom locations from localStorage
  let customLocations: string[] = [];
  try {
    const stored = localStorage.getItem("asset-custom-options-location");
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        customLocations = parsed.filter((item): item is string => typeof item === "string");
      }
    }
  } catch (e) {
    console.error("Failed to load custom locations", e);
  }

  // Extract unique locations from asset list
  const assetLocations = assetList
    .map((asset) => asset.location?.trim())
    .filter(Boolean) as string[];

  // Combine and deduplicate case-insensitively, keeping the best casing
  const allLocationsMap = new Map<string, string>();
  defaultLocations.forEach(loc => allLocationsMap.set(loc.toLowerCase(), loc));
  customLocations.forEach(loc => allLocationsMap.set(loc.toLowerCase(), loc));
  assetLocations.forEach(loc => {
    const key = loc.toLowerCase();
    if (!allLocationsMap.has(key)) {
      allLocationsMap.set(key, loc);
    }
  });

  const locations = Array.from(allLocationsMap.values());

  const handlePrintLocationReport = (location: string | "all") => {
    const reportAssets = location === "all" 
      ? assetList 
      : assetList.filter(a => String(a.location || "").trim().toLowerCase() === location.trim().toLowerCase());

    if (reportAssets.length === 0) {
      toast({
        title: "No assets found",
        description: `There are no assets in ${location === "all" ? "any location" : location}.`,
        variant: "destructive",
      });
      return;
    }

    // Create iframe for printing
    const iframe = document.createElement("iframe");
    iframe.style.position = "absolute";
    iframe.style.width = "0px";
    iframe.style.height = "0px";
    iframe.style.border = "none";
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) {
      iframe.remove();
      return;
    }

    const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
      .map((n) => n.outerHTML)
      .join("\n");

    const companyName = selectedCompany?.name || "BizOne Singapore";
    const reportTitle = location === "all" 
      ? "Asset Location Wise Report - All Locations" 
      : `Asset Location Wise Report - ${location}`;
    const currentDate = new Date().toLocaleDateString("en-SG", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const rowsHtml = reportAssets.map(asset => {
      const { purchaseValue, depreciationValue, writtenDownValue } = calcAssetDepreciation(asset);
      return `
      <tr style="border-bottom: 1px solid #E5E7EB;">
        <td style="padding: 8px 10px; font-weight: 500; color: #111827;">${asset.tag || "—"}</td>
        <td style="padding: 8px 10px; color: #111827;">${asset.category || asset.type || "—"}</td>
        <td style="padding: 8px 10px; font-family: monospace;">${asset.serial || "—"}</td>
        <td style="padding: 8px 10px; text-transform: capitalize;">
          <span style="display: inline-block; padding: 2px 8px; font-size: 11px; font-weight: 500; border-radius: 9999px; ${
            asset.status === "available" ? "background-color: #DEF7EC; color: #0E9F6E;" :
            asset.status === "assigned" ? "background-color: #E1EFFE; color: #2563EB;" :
            asset.status === "maintenance" ? "background-color: #FDF6B2; color: #C27803;" :
            "background-color: #FDE8E8; color: #E02424;"
          }">
            ${asset.status || "—"}
          </span>
        </td>
        <td style="padding: 8px 10px; color: #4B5563;">${asset.assignedTo || "—"}</td>
        <td style="padding: 8px 10px; color: #4B5563;">${asset.location || "—"}</td>
        <td style="padding: 8px 10px; color: #4B5563; white-space: nowrap;">${formatAssetDate(asset.purchaseDate)}</td>
        <td style="padding: 8px 10px; color: #4B5563; white-space: nowrap;">${formatAssetDate(asset.warrantyExpiry)}</td>
        <td style="padding: 8px 10px; color: #111827; text-align: right; white-space: nowrap;">${formatAssetCurrency(purchaseValue)}</td>
        <td style="padding: 8px 10px; color: #111827; text-align: right; white-space: nowrap;">${formatAssetCurrency(depreciationValue)}</td>
        <td style="padding: 8px 10px; color: #111827; text-align: right; white-space: nowrap;">${formatAssetCurrency(writtenDownValue)}</td>
      </tr>
    `;
    }).join("");

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>${reportTitle}</title>
        ${styles}
        <style>
          @page { size: A4 landscape; margin: 12mm; }
          body {
            font-family: system-ui, -apple-system, sans-serif;
            color: #1F2937;
            background-color: #FFFFFF;
            margin: 0;
            padding: 0;
          }
          .header {
            border-bottom: 2px solid #2563EB;
            padding-bottom: 16px;
            margin-bottom: 24px;
          }
          .company-name {
            font-size: 14px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: #4B5563;
            font-weight: 600;
          }
          .report-title {
            font-size: 24px;
            font-weight: 700;
            color: #111827;
            margin: 4px 0 8px 0;
          }
          .meta-info {
            font-size: 12px;
            color: #6B7280;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            text-align: left;
            font-size: 10px;
          }
          th {
            background-color: #F9FAFB;
            color: #374151;
            font-weight: 600;
            padding: 8px 10px;
            border-bottom: 1px solid #E5E7EB;
            white-space: nowrap;
          }
          .footer {
            margin-top: 40px;
            border-top: 1px solid #E5E7EB;
            padding-top: 12px;
            font-size: 10px;
            color: #9CA3AF;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="company-name">${companyName}</div>
          <div class="report-title">${reportTitle}</div>
          <div class="meta-info">Generated on ${currentDate} &bull; Total Assets: ${reportAssets.length}</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Asset Tag</th>
              <th>Category</th>
              <th>Serial No</th>
              <th>Status</th>
              <th>Assigned To</th>
              <th>Location</th>
              <th>Purchase Date</th>
              <th>Warranty Expire Date</th>
              <th style="text-align: right;">Purchase Value</th>
              <th style="text-align: right;">Depreciation Value</th>
              <th style="text-align: right;">Written Down Value</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
        <div class="footer">
          BizOne Asset Management System &bull; Confidential
        </div>
      </body>
      </html>
    `);
    doc.close();

    const win = iframe.contentWindow;
    if (!win) {
      iframe.remove();
      return;
    }

    const cleanup = () => {
      setTimeout(() => {
        try {
          iframe.remove();
        } catch {
          // ignore
        }
      }, 1000);
    };

    win.onafterprint = cleanup;
    setTimeout(() => {
      win.focus();
      win.print();
      cleanup();
    }, 500);
  };

  const filteredAssets = useMemo(() => assetList.filter((asset) => {
    // 1. Filter by selected location
    if (selectedLocation !== "all") {
      const assetLoc = (asset.location || "").trim().toLowerCase();
      const filterLoc = selectedLocation.trim().toLowerCase();
      if (assetLoc !== filterLoc) return false;
    }

    // 2. Filter by search term
    const q = searchTerm.trim().toLowerCase();
    if (!q) return true;
    return [
      asset.tag,
      asset.type,
      asset.category,
      asset.serial,
      asset.status,
      asset.assignedTo,
      asset.location,
    ].some((value) => String(value ?? "").toLowerCase().includes(q));
  }), [assetList, selectedLocation, searchTerm]);

  const { page, setPage, totalPages, paginatedItems } = usePagination(filteredAssets);

  const getStatusPillStyle = (status: string) => {
    switch (status) {
      case "available":
        return { background: "#DEF7EC", color: "#0E9F6E" };
      case "assigned":
        return { background: "#E1EFFE", color: "#2563EB" };
      case "maintenance":
        return { background: "#FDF6B2", color: "#C27803" };
      case "retired":
        return { background: "#FDE8E8", color: "#E02424" };
      default:
        return { background: "#F3F4F6", color: "#6B7280" };
    }
  };
  
  return (
    <>
      <style>{`
        .no-scrollbar::-webkit-scrollbar {
          display: none !important;
        }
        .no-scrollbar {
          -ms-overflow-style: none !important;
          scrollbar-width: none !important;
        }
      `}</style>
      <ManagementPageHeader
        title="Assets"
        action={
          <div className="flex flex-wrap gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-9 min-w-[180px] justify-between gap-2 px-3 border-[#E4E4E4]">
                  <span className="truncate">
                    {selectedLocation === "all" ? "Location Wise Report" : `Location: ${selectedLocation}`}
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                sideOffset={4}
                className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-[var(--radix-dropdown-menu-trigger-width)] max-h-[210px] overflow-y-auto p-1 no-scrollbar"
              >
                <DropdownMenuItem
                  onClick={() => {
                    setSelectedLocation("all");
                    setLocationReportSelected(true);
                  }}
                  className={`cursor-pointer px-2 py-1.5 ${selectedLocation === "all" && locationReportSelected ? "bg-accent font-medium" : ""}`}
                >
                  All Locations
                </DropdownMenuItem>
                {locations.length > 0 && <DropdownMenuSeparator />}
                {locations.map((loc) => (
                  <DropdownMenuItem
                    key={loc}
                    onClick={() => {
                      setSelectedLocation(loc);
                      setLocationReportSelected(true);
                    }}
                    className={`cursor-pointer px-2 py-1.5 ${selectedLocation.toLowerCase() === loc.toLowerCase() && locationReportSelected ? "bg-accent font-medium" : ""}`}
                  >
                    {loc}
                  </DropdownMenuItem>
                ))}
                {locations.length === 0 && (
                  <DropdownMenuItem disabled className="px-2 py-1.5 text-muted-foreground">
                    No locations found
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              className="bg-[#2563EB] text-white shadow-sm hover:bg-[#2563EB]"
              onClick={() => setLocation("/assets/new")}
            >
              <Plus className="mr-2 h-4 w-4" /> Create Asset
            </Button>
          </div>
        }
      />

      <div className="mb-6 flex items-center justify-between gap-2">
        <div className="w-full max-w-md [&>div]:mb-0">
          <ManagementSearchBar
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Search..."
          />
        </div>
        {locationReportSelected && (
          <Button
            variant="outline"
            className="h-11 shrink-0 gap-2 border-[#E5E7EB]"
            onClick={() => handlePrintLocationReport(selectedLocation)}
          >
            <Printer className="h-4 w-4" />
            Print
          </Button>
        )}
      </div>

      <ManagementTableCard pagination={{ page, totalPages, onPageChange: setPage }}>
          {isLoading || authLoading ? (
            <p className="py-16 text-center text-sm text-[#6B7280]">Loading...</p>
          ) : isError ? (
            <ManagementEmptyState
              title="Failed to load assets"
              description={error instanceof Error ? error.message : "Please try again."}
            />
          ) : assetList.length > 0 && filteredAssets.length > 0 ? (
            <ManagementTableContainer>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Asset Tag</TableHead>
                    <TableHead>Type / Category</TableHead>
                    <TableHead>Serial</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Assigned To</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Warranty Expiry</TableHead>
                    <TableHead className="w-px text-left">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedItems.map((asset) => (
                    <TableRow key={asset.id}>
                      <TableCell className="font-medium text-[#111827]">{asset.tag}</TableCell>
                      <TableCell>
                        <div>
                          <div className="text-[#111827]">{asset.type}</div>
                          <div className="text-sm text-[#6B7280]">{asset.category}</div>
                        </div>
                      </TableCell>
                      <TableCell className="text-[#444651]">{asset.serial}</TableCell>
                      <TableCell>
                        <span
                          className="inline-flex items-center rounded-full px-3 py-0.5 text-xs font-medium capitalize"
                          style={getStatusPillStyle(asset.status)}
                        >
                          {asset.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-[#444651]">{asset.assignedTo || "—"}</TableCell>
                      <TableCell className="text-[#444651]">{asset.location || "—"}</TableCell>
                      <TableCell className="whitespace-nowrap text-[#444651]">
                        {asset.warrantyExpiry 
                          ? new Date(asset.warrantyExpiry).toLocaleDateString() 
                          : "—"}
                      </TableCell>
                      <TableCell className="w-px whitespace-nowrap">
                        <div className="flex items-center justify-start gap-2">
                          <button
                            type="button"
                            title="View asset"
                            onClick={() => handleViewAsset(asset)}
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-600 transition-colors hover:bg-gray-200 active:scale-95"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            title="Edit asset"
                            onClick={() => handleEditAsset(asset)}
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-[#2563EB] transition-colors hover:bg-blue-100 active:scale-95"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          {asset.status === "available" && (
                            <button
                              type="button"
                              title="Assign asset"
                              onClick={() => handleAssignAsset(asset.id)}
                              className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 transition-colors hover:bg-emerald-100 active:scale-95"
                            >
                              <UserPlus className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            title="Delete asset"
                            onClick={() => handleDeleteAsset(asset.id)}
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-red-50 text-red-600 transition-colors hover:bg-red-100 active:scale-95"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ManagementTableContainer>
          ) : (
            <ManagementEmptyState
              title={searchTerm ? "No results found" : "No assets found"}
              description={
                searchTerm
                  ? "Try adjusting your search terms."
                  : "Get started by creating a new asset."
              }
              action={
                !searchTerm ? (
                  <Button
                    className="bg-[#2563EB] text-white shadow-sm hover:bg-[#2563EB]"
                    onClick={() => setLocation("/assets/new")}
                  >
                    <Plus className="mr-2 h-4 w-4" /> Add Asset
                  </Button>
                ) : undefined
              }
            />
          )}
      </ManagementTableCard>
      
      <AssetViewDialog
        open={isViewDialogOpen}
        onClose={() => {
          setIsViewDialogOpen(false);
          setViewingAsset(null);
        }}
        asset={viewingAsset}
      />

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to delete this asset?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the asset and remove all related data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteAssetMutation.isPending}
            >
              {deleteAssetMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      <AssignAssetModal
        open={isAssignDialogOpen}
        onClose={() => {
          setIsAssignDialogOpen(false);
          setSelectedAssetId(null);
        }}
        preSelectedAssetId={selectedAssetId}
      />
    </>
  );
}
