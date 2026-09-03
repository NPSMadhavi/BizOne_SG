import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ManagementPageHeader,
  ManagementTableCard,
  ManagementTableContainer,
  ManagementEmptyState,
  ManagementToolbarRow,
} from "@/operations-8june/components/layout/ManagementPageUI";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, Edit2, Eye, Plus, ChevronDown } from "lucide-react";
import { License } from "@shared/schema";
import { format, isAfter, isBefore, addDays } from "date-fns";
import LicenseViewDialog from "@/operations-8june/components/forms/LicenseViewDialog";
import { useToast } from "@/hooks/use-toast";
import { usePagination } from "@/hooks/use-pagination";
import { cn } from "@/lib/utils";
import {
  exportLicensesToExcel,
  exportLicensesToPdf,
} from "@/operations-8june/lib/license-export";

const FILTER_TABS = [
  { id: "all", label: "All Licenses" },
  { id: "expiring", label: "Expiring" },
  { id: "expired", label: "Expired" },
] as const;

type FilterTabId = (typeof FILTER_TABS)[number]["id"];

export default function LicensesPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [selectedLicense, setSelectedLicense] = useState<License | null>(null);
  const [activeTab, setActiveTab] = useState<FilterTabId>("all");

  // Fetch licenses
  const { data: licenses = [], isLoading } = useQuery<License[]>({
    queryKey: ["/api/licenses"],
  });

  const matchesTab = (license: License) => {
    if (activeTab === "all") return true;
    if (activeTab === "expiring") {
      return (
        license.expiryDate &&
        isAfter(new Date(license.expiryDate), new Date()) &&
        isBefore(new Date(license.expiryDate), addDays(new Date(), 90))
      );
    }
    if (activeTab === "expired") {
      return license.expiryDate && isBefore(new Date(license.expiryDate), new Date());
    }
    return true;
  };

  const filteredLicenses = useMemo(() => licenses.filter(matchesTab), [licenses, activeTab]);

  const { page, setPage, totalPages, paginatedItems } = usePagination(filteredLicenses);

  const handleExport = (formatType: "excel" | "pdf") => {
    if (filteredLicenses.length === 0) {
      toast({
        title: "No data to export",
        description: "There are no licenses matching the current filter to export.",
        variant: "destructive",
      });
      return;
    }

    try {
      if (formatType === "excel") {
        exportLicensesToExcel(filteredLicenses, activeTab);
        toast({
          title: "Export successful",
          description: "License data has been downloaded as an Excel file.",
        });
      } else {
        exportLicensesToPdf(filteredLicenses, activeTab);
        toast({
          title: "Export successful",
          description: "License data has been downloaded as a PDF file.",
        });
      }
    } catch {
      toast({
        title: "Export failed",
        description: "Unable to download the report. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Calculate license status badge
  const getLicenseStatusBadge = (license: License) => {
    if (!license.expiryDate) return null;
    
    const expiryDate = new Date(license.expiryDate);
    const now = new Date();
    
    if (isBefore(expiryDate, now)) {
      return <Badge variant="destructive">Expired</Badge>;
    } else if (isBefore(expiryDate, addDays(now, 90))) {
      return <Badge variant="warning" className="bg-amber-500 text-white">Expiring Soon</Badge>;
    } else {
      return <Badge variant="outline">Valid</Badge>;
    }
  };

  return (
    <>
      <ManagementPageHeader
        title="Licenses"
        action={
          <div className="flex flex-wrap gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="flex items-center gap-2 border-[#E4E4E4]"
                  disabled={filteredLicenses.length === 0}
                >
                  <Download className="h-4 w-4" />
                  Export
                  <ChevronDown className="h-4 w-4 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleExport("excel")}>
                  Excel
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("pdf")}>
                  PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              className="bg-[#2563EB] text-white shadow-sm hover:bg-[#2563EB]"
              onClick={() => setLocation("/licenses/new")}
            >
              <Plus className="mr-2 h-4 w-4" />Create License
            </Button>
          </div>
        }
      />

      <ManagementToolbarRow>
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
              activeTab === tab.id
                ? "bg-[#2563EB] text-white shadow-sm"
                : "border border-[#E5E7EB] bg-white text-[#444651] hover:bg-[#F8FAFB]"
            )}
          >
            {tab.label}
          </button>
        ))}
      </ManagementToolbarRow>

      <ManagementTableCard pagination={{ page, totalPages, onPageChange: setPage }}>
            {isLoading ? (
              <p className="py-16 text-center text-sm text-[#6B7280]">Loading...</p>
            ) : licenses.length > 0 && filteredLicenses.length === 0 ? (
              <ManagementEmptyState
                title={
                  activeTab === "expiring"
                    ? "No licenses expiring soon"
                    : activeTab === "expired"
                    ? "No expired licenses"
                    : "No licenses found"
                }
                description={
                  activeTab === "expiring"
                    ? "None of your licenses are expiring in the next 3 months."
                    : activeTab === "expired"
                    ? "All your licenses are currently active and valid."
                    : "No licenses match the current filter."
                }
              />
            ) : filteredLicenses.length === 0 ? (
              <ManagementEmptyState
                title="No licenses found"
                description="You haven't added any licenses yet. Add a license to track software and hardware assets."
                action={
                  <Button
                    className="bg-[#2563EB] text-white shadow-sm hover:bg-[#2563EB]"
                    onClick={() => setLocation("/licenses/new")}
                  >
                    <Plus className="mr-2 h-4 w-4" /> Add Your First License
                  </Button>
                }
              />
            ) : (
              <ManagementTableContainer>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Purchase Date</TableHead>
                    <TableHead>Expiry Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Asset</TableHead>
                    <TableHead>Seats</TableHead>
                    <TableHead className="w-px text-left">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedItems.map((license) => (
                    <TableRow key={license.id}>
                      <TableCell className="font-medium text-[#111827]">
                        <button
                          onClick={() => {
                            setSelectedLicense(license);
                            setIsViewModalOpen(true);
                          }}
                          className="text-left transition-colors hover:text-[#2563EB] hover:underline"
                          data-testid={`link-license-${license.id}`}
                        >
                          {license.name}
                        </button>
                      </TableCell>
                      <TableCell className="text-[#444651] capitalize">
                        {license.type}
                      </TableCell>
                      <TableCell className="text-[#444651]">
                        {license.purchaseDate
                          ? format(new Date(license.purchaseDate), "MMM d, yyyy")
                          : "-"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-[#444651]">
                        {license.expiryDate
                          ? format(new Date(license.expiryDate), "MMM d, yyyy")
                          : "Never"}
                      </TableCell>
                      <TableCell>
                        {getLicenseStatusBadge(license)}
                      </TableCell>
                      <TableCell className="text-[#444651]">
                        {license.assetId ? `#${license.assetId}` : "-"}
                      </TableCell>
                      <TableCell className="text-[#444651]">{license.seats || "-"}</TableCell>
                      <TableCell className="w-px whitespace-nowrap">
                        <div className="flex items-center justify-start gap-2">
                          <button
                            type="button"
                            title="View license"
                            onClick={() => {
                              setSelectedLicense(license);
                              setIsViewModalOpen(true);
                            }}
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-600 transition-colors hover:bg-gray-200 active:scale-95"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            title="Edit license"
                            onClick={() => setLocation(`/licenses/${license.id}/edit`)}
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-[#2563EB] transition-colors hover:bg-blue-100 active:scale-95"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </ManagementTableContainer>
            )}
        </ManagementTableCard>

      <LicenseViewDialog
        open={isViewModalOpen}
        onClose={() => setIsViewModalOpen(false)}
        license={selectedLicense}
      />
    </>
  );
}
