import { useMemo, useState } from "react";

export function defaultIsSendable(doc: { status?: string }) {
  const status = (doc.status || "").toLowerCase();
  return status !== "cancelled" && status !== "void";
}

export function useBulkPartyEmail<T extends { id: number }>(opts: {
  allDocs: T[];
  dateFiltered: T[];
  getPartyName: (doc: any) => string;
  isSendable?: (doc: T) => boolean;
}) {
  const { allDocs, dateFiltered, getPartyName } = opts;
  const isSendable = opts.isSendable ?? ((d: T) => defaultIsSendable(d as { status?: string }));

  const [partyFilter, setPartyFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [emailOpen, setEmailOpen] = useState(false);

  const partyNames = useMemo(() => {
    const names = new Set(allDocs.map(d => (getPartyName(d) || "").trim()).filter(Boolean));
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [allDocs, getPartyName]);

  const matchesParty = (doc: T) => partyFilter === "all" || getPartyName(doc) === partyFilter;

  const onPartyChange = (value: string) => {
    setPartyFilter(value);
    if (value === "all") {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(
      dateFiltered.filter(d => getPartyName(d) === value && isSendable(d)).map(d => d.id)
    ));
  };

  const selectedDocs = useMemo(
    () => allDocs.filter(d => selectedIds.has(d.id) && isSendable(d)),
    [allDocs, selectedIds, isSendable],
  );

  const toggleSelectAll = (rows: T[], checked: boolean | "indeterminate") => {
    if (checked) setSelectedIds(new Set(rows.filter(isSendable).map(d => d.id)));
    else setSelectedIds(new Set());
  };

  const toggleRow = (id: number, checked: boolean | "indeterminate") => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const selectionState = (rows: T[]) => {
    const sendable = rows.filter(isSendable);
    const allSelected = sendable.length > 0 && sendable.every(d => selectedIds.has(d.id));
    const someSelected = sendable.some(d => selectedIds.has(d.id));
    return { sendable, allSelected, someSelected };
  };

  return {
    partyFilter,
    partyNames,
    onPartyChange,
    matchesParty,
    selectedIds,
    selectedDocs,
    setSelectedIds,
    emailOpen,
    setEmailOpen,
    toggleSelectAll,
    toggleRow,
    isSendable,
    selectionState,
  };
}
