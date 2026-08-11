/**
 * Offline verification: Tax Invoice reduces only selected warehouse.
 * Run: node --experimental-strip-types verify-invoice-stock-delta.ts
 */

type Key = string;
type Line = { warehouseId: number; stockItemId: number; qty: number };

function keyOf(warehouseId: number, stockItemId: number): Key {
  return `${warehouseId}:${stockItemId}`;
}

class InventorySim {
  balances = new Map<Key, number>();
  invoiceNet = new Map<number, Map<Key, number>>();

  seed(warehouseId: number, stockItemId: number, qty: number) {
    this.balances.set(keyOf(warehouseId, stockItemId), qty);
  }

  get(warehouseId: number, stockItemId: number) {
    return this.balances.get(keyOf(warehouseId, stockItemId)) ?? 0;
  }

  /**
   * Mirror production rules:
   * - Lock to already-issued warehouse for an item
   * - OUT when desired > net on that key
   * - PUT_BACK only same-warehouse qty down
   * - Never put-back orphan nets on other warehouses
   */
  syncInvoice(invoiceId: number, lines: Line[]) {
    const rawDesired = new Map<Key, number>();
    for (const line of lines) {
      const k = keyOf(line.warehouseId, line.stockItemId);
      rawDesired.set(k, (rawDesired.get(k) ?? 0) + line.qty);
    }

    const current = this.invoiceNet.get(invoiceId) ?? new Map<Key, number>();
    const issuedByItem = new Map<number, { warehouseId: number; qty: number }>();
    for (const [k, qty] of current.entries()) {
      if (qty <= 0) continue;
      const [wh, item] = k.split(":").map(Number);
      const prev = issuedByItem.get(item);
      if (!prev || qty > prev.qty) issuedByItem.set(item, { warehouseId: wh, qty });
    }

    const desired = new Map<Key, number>();
    for (const [k, qty] of rawDesired.entries()) {
      const [wh, item] = k.split(":").map(Number);
      const issued = issuedByItem.get(item);
      const lockedWh = issued ? issued.warehouseId : wh;
      const lk = keyOf(lockedWh, item);
      desired.set(lk, (desired.get(lk) ?? 0) + qty);
    }

    const keys = new Set([...desired.keys()]);
    for (const k of current.keys()) {
      if (desired.has(k)) keys.add(k);
    }

    for (const k of keys) {
      const desiredQty = desired.get(k) ?? 0;
      const currentQty = current.get(k) ?? 0;
      const delta = desiredQty - currentQty;
      if (Math.abs(delta) < 0.0005) continue;

      // Orphan net on non-desired warehouse: skip (no put-back to other WH)
      if (!desired.has(k) && currentQty > 0) continue;

      const [wh, item] = k.split(":").map(Number);
      const available = this.get(wh, item);
      if (delta > 0 && delta > available) {
        throw new Error(`Insufficient stock WH${wh} item${item}: avail ${available}, need ${delta}`);
      }
      this.balances.set(k, available - delta);
      if (desiredQty > 0.0005) current.set(k, desiredQty);
      else current.delete(k);
    }
    this.invoiceNet.set(invoiceId, current);
  }
}

function assertEq(label: string, actual: number, expected: number) {
  if (Math.abs(actual - expected) > 0.0005) {
    throw new Error(`FAIL ${label}: expected ${expected}, got ${actual}`);
  }
  console.log(`PASS ${label}: ${actual}`);
}

function run() {
  // Test 1 — Main only reduces; other WH untouched
  {
    const inv = new InventorySim();
    inv.seed(1, 10, 60);
    inv.seed(2, 10, 20);
    inv.syncInvoice(1, [{ warehouseId: 1, stockItemId: 10, qty: 20 }]);
    assertEq("Test1 Main", inv.get(1, 10), 40);
    assertEq("Test1 WH2 no add", inv.get(2, 10), 20);
  }

  // Test 2 — Idempotent
  {
    const inv = new InventorySim();
    inv.seed(1, 10, 100);
    inv.seed(2, 10, 20);
    inv.syncInvoice(1, [{ warehouseId: 1, stockItemId: 10, qty: 20 }]);
    inv.syncInvoice(1, [{ warehouseId: 1, stockItemId: 10, qty: 20 }]);
    inv.syncInvoice(1, [{ warehouseId: 1, stockItemId: 10, qty: 20 }]);
    assertEq("Test2 Main", inv.get(1, 10), 80);
    assertEq("Test2 WH2", inv.get(2, 10), 20);
  }

  // Test 3 — Qty up
  {
    const inv = new InventorySim();
    inv.seed(1, 10, 100);
    inv.syncInvoice(1, [{ warehouseId: 1, stockItemId: 10, qty: 20 }]);
    inv.syncInvoice(1, [{ warehouseId: 1, stockItemId: 10, qty: 30 }]);
    assertEq("Test3", inv.get(1, 10), 70);
  }

  // Test 4 — Qty down same WH put-back
  {
    const inv = new InventorySim();
    inv.seed(1, 10, 100);
    inv.seed(2, 10, 20);
    inv.syncInvoice(1, [{ warehouseId: 1, stockItemId: 10, qty: 30 }]);
    inv.syncInvoice(1, [{ warehouseId: 1, stockItemId: 10, qty: 20 }]);
    assertEq("Test4 Main", inv.get(1, 10), 80);
    assertEq("Test4 WH2 untouched", inv.get(2, 10), 20);
  }

  // Test 5 — Warehouse flip on form does NOT put-back to other WH
  {
    const inv = new InventorySim();
    inv.seed(1, 10, 60);
    inv.seed(2, 10, 40);
    inv.syncInvoice(1, [{ warehouseId: 1, stockItemId: 10, qty: 20 }]);
    // Form now sends warehouse 2 — stock stays locked to warehouse 1
    inv.syncInvoice(1, [{ warehouseId: 2, stockItemId: 10, qty: 20 }]);
    assertEq("Test5 Main stays reduced", inv.get(1, 10), 40);
    assertEq("Test5 WH2 NO +20", inv.get(2, 10), 40);
  }

  // Test 6 — User scenario
  {
    const inv = new InventorySim();
    inv.seed(1, 10, 60);
    inv.seed(2, 10, 20);
    inv.syncInvoice(1, [{ warehouseId: 1, stockItemId: 10, qty: 20 }]);
    assertEq("Test6 Main", inv.get(1, 10), 40);
    assertEq("Test6 Warehouse-1", inv.get(2, 10), 20);
  }

  console.log("\nAll invoice stock delta tests passed.");
}

run();
