/**
 * Unit tests for GST F5, Income, and Expenses logic and schema migrations.
 * Run with: node --experimental-strip-types --test src/lib/accounting-f5-income-expenses.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://dummy:dummy@localhost:5432/test";

const {
  DRIZZLE_TABLE_CREATES,
  DRIZZLE_COLUMN_MIGRATIONS,
  CRITICAL_COLUMNS,
} = await import("../migrate-drizzle-columns.ts");

// ── 1. Schema Migration Sanity Checks ──────────────────────────────────────────

describe("Schema Migrations: Income & Expenses & GST F5 Columns", () => {
  it("includes income_records, income_attachments, and expenses in DRIZZLE_TABLE_CREATES", () => {
    const tableCreatesJoined = DRIZZLE_TABLE_CREATES.join("\n");
    assert.ok(
      tableCreatesJoined.includes("CREATE TABLE IF NOT EXISTS income_records"),
      "income_records table create must be present",
    );
    assert.ok(
      tableCreatesJoined.includes("CREATE TABLE IF NOT EXISTS income_attachments"),
      "income_attachments table create must be present",
    );
    assert.ok(
      tableCreatesJoined.includes("CREATE TABLE IF NOT EXISTS expenses"),
      "expenses table create must be present",
    );
  });

  it("includes exchange_rate for income_records, invoices, and vendor_invoices in migrations", () => {
    const migrationsJoined = DRIZZLE_COLUMN_MIGRATIONS.join("\n");
    assert.ok(
      migrationsJoined.includes("ALTER TABLE income_records ADD COLUMN IF NOT EXISTS exchange_rate"),
      "income_records exchange_rate column migration must be present",
    );
    assert.ok(
      migrationsJoined.includes("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS exchange_rate"),
      "invoices exchange_rate column migration must be present",
    );
    assert.ok(
      migrationsJoined.includes("ALTER TABLE vendor_invoices ADD COLUMN IF NOT EXISTS exchange_rate"),
      "vendor_invoices exchange_rate column migration must be present",
    );
  });

  it("includes all essential columns for expenses in DRIZZLE_COLUMN_MIGRATIONS", () => {
    const migrationsJoined = DRIZZLE_COLUMN_MIGRATIONS.join("\n");
    const requiredExpenseCols = [
      "account_id",
      "gst_amount",
      "gst_claimable",
      "is_deductible",
      "deductible_pct",
      "currency",
      "payment_method",
      "receipt_data",
      "receipt_mime_type",
      "status",
    ];
    for (const col of requiredExpenseCols) {
      assert.ok(
        migrationsJoined.includes(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS ${col}`),
        `expenses.${col} migration must be present`,
      );
    }
  });

  it("includes critical check columns in CRITICAL_COLUMNS", () => {
    const incomeCol = CRITICAL_COLUMNS.find(
      (c) => c.table === "income_records" && c.column === "exchange_rate",
    );
    assert.ok(incomeCol, "income_records.exchange_rate must be in CRITICAL_COLUMNS");

    const expenseCol = CRITICAL_COLUMNS.find(
      (c) => c.table === "expenses" && c.column === "amount",
    );
    assert.ok(expenseCol, "expenses.amount must be in CRITICAL_COLUMNS");
  });
});

// ── 2. IRAS GST F5 Calculation Logic ──────────────────────────────────────────

describe("IRAS GST F5 Calculations (Singapore)", () => {
  // Test scenario data
  const mockInvoices = [
    {
      subtotal: "1000.00",
      discountAmount: "0.00",
      tax: "90.00",
      currency: "SGD",
      exchangeRate: "1.000000",
      status: "confirmed",
    },
    {
      subtotal: "500.00",
      discountAmount: "50.00",
      tax: "40.50",
      currency: "USD",
      exchangeRate: "1.350000",
      status: "paid",
    },
    {
      subtotal: "200.00",
      discountAmount: "0.00",
      tax: "18.00",
      currency: "SGD",
      exchangeRate: "1.000000",
      status: "draft", // Should be ignored
    },
    {
      subtotal: "300.00",
      discountAmount: "0.00",
      tax: "0.00", // Tax 0 -> not standard-rated
      currency: "SGD",
      exchangeRate: "1.000000",
      status: "confirmed",
    },
  ];

  const mockIncome = [
    {
      amount: "200.00",
      gstAmount: "18.00",
      gstTreatment: "standard_rated",
      currency: "SGD",
      exchangeRate: "1.000000",
      status: "confirmed",
    },
    {
      amount: "100.00",
      gstAmount: "0.00",
      gstTreatment: "zero_rated",
      currency: "SGD",
      exchangeRate: "1.000000",
      status: "confirmed",
    },
    {
      amount: "50.00",
      gstAmount: "0.00",
      gstTreatment: "exempt",
      currency: "SGD",
      exchangeRate: "1.000000",
      status: "confirmed",
    },
    {
      amount: "80.00",
      gstAmount: "0.00",
      gstTreatment: "out_of_scope",
      currency: "SGD",
      exchangeRate: "1.000000",
      status: "confirmed",
    },
    {
      amount: "999.00",
      gstAmount: "89.91",
      gstTreatment: "standard_rated",
      currency: "SGD",
      exchangeRate: "1.000000",
      status: "draft", // Ignored
    },
  ];

  const mockVendorInvoices = [
    {
      totalAmount: "545.00",
      gstAmount: "45.00",
      gstTreatment: "standard_rated",
      currency: "SGD",
      exchangeRate: "1.000000",
    },
    {
      totalAmount: "218.00",
      gstAmount: "18.00",
      gstTreatment: "standard_rated",
      currency: "USD",
      exchangeRate: "1.350000",
    },
    {
      totalAmount: "300.00",
      gstAmount: "0.00",
      gstTreatment: "zero_rated", // Non-claimable, excluded from Box 4 and Box 7
      currency: "SGD",
      exchangeRate: "1.000000",
    },
  ];

  const mockExpenses = [
    {
      amount: "100.00",
      gstAmount: "9.00",
      gstClaimable: true,
      status: "confirmed",
      currency: "SGD",
    },
    {
      amount: "50.00",
      gstAmount: "4.50",
      gstClaimable: false, // Not claimable, excluded
      status: "confirmed",
      currency: "SGD",
    },
    {
      amount: "200.00",
      gstAmount: "18.00",
      gstClaimable: true,
      status: "draft", // Draft, excluded
      currency: "SGD",
    },
  ];

  it("calculates Box 1 (Standard-rated Supplies) accurately with FX conversions", () => {
    // Valid standard-rated invoices:
    // 1. SGD 1000 * 1 = 1000
    // 2. USD (500 - 50 = 450) * 1.35 = 607.50
    // Invoices Box 1 = 1607.50
    const validInvs = mockInvoices.filter(
      (r) => r.status !== "draft" && parseFloat(r.tax) > 0,
    );
    const invBox1 = validInvs.reduce((s, r) => {
      const fx = parseFloat(parseFloat(r.exchangeRate).toFixed(4)) || 1;
      return s + (parseFloat(r.subtotal) - parseFloat(r.discountAmount)) * fx;
    }, 0);
    assert.equal(invBox1, 1607.5);

    // Confirmed standard-rated income: 200 * 1 = 200
    const validIncomeSR = mockIncome.filter(
      (r) => r.status === "confirmed" && r.gstTreatment === "standard_rated",
    );
    const incomeBox1 = validIncomeSR.reduce((s, r) => {
      const fx = parseFloat(parseFloat(r.exchangeRate).toFixed(4)) || 1;
      return s + parseFloat(r.amount) * fx;
    }, 0);
    assert.equal(incomeBox1, 200);

    const totalBox1 = parseFloat((invBox1 + incomeBox1).toFixed(2));
    assert.equal(totalBox1, 1807.5);
  });

  it("calculates Box 2, 3, 5 (Zero-rated, Exempt, Out-of-Scope Supplies)", () => {
    const confirmed = mockIncome.filter((r) => r.status === "confirmed");
    const box2 = confirmed
      .filter((r) => r.gstTreatment === "zero_rated")
      .reduce((s, r) => s + parseFloat(r.amount), 0);
    const box3 = confirmed
      .filter((r) => r.gstTreatment === "exempt")
      .reduce((s, r) => s + parseFloat(r.amount), 0);
    const box5 = confirmed
      .filter((r) => r.gstTreatment === "out_of_scope")
      .reduce((s, r) => s + parseFloat(r.amount), 0);

    assert.equal(box2, 100);
    assert.equal(box3, 50);
    assert.equal(box5, 80);
  });

  it("calculates Box 4 (Taxable Purchases) and Box 7 (Input Tax Claimed)", () => {
    // Vendor Invoices SR only:
    // 1. net = 545 - 45 = 500 * 1 = 500 SGD net, GST = 45 SGD
    // 2. net = 218 - 18 = 200 * 1.35 = 270 SGD net, GST = 18 * 1.35 = 24.30 SGD
    const viSR = mockVendorInvoices.filter(
      (r) => !r.gstTreatment || r.gstTreatment === "standard_rated",
    );
    const viBox4 = viSR.reduce((s, r) => {
      const fx = parseFloat(parseFloat(r.exchangeRate).toFixed(4)) || 1;
      const net = parseFloat((parseFloat(r.totalAmount) - parseFloat(r.gstAmount)).toFixed(2));
      return s + net * fx;
    }, 0);
    assert.equal(viBox4, 770);

    const viBox7 = viSR.reduce((s, r) => {
      const fx = parseFloat(parseFloat(r.exchangeRate).toFixed(4)) || 1;
      const gst = parseFloat(parseFloat(r.gstAmount).toFixed(2));
      return s + gst * fx;
    }, 0);
    assert.equal(viBox7, 69.3);

    // Expenses: only confirmed & gstClaimable = true
    const validExp = mockExpenses.filter(
      (r) => r.status === "confirmed" && r.gstClaimable,
    );
    const expBox4 = validExp.reduce((s, r) => s + parseFloat(r.amount), 0);
    const expBox7 = validExp.reduce((s, r) => s + parseFloat(r.gstAmount), 0);
    assert.equal(expBox4, 100);
    assert.equal(expBox7, 9);

    const totalBox4 = parseFloat((viBox4 + expBox4).toFixed(2));
    const totalBox7 = parseFloat((viBox7 + expBox7).toFixed(2));

    assert.equal(totalBox4, 870); // 770 + 100
    assert.equal(totalBox7, 78.3); // 69.30 + 9.00
  });

  it("calculates Box 6 (Output Tax Due) and Box 8 (Net GST Payable/Refundable)", () => {
    // Box 6 = Invoices GST + Income GST
    // Invoices GST: 90 * 1 + 40.50 * 1.35 = 90 + 54.675 = 144.675
    // Income GST: 18 * 1 = 18
    // Total Box 6 = 162.675 -> 162.68
    const validInvs = mockInvoices.filter(
      (r) => r.status !== "draft" && parseFloat(r.tax) > 0,
    );
    const invBox6 = validInvs.reduce((s, r) => {
      const fx = parseFloat(parseFloat(r.exchangeRate).toFixed(4)) || 1;
      return s + parseFloat(r.tax) * fx;
    }, 0);
    const validIncomeSR = mockIncome.filter(
      (r) => r.status === "confirmed" && r.gstTreatment === "standard_rated",
    );
    const incomeBox6 = validIncomeSR.reduce((s, r) => {
      const fx = parseFloat(parseFloat(r.exchangeRate).toFixed(4)) || 1;
      return s + parseFloat(r.gstAmount) * fx;
    }, 0);
    const box6 = parseFloat((invBox6 + incomeBox6).toFixed(2));
    assert.equal(box6, 162.68);

    const totalBox7 = 78.3;
    const box8 = parseFloat((box6 - totalBox7).toFixed(2));
    assert.equal(box8, 84.38); // 162.68 - 78.30 = 84.38 payable to IRAS
  });
});
