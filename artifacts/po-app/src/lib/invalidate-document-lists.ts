import type { QueryClient } from "@tanstack/react-query";
import {
  getListInvoicesQueryKey,
  getListPurchaseOrdersQueryKey,
  getListQuotationsQueryKey,
  getListDeliveryOrdersQueryKey,
} from "@workspace/api-client-react";

export type DocumentListKind =
  | "invoices"
  | "purchase-orders"
  | "quotations"
  | "delivery-orders"
  | "proforma-invoices"
  | "credit-notes"
  | "debit-notes"
  | "grn";

const QUERY_KEYS: Record<DocumentListKind, readonly unknown[]> = {
  invoices: getListInvoicesQueryKey(),
  "purchase-orders": getListPurchaseOrdersQueryKey(),
  quotations: getListQuotationsQueryKey(),
  "delivery-orders": getListDeliveryOrdersQueryKey(),
  "proforma-invoices": ["/api/proforma-invoices"],
  "credit-notes": ["/api/credit-notes"],
  "debit-notes": ["/api/debit-notes"],
  grn: ["grns"],
};

/** Invalidate the list cache for a document module after create/update/delete. */
export function invalidateDocumentList(
  queryClient: QueryClient,
  kind: DocumentListKind,
): void {
  const key = QUERY_KEYS[kind];
  if (key) {
    void queryClient.invalidateQueries({ queryKey: key });
  }
}
