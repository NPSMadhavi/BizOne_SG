/**
 * Offline verification of invoice stock delta rules (Tests 1–10 math).
 * Run: node verify-invoice-stock-delta.js
 */

function keyOf(warehouseId, stockItemId) {
  return `${warehouseId}:${stockItemId}`;
}

class InventorySim {
  constructor() {
    this.balances = new Map();
    this.invoiceNet = new Map();
  }

  seed(warehouseId, stockItemId, qty) {
    this.balances.set(keyOf(warehouseId, stockItemId), qty);
  }

  get(warehouseId, stockItemId) {
    return this.balances.get(keyOf(warehouseId, stockItemId)) ?? 0;
  }

  syncInvoice(invoiceId, lines) {
    const desired = new Map();
    for (const line of lines) {
      const k = keyOf(line.warehouseId, line.stockItemId);
      desired.set(k, (desired.get(k) ?? 0) + line.qty);
    }
    const current = this.invoiceNet.get(invoiceId) ?? new Map();
    const keys = new Set([...current.keys(), ...desired.keys()]);

    for (const k of keys) {
      const currentQty = current.get(k) ?? 0;
      const desiredQty = desired.get(k) ?? 0;
      const delta = desiredQty - currentQty;
      if (Math.abs(delta) < 0.0005) continue;

      const [wh, item] = k.split(":").map(Number);
      const available = this.get(wh, item);
      if (delta > 0 && delta > available) {
        throw new Error(`Insufficient stock WH${wh} item${item}: avail ${available}, need ${delta}`);
      }
      this.balances.set(k, available - delta);
      current.set(k, desiredQty);
    }
    this.invoiceNet.set(invoiceId, current);
  }
}

function assertEq(label, actual, expected) {
  if (Math.abs(actual - expected) > 0.0005) {
    throw new Error(`FAIL ${label}: expected ${expected}, got ${actual}`);
  }
  console.log(`PASS ${label}: ${actual}`);
}

function run() {
  {
    const inv = new InventorySim();
    inv.seed(1, 10, 100);
    inv.syncInvoice(1, [{ warehouseId: 1, stockItemId: 10, qty: 20 }]);
    assertEq("Test1 stock after invoice 20", inv.get(1, 10), 80);
  }

  {
    const inv = new InventorySim();
    inv.seed(1, 10, 100);
    inv.syncInvoice(1, [{ warehouseId: 1, stockItemId: 10, qty: 20 }]);
    inv.syncInvoice(1, [{ warehouseId: 1, stockItemId: 10, qty: 20 }]);
    inv.syncInvoice(1, [{ warehouseId: 1, stockItemId: 10, qty: 20 }]);
    assertEq("Test2/3 idempotent re-sync", inv.get(1, 10), 80);
  }

  {
    const inv = new InventorySim();
    inv.seed(1, 10, 100);
    inv.syncInvoice(1, [{ warehouseId: 1, stockItemId: 10, qty: 20 }]);
    inv.syncInvoice(1, [{ warehouseId: 1, stockItemId: 10, qty: 30 }]);
    assertEq("Test4 edit to 30", inv.get(1, 10), 70);
  }

  {
    const inv = new InventorySim();
    inv.seed(1, 10, 100);
    inv.syncInvoice(1, [{ warehouseId: 1, stockItemId: 10, qty: 30 }]);
    inv.syncInvoice(1, [{ warehouseId: 1, stockItemId: 10, qty: 20 }]);
    assertEq("Test5 edit to 20", inv.get(1, 10), 80);
  }

  {
    const inv = new InventorySim();
    inv.seed(1, 10, 100);
    inv.seed(1, 20, 100);
    inv.syncInvoice(1, [{ warehouseId: 1, stockItemId: 10, qty: 20 }]);
    inv.syncInvoice(1, [{ warehouseId: 1, stockItemId: 20, qty: 20 }]);
    assertEq("Test6 product A restored", inv.get(1, 10), 100);
    assertEq("Test6 product B deducted", inv.get(1, 20), 80);
  }

  {
    const inv = new InventorySim();
    inv.seed(1, 10, 100);
    inv.seed(2, 10, 100);
    inv.syncInvoice(1, [{ warehouseId: 1, stockItemId: 10, qty: 20 }]);
    inv.syncInvoice(1, [{ warehouseId: 2, stockItemId: 10, qty: 20 }]);
    assertEq("Test7 WH A restored", inv.get(1, 10), 100);
    assertEq("Test7 WH B deducted", inv.get(2, 10), 80);
  }

  {
    const inv = new InventorySim();
    inv.seed(1, 10, 100);
    inv.seed(1, 20, 100);
    inv.syncInvoice(1, [
      { warehouseId: 1, stockItemId: 10, qty: 10 },
      { warehouseId: 1, stockItemId: 20, qty: 25 },
    ]);
    assertEq("Test8 A", inv.get(1, 10), 90);
    assertEq("Test8 B", inv.get(1, 20), 75);
  }

  {
    const inv = new InventorySim();
    inv.seed(1, 10, 100);
    inv.seed(2, 10, 100);
    inv.syncInvoice(1, [{ warehouseId: 1, stockItemId: 10, qty: 15 }]);
    assertEq("Test9 only WH1 reduced", inv.get(1, 10), 85);
    assertEq("Test9 WH2 untouched", inv.get(2, 10), 100);
  }

  {
    const inv = new InventorySim();
    inv.seed(1, 10, 100);
    inv.syncInvoice(1, [{ warehouseId: 1, stockItemId: 10, qty: 30 }]);
    assertEq("Test10 transfer availability", inv.get(1, 10), 70);
  }

  console.log("\nAll invoice stock delta tests passed.");
}

run();
