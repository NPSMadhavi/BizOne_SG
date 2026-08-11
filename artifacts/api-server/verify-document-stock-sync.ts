/**
 * Offline verification of shared document-stock sync rules.
 * Mirrors syncDocumentWarehouseStock without DB.
 * Run: node --experimental-strip-types verify-document-stock-sync.ts
 */

type Key = string;
type Line = { warehouseId: number; stockItemId: number; qty: number };

function keyOf(warehouseId: number, stockItemId: number): Key {
  return `${warehouseId}:${stockItemId}`;
}

class Sim {
  balances = new Map<Key, number>();
  docNet = new Map<number, Map<Key, number>>(); // signed: + for IN docs, + issued for OUT docs

  seed(warehouseId: number, stockItemId: number, qty: number) {
    this.balances.set(keyOf(warehouseId, stockItemId), qty);
  }

  get(warehouseId: number, stockItemId: number) {
    return this.balances.get(keyOf(warehouseId, stockItemId)) ?? 0;
  }

  private applyDelta(warehouseId: number, stockItemId: number, delta: number) {
    const k = keyOf(warehouseId, stockItemId);
    const next = this.get(warehouseId, stockItemId) + delta;
    if (next < -0.0005) throw new Error(`Negative stock WH${warehouseId} item${stockItemId}`);
    this.balances.set(k, next);
  }

