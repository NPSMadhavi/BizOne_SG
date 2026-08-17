import { useEffect, useMemo, useState } from "react";

export const LIST_PAGE_SIZE = 12;

export function usePagination<T>(items: T[], pageSize = LIST_PAGE_SIZE) {
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  useEffect(() => {
    setPage(1);
  }, [items.length]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const paginatedItems = useMemo(
    () => items.slice((page - 1) * pageSize, page * pageSize),
    [items, page, pageSize],
  );

  return {
    page,
    setPage,
    pageSize,
    totalPages,
    paginatedItems,
    totalItems: items.length,
    resetPage: () => setPage(1),
  };
}
