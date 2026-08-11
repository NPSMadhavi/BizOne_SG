import { db, purchaseOrdersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { postPurchaseOrderWarehouseStock } from "./src/routes/grn.ts";

const [po] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, 11));
if (!po) {
  console.error("PO 11 not found");
  process.exit(1);
}
console.log("PO11 before:", JSON.stringify({
  id: po.id,
  poNumber: po.poNumber,
  status: po.status,
  items: (po.items as any[])?.map((i: any) => ({
    partNumber: i.partNumber,
    qty: i.qty,
    isStockItem: i.isStockItem,
    warehouseStockPosted: i.warehouseStockPosted,
    stockItemId: i.stockItemId,
  })),
}, null, 2));

const result = await postPurchaseOrderWarehouseStock({ po, userId: 1, username: "verify" });
console.log("PO11 post result items:", JSON.stringify(result.items, null, 2));
process.exit(0);
