import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Serial {
  id: number;
  serialNumber: string;
  status: string;
  grnNumber?: string;
  invoiceNumber?: string;
  reservedByUser?: string;
}

interface SerialPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partNumber: string;
  currentSelected: string[];
  currentSelectedIds?: number[];
  onConfirm: (selected: string[], selectedIds: number[]) => void;
}

export function SerialPickerDialog({
  open,
  onOpenChange,
  partNumber,
  currentSelected,
  currentSelectedIds = [],
  onConfirm,
}: SerialPickerDialogProps) {
  const [serials, setSerials] = useState<Serial[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set(currentSelectedIds));
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open || !partNumber) return;
    setSelected(new Set(currentSelectedIds));
    setSearch("");
    setLoading(true);
    fetch(`/api/stock-serials?partNumber=${encodeURIComponent(partNumber)}`, { credentials: "include" })
      .then(r => r.json())
      .then((data: Serial[]) => {
        setSerials(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [open, partNumber]);

  const filtered = serials.filter(s =>
    !search || s.serialNumber.toLowerCase().includes(search.toLowerCase())
  );

  const toggle = (id: number, status: string) => {
    if (status === "reserved" && !selected.has(id)) return;
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirm = () => {
    const chosenSerials = serials.filter(s => selected.has(s.id));
    onConfirm(chosenSerials.map(s => s.serialNumber), chosenSerials.map(s => s.id));
    onOpenChange(false);
  };

  const availableCount = serials.filter(s => s.status === "available" || selected.has(s.id)).length;
  const allSelected = filtered.filter(s => s.status === "available" || selected.has(s.id)).every(s => selected.has(s.id));

  function selectAll() {
    const selectableIds = filtered.filter(s => s.status === "available" || selected.has(s.id)).map(s => s.id);
    setSelected(new Set(selectableIds));
  }

  function selectNone() {
    setSelected(new Set());
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Select Serials
            {partNumber && <span className="ml-2 text-sm font-normal text-muted-foreground">for {partNumber}</span>}
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9 h-9"
              placeholder="Search serial numbers..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          {serials.length > 0 && (
            <button
              type="button"
              className="text-xs text-primary hover:underline shrink-0"
              onClick={allSelected ? selectNone : selectAll}
            >
              {allSelected ? "Deselect All" : "Select All"}
            </button>
          )}
        </div>

        <div className="text-xs text-muted-foreground">
          {selected.size} selected · {availableCount} available · {serials.filter(s => s.status === "reserved" && !selected.has(s.id)).length} reserved by others
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            {serials.length === 0 ? "No serials found." : "No serials match your search."}
          </p>
        ) : (
          <div className="border rounded-md overflow-hidden max-h-72 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Serial Number</TableHead>
                  <TableHead className="w-28">GRN #</TableHead>
                  <TableHead className="w-48">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(s => {
                  const isReservedByOther = s.status === "reserved" && !selected.has(s.id);
                  const isSelectable = s.status === "available" || selected.has(s.id);
                  return (
                    <TableRow
                      key={s.id}
                      className={isReservedByOther ? "opacity-60 bg-muted/20" : "cursor-pointer hover:bg-muted/50"}
                      onClick={() => toggle(s.id, s.status)}
                    >
                      <TableCell>
                        {isReservedByOther ? (
                          <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : (
                          <Checkbox
                            checked={selected.has(s.id)}
                            onCheckedChange={() => toggle(s.id, s.status)}
                            onClick={e => e.stopPropagation()}
                          />
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-sm">{s.serialNumber}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{s.grnNumber || "—"}</TableCell>
                      <TableCell>
                        {isReservedByOther ? (
                          <div>
                            <Badge variant="secondary" className="text-xs mb-0.5">Reserved</Badge>
                            <div className="text-xs text-muted-foreground leading-tight">
                              {s.invoiceNumber && <span>for {s.invoiceNumber}</span>}
                              {s.reservedByUser && <span className="ml-1">by {s.reservedByUser}</span>}
                            </div>
                          </div>
                        ) : selected.has(s.id) ? (
                          <Badge variant="default" className="text-xs">Selected</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs text-green-600 border-green-300">Available</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleConfirm}>Confirm ({selected.size})</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
