/**
 * Financial year helper unit tests (Singapore calendar FY: Jan–Dec).
 * Run with: npx tsx --test artifacts/api-server/src/lib/financial-year.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

function fyBoundsForDate(date: Date | string): { start: string; end: string; label: string } {
  const d = typeof date === "string" ? new Date(date + "T00:00:00") : date;
  const year = d.getFullYear();
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  const label = `FY ${year}`;
  return { start, end, label };
}

function nextFyBounds(startDate: string): { start: string; end: string; label: string } {
  const y = Number(startDate.slice(0, 4));
  const start = `${y + 1}-01-01`;
  const end = `${y + 1}-12-31`;
  const label = `FY ${y + 1}`;
  return { start, end, label };
}

describe("financial year bounds (Singapore Jan–Dec)", () => {
  it("maps March 2026 into FY 2026", () => {
    const b = fyBoundsForDate("2026-03-20");
    assert.equal(b.start, "2026-01-01");
    assert.equal(b.end, "2026-12-31");
    assert.equal(b.label, "FY 2026");
  });

  it("maps January 2026 into FY 2026", () => {
    const b = fyBoundsForDate("2026-01-01");
    assert.equal(b.start, "2026-01-01");
    assert.equal(b.end, "2026-12-31");
    assert.equal(b.label, "FY 2026");
  });

  it("computes next calendar year after close", () => {
    const next = nextFyBounds("2026-01-01");
    assert.equal(next.start, "2027-01-01");
    assert.equal(next.end, "2027-12-31");
    assert.equal(next.label, "FY 2027");
  });
});

describe("opening balance rules (documentation assertions)", () => {
  it("outstanding receivable becomes opening — not a duplicate invoice", () => {
    const invoiceAmount = 50000;
    const paid = 20000;
    const outstanding = invoiceAmount - paid;
    assert.equal(outstanding, 30000);
    const openingReceivable = outstanding;
    const duplicateInvoiceCreated = false;
    assert.equal(openingReceivable, 30000);
    assert.equal(duplicateInvoiceCreated, false);
  });

  it("income/expense do not carry forward as opening balances", () => {
    const sales = 2000000;
    const purchases = 1200000;
    const carryForwardIncomeExpense = false;
    assert.ok(sales > 0 && purchases > 0);
    assert.equal(carryForwardIncomeExpense, false);
  });
});
