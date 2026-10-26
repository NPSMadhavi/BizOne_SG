import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { MoreHorizontal, Package } from "lucide-react";
import type { Asset } from "@shared/schema";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ManagementEmptyState,
  ManagementPageHeader,
  ManagementSearchBar,
  ManagementTableCard,
  ManagementTableContainer,
} from "@/operations-8june/components/layout/ManagementPageUI";
import {
  calcAssetBookValues,
  formatAssetDateShort,
  formatAssetRegisterId,
  formatSgd,
} from "@/operations-8june/lib/asset-depreciation";
import {
  loadAssetAttachments,
  loadAssetPrimaryImage,
} from "@/operations-8june/lib/asset-attachments";
import { usePagination } from "@/hooks/use-pagination";
import { ListPagination } from "@/components/list-pagination";

function resolveAssetImageSrc(assetId: number, assetImage?: string | null): string {
  const fromApi = String(assetImage || "").trim();
  if (
    fromApi.startsWith("data:image") ||
    fromApi.startsWith("http://") ||
    fromApi.startsWith("https://") ||
    fromApi.startsWith("/")
  ) {
    return fromApi;
  }
  const local = loadAssetPrimaryImage(assetId);
  if (local) return local;
  const attachments = loadAssetAttachments(assetId);
  const img = attachments.find(
    (a) =>
      String(a.type || "").startsWith("image/") ||
      /\.(png|jpe?g|webp|gif)$/i.test(a.name || ""),
  );
  return img?.dataUrl || "";
}

function AssetThumb({
  assetId,
  name,
  assetImage,
}: {
  assetId: number;
  name: string;
  assetImage?: string | null;
}) {
  const src = resolveAssetImageSrc(assetId, assetImage);
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className="h-9 w-9 rounded-md object-cover border border-[#E5E7EB] shrink-0"
      />
    );
  }
  return (
    <div className="h-9 w-9 rounded-md bg-[#EFF6FF] border border-[#DBEAFE] flex items-center justify-center shrink-0">
      <Package className="h-4 w-4 text-[#2563EB]" />
    </div>
  );
}

export default function AssetRegisterPage() {
  const [, setLocation] = useLocation();
  const { selectedCompany, isLoading: authLoading } = useAuth();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const { data: assets = [], isLoading } = useQuery<Asset[]>({
    queryKey: ["/api/assets"],
    enabled: !authLoading && !!selectedCompany,
  });

  const rows = useMemo(() => {
    const list = Array.isArray(assets) ? assets : [];
    const q = search.trim().toLowerCase();
    return list
      .filter((a) => {
        if (!q) return true;
        const hay = `${a.tag} ${a.type} ${a.category} ${a.serial || ""}`.toLowerCase();
        return hay.includes(q);
      })
      .map((a) => {
        const books = calcAssetBookValues(a);
        return { asset: a, books };
      });
  }, [assets, search]);

  const { page, setPage, totalPages, paginatedItems } = usePagination(rows, 20);

  const allChecked = paginatedItems.length > 0 && paginatedItems.every((r) => selected.has(r.asset.id));

  function toggleAll(checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of paginatedItems) {
        if (checked) next.add(r.asset.id);
        else next.delete(r.asset.id);
      }
      return next;
    });
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <ManagementPageHeader
        title="Asset Register"
        action={
          <Button
            className="bg-[#2563EB] hover:bg-[#1D4ED8]"
            onClick={() => setLocation("/assets/new")}
          >
            + Add Asset
          </Button>
        }
      />

      <ManagementSearchBar value={search} onChange={setSearch} placeholder="Search assets..." />

      <ManagementTableCard>
        <ManagementTableContainer>
          {isLoading ? (
            <p className="p-8 text-center text-sm text-[#6B7280]">Loading...</p>
          ) : rows.length === 0 ? (
            <ManagementEmptyState title="No assets" description="Create an asset to populate the register." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-[#EFF6FF] hover:bg-[#EFF6FF]">
                  <TableHead className="w-10">
                    <Checkbox checked={allChecked} onCheckedChange={(v) => toggleAll(Boolean(v))} />
                  </TableHead>
                  <TableHead className="text-[#1E3A8A] font-semibold">Asset ID</TableHead>
                  <TableHead className="text-[#1E3A8A] font-semibold w-14">Image</TableHead>
                  <TableHead className="text-[#1E3A8A] font-semibold">Asset Name</TableHead>
                  <TableHead className="text-[#1E3A8A] font-semibold">Category</TableHead>
                  <TableHead className="text-[#1E3A8A] font-semibold text-center">Purchase Date</TableHead>
                  <TableHead className="text-[#1E3A8A] font-semibold text-right">Cost (S$)</TableHead>
                  <TableHead className="text-[#1E3A8A] font-semibold text-right">Acc. Dep. (S$)</TableHead>
                  <TableHead className="text-[#1E3A8A] font-semibold text-right">NBV (S$)</TableHead>
                  <TableHead className="text-[#1E3A8A] font-semibold">Status</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedItems.map(({ asset, books }) => (
                  <TableRow key={asset.id} className="even:bg-[#F9FAFB]">
                    <TableCell>
                      <Checkbox
                        checked={selected.has(asset.id)}
                        onCheckedChange={(v) => {
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (v) next.add(asset.id);
                            else next.delete(asset.id);
                            return next;
                          });
                        }}
                      />
                    </TableCell>
                    <TableCell className="font-medium text-[#111827]">
                      {formatAssetRegisterId(asset)}
                    </TableCell>
                    <TableCell>
                      <AssetThumb
                        assetId={asset.id}
                        name={asset.type}
                        assetImage={(asset as any).assetImage ?? (asset as any).asset_image}
                      />
                    </TableCell>
                    <TableCell>
                      <span className="truncate font-medium text-[#111827]">{asset.type}</span>
                    </TableCell>
                    <TableCell className="text-[#4B5563]">{asset.category || "—"}</TableCell>
                    <TableCell className="text-center text-[#4B5563] whitespace-nowrap">
                      {formatAssetDateShort(
                        asset.purchaseDate || asset.depreciationStartDate || null,
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatSgd(books.cost)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatSgd(books.accDep)}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{formatSgd(books.nbv)}</TableCell>
                    <TableCell>
                      <span className="inline-flex rounded-full bg-[#DEF7EC] px-2.5 py-0.5 text-xs font-medium text-[#057A55]">
                        Active
                      </span>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setLocation(`/assets/${asset.id}/edit`)}>
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setLocation(`/assets/depreciation?assetId=${asset.id}`)}
                          >
                            Depreciation Schedule
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </ManagementTableContainer>
        {totalPages > 1 && (
          <ListPagination page={page} totalPages={totalPages} onPageChange={setPage} />
        )}
      </ManagementTableCard>
    </div>
  );
}