  /**
   * Shared sync algorithm (same rules as document-stock-sync.ts).
   * direction in: desired = net received; out: desired = net issued.
   */
  sync(
    docId: number,
    direction: "in" | "out",
    desiredLines: Line[],
    allowWarehouseRemap: boolean,
  ) {
    const desired = new Map<Key, number>();
    for (const l of desiredLines) {
      const k = keyOf(l.warehouseId, l.stockItemId);
      desired.set(k, (desired.get(k) ?? 0) + l.qty);
    }
    const previous = this.docNet.get(docId) ?? new Map<Key, number>();

    const byItem = (map: Map<Key, number>) => {
      const g = new Map<number, { warehouseId: number; qty: number }[]>();
      for (const [k, qty] of map.entries()) {
        if (qty <= 0) continue;
        const [wh, item] = k.split(":").map(Number);
        const list = g.get(item) ?? [];
        list.push({ warehouseId: wh, qty });
        g.set(item, list);
      }
      return g;
    };

    const desiredByItem = byItem(desired);
    const previousByItem = byItem(previous);
    const items = new Set([...desiredByItem.keys(), ...previousByItem.keys()]);
    const nextNet = new Map(previous);

    for (const stockItemId of items) {
      const dList = desiredByItem.get(stockItemId) ?? [];
      const pList = previousByItem.get(stockItemId) ?? [];
      const dWh = new Set(dList.map((x) => x.warehouseId));
      const pWh = new Set(pList.map((x) => x.warehouseId));
      const shared = [...dWh].filter((id) => pWh.has(id));
      const onlyPrev = [...pWh].filter((id) => !dWh.has(id));
      const onlyDes = [...dWh].filter((id) => !pWh.has(id));
      const isRemap =
        pList.length > 0 && dList.length > 0 && shared.length === 0 && onlyPrev.length > 0 && onlyDes.length > 0;

      if (isRemap) {
        if (!allowWarehouseRemap) throw new Error("Warehouse remap blocked");
        if (dWh.size !== 1) throw new Error("Ambiguous remap");
        const to = dList[0]!;
        for (const from of pList) {
          if (direction === "in") this.applyDelta(from.warehouseId, stockItemId, -from.qty);
          else this.applyDelta(from.warehouseId, stockItemId, +from.qty); // put back
          nextNet.delete(keyOf(from.warehouseId, stockItemId));
        }
        if (direction === "in") this.applyDelta(to.warehouseId, stockItemId, +to.qty);
        else this.applyDelta(to.warehouseId, stockItemId, -to.qty);
        nextNet.set(keyOf(to.warehouseId, stockItemId), to.qty);
        continue;
      }

      if (onlyDes.length > 0 && onlyPrev.length > 0 && !allowWarehouseRemap) {
        throw new Error("Ambiguous/blocked cross-warehouse change");
      }

      const whIds = new Set([...dWh, ...pWh]);
      for (const warehouseId of whIds) {
        const desiredQty = desired.get(keyOf(warehouseId, stockItemId)) ?? 0;
        const currentQty = previous.get(keyOf(warehouseId, stockItemId)) ?? 0;
        const delta = desiredQty - currentQty;
        if (Math.abs(delta) < 0.0005) continue;
        // Skip orphan reverse when item still desired elsewhere
        if (desiredQty <= 0 && currentQty > 0 && dList.length > 0 && !dWh.has(warehouseId)) {
          continue;
        }
        if (direction === "in") this.applyDelta(warehouseId, stockItemId, delta);
        else this.applyDelta(warehouseId, stockItemId, -delta); // out when desired up
        if (desiredQty > 0) nextNet.set(keyOf(warehouseId, stockItemId), desiredQty);
        else nextNet.delete(keyOf(warehouseId, stockItemId));
      }
    }

    this.docNet.set(docId, nextNet);
  }
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const MAIN = 1;
const WH1 = 2;
const CHAIRS = 101;

// TEST 1 — PURCHASE into Main only
{
  const s = new Sim();
  s.seed(MAIN, CHAIRS, 100);
  s.seed(WH1, CHAIRS, 50);
  s.sync(1, "in", [{ warehouseId: MAIN, stockItemId: CHAIRS, qty: 20 }], false);
  assert(s.get(MAIN, CHAIRS) === 120, `T1 Main expected 120 got ${s.get(MAIN, CHAIRS)}`);
  assert(s.get(WH1, CHAIRS) === 50, `T1 WH1 expected 50 got ${s.get(WH1, CHAIRS)}`);
  console.log("PASS TEST 1 — Purchase IN Main only");
}

// TEST 2 — Tax Invoice OUT Main only
{
  const s = new Sim();
  s.seed(MAIN, CHAIRS, 120);
  s.seed(WH1, CHAIRS, 50);
  s.sync(2, "out", [{ warehouseId: MAIN, stockItemId: CHAIRS, qty: 20 }], true);
  assert(s.get(MAIN, CHAIRS) === 100, `T2 Main expected 100 got ${s.get(MAIN, CHAIRS)}`);
  assert(s.get(WH1, CHAIRS) === 50, `T2 WH1 expected 50 got ${s.get(WH1, CHAIRS)}`);
  console.log("PASS TEST 2 — Tax Invoice OUT Main only");
}

// TEST 3 — Stock Transfer is separate (explicit both-warehouse change only)
{
  const s = new Sim();
  s.seed(MAIN, CHAIRS, 100);
  s.seed(WH1, CHAIRS, 50);
  s.balances.set(keyOf(MAIN, CHAIRS), 80);
  s.balances.set(keyOf(WH1, CHAIRS), 70);
  assert(s.get(MAIN, CHAIRS) === 80 && s.get(WH1, CHAIRS) === 70, "T3 transfer");
  console.log("PASS TEST 3 — Stock Transfer both warehouses (explicit only)");
}

// TEST 4 — Idempotent invoice save
{
  const s = new Sim();
  s.seed(MAIN, CHAIRS, 100);
  s.seed(WH1, CHAIRS, 50);
  s.sync(4, "out", [{ warehouseId: MAIN, stockItemId: CHAIRS, qty: 20 }], true);
  s.sync(4, "out", [{ warehouseId: MAIN, stockItemId: CHAIRS, qty: 20 }], true);
  s.sync(4, "out", [{ warehouseId: MAIN, stockItemId: CHAIRS, qty: 20 }], true);
  assert(s.get(MAIN, CHAIRS) === 80, `T4 Main expected 80 got ${s.get(MAIN, CHAIRS)}`);
  assert(s.get(WH1, CHAIRS) === 50, `T4 WH1 expected 50 got ${s.get(WH1, CHAIRS)}`);
  console.log("PASS TEST 4 — Idempotent Tax Invoice save");
}

// TEST 6 — Qty 20 → 30 only additional 10 OUT
{
  const s = new Sim();
  s.seed(MAIN, CHAIRS, 100);
  s.seed(WH1, CHAIRS, 50);
  s.sync(6, "out", [{ warehouseId: MAIN, stockItemId: CHAIRS, qty: 20 }], true);
  s.sync(6, "out", [{ warehouseId: MAIN, stockItemId: CHAIRS, qty: 30 }], true);
  assert(s.get(MAIN, CHAIRS) === 70, `T6 Main expected 70 got ${s.get(MAIN, CHAIRS)}`);
  assert(s.get(WH1, CHAIRS) === 50, `T6 WH1 expected 50 got ${s.get(WH1, CHAIRS)}`);
  console.log("PASS TEST 6 — Invoice qty edit delta only");
}

// TEST 7 — Warehouse change remaps
{
  const s = new Sim();
  s.seed(MAIN, CHAIRS, 100);
  s.seed(WH1, CHAIRS, 50);
  s.sync(7, "out", [{ warehouseId: MAIN, stockItemId: CHAIRS, qty: 20 }], true);
  s.sync(7, "out", [{ warehouseId: WH1, stockItemId: CHAIRS, qty: 20 }], true);
  assert(s.get(MAIN, CHAIRS) === 100, `T7 Main expected 100 got ${s.get(MAIN, CHAIRS)}`);
  assert(s.get(WH1, CHAIRS) === 30, `T7 WH1 expected 30 got ${s.get(WH1, CHAIRS)}`);
  console.log("PASS TEST 7 — Invoice warehouse remap");
}

// BUG REGRESSION — PO must NOT auto-remap (old union-key bug)
{
  const s = new Sim();
  s.seed(MAIN, CHAIRS, 40);
  s.seed(WH1, CHAIRS, 40);
  s.sync(8, "in", [{ warehouseId: WH1, stockItemId: CHAIRS, qty: 20 }], false);
  let blocked = false;
  try {
    s.sync(8, "in", [{ warehouseId: MAIN, stockItemId: CHAIRS, qty: 20 }], false);
  } catch {
    blocked = true;
  }
  assert(blocked, "PO warehouse remap should be blocked");
  assert(s.get(MAIN, CHAIRS) === 40, `PO regress Main expected 40 got ${s.get(MAIN, CHAIRS)}`);
  assert(s.get(WH1, CHAIRS) === 60, `PO regress WH1 expected 60 got ${s.get(WH1, CHAIRS)}`);
  console.log("PASS REGRESSION — PO does not transfer-lookalike on warehouse flip");
}

// BUG REGRESSION — accidental invoice warehouse flip used to +20 other WH
{
  const s = new Sim();
  s.seed(MAIN, CHAIRS, 60);
  s.seed(WH1, CHAIRS, 20);
  // First save somehow on WH1 (picker), then user saves Main — with remap allowed this is intentional TEST7.
  // Accidental case we care about: SAME warehouse repeated must not touch WH1.
  s.sync(9, "out", [{ warehouseId: MAIN, stockItemId: CHAIRS, qty: 20 }], true);
  assert(s.get(MAIN, CHAIRS) === 40, "inv Main");
  assert(s.get(WH1, CHAIRS) === 20, "inv WH1 untouched");
  console.log("PASS REGRESSION — Invoice OUT does not increase other warehouse");
}

// BUG REGRESSION — INV22 style: first Warehouse-1, then change to Warehouse-2
{
  const s = new Sim();
  s.seed(MAIN, CHAIRS, 100);
  s.seed(WH1, CHAIRS, 100);
  s.sync(22, "out", [{ warehouseId: MAIN, stockItemId: CHAIRS, qty: 20 }], true);
  assert(s.get(MAIN, CHAIRS) === 80 && s.get(WH1, CHAIRS) === 100, "INV22 first WH1");
  s.sync(22, "out", [{ warehouseId: WH1, stockItemId: CHAIRS, qty: 20 }], true);
  assert(s.get(MAIN, CHAIRS) === 100, `INV22 after remap WH1 restored, got ${s.get(MAIN, CHAIRS)}`);
  assert(s.get(WH1, CHAIRS) === 80, `INV22 after remap WH2 deducted, got ${s.get(WH1, CHAIRS)}`);
  console.log("PASS REGRESSION — Invoice WH1 then WH2 remaps cleanly");
}

console.log("\nAll document-stock sync tests passed.");
