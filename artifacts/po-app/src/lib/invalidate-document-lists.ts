import type { QueryClient } from "@tanstack/react-query";
import {
  getListInvoicesQueryKey,
  getListPurchaseQuotationsQueryKey,
  getListPurchaseOrdersQueryKey,
  getListQuotationsQueryKey,
  getListDeliveryOrdersQueryKey,
  getListSalesOrdersQueryKey,
} from "@workspace/api-client-react";

export type DocumentListKind =
  | "invoices"
  | "purchase-quotations"
  | "purchase-orders"
  | "quotations"
  | "sales-orders"
  | "delivery-orders"
  | "proforma-invoices"
  | "credit-notes"
  | "debit-notes"
  | "grn";

const QUERY_KEYS: Record<DocumentListKind, readonly unknown[]> = {
  invoices: getListInvoicesQueryKey(),
  "purchase-quotations": getListPurchaseQuotationsQueryKey(),
  "purchase-orders": getListPurchaseOrdersQueryKey(),
  quotations: getListQuotationsQueryKey(),
  "sales-orders": getListSalesOrdersQueryKey(),
  "delivery-orders": getListDeliveryOrdersQueryKey(),
  "proforma-invoices": ["proforma-invoices"],
  "credit-notes": ["credit-notes"],
  "debit-notes": ["debit-notes"],
  grn: ["grns"],
};

/** Invalidate the list cache for a document module after create/update/delete. */
export function invalidateDocumentList(
  queryClient: QueryClient,
  kind: DocumentListKind,
): Promise<void> {
  const key = QUERY_KEYS[kind];
  if (!key) return Promise.resolve();
  return queryClient.invalidateQueries({ queryKey: key }).then(() => undefined);
}
