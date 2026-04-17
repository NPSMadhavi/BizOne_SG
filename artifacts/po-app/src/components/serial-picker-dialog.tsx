import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

interface Serial {
  id: number;
  serialNumber: string;
  status: string;
  grnNumber?: string;
}

interface SerialPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partNumber: string;
  currentSelected: string[];
  onConfirm: (selected: string[]) => void;
}

export function SerialPickerDialog({ open, onOpenChange, partNumber, currentSelected, onConfirm }: SerialPickerDialogProps) {
  const [serials, setSerials] = useState<Serial[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set(currentSelected));
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    setSelected(new Set(currentSelected));
    setSearch("");
    setLoading(true);
    fetch("/api/stock-serials?status=available", { credentials: "include" })
      .then(r => r.json())
      .then((data: Serial[]) => {
        setSerials(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [open]);

  const filtered = serials.filter(s => {
    const matchesSearch = !search || s.serialNumber.toLowerCase().includes(search.toLowerCase());
    return matchesSearch;
  });

  const toggle = (sn: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(sn)) next.delete(sn);
      else next.add(sn);
      return next;
    });
  };

  const handleConfirm = () => {
    onConfirm(Array.from(selected));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Select Serials
            {partNumber && <span className="ml-2 text-sm font-normal text-muted-foreground">for {partNumber}</span>}
          </DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9 h-8"
            placeholder="Search serial numbers..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            {serials.length === 0 ? "No available serials found." : "No serials match your search."}
          </p>
        ) : (
          <div className="max-h-64 overflow-y-auto space-y-1 border rounded-md p-2">
            {filtered.map(s => (
              <label key={s.id} className="flex items-center gap-3 px-2 py-1.5 rounded cursor-pointer hover:bg-muted/50">
                <Checkbox
                  checked={selected.has(s.serialNumber)}
                  onCheckedChange={() => toggle(s.serialNumber)}
                />
                <span className="text-sm font-mono flex-1">{s.serialNumber}</span>
                {s.grnNumber && (
                  <Badge variant="outline" className="text-xs">{s.grnNumber}</Badge>
                )}
              </label>
            ))}
          </div>
        )}

        <div className="text-xs text-muted-foreground">
          {selected.size} serial{selected.size !== 1 ? "s" : ""} selected
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleConfirm}>Confirm ({selected.size})</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
