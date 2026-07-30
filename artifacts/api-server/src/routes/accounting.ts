import { Router, type IRouter } from "express";
import { db, accountsTable, journalEntriesTable, journalLinesTable, companiesTable, invoicesTable, vendorInvoicesTable, vendorsTable, settingsTable, invoicePaymentsTable, vendorPaymentsTable, customerDepositsTable, expensesTable, incomeRecordsTable } from "@workspace/db";
import { eq, and, desc, sql, asc } from "drizzle-orm";
import { logAudit } from "../lib/audit.js";
import { DEFAULT_ACCOUNTS, ensureAccountsSeeded } from "../lib/accounts-seed.js";
import { getExchangeRateToSGD } from "../lib/exchange-rate.js";

const router: IRouter = Router();

function requireAuth(req: any, res: any): boolean {
  if (!req.session.userId) { res.status(401).json({ error: "Not authenticated" }); return false; }
  return true;
}

function requireCompany(req: any, res: any): boolean {
  if (!req.session.companyId) { res.status(400).json({ error: "No company selected" }); return false; }
  return true;
}

async function requireSingapore(req: any, res: any): Promise<boolean> {
  const companyId = req.session.companyId;
  if (!companyId) { res.status(400).json({ error: "No company selected" }); return false; }
  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, companyId)).limit(1);
  if (!company || company.country?.toLowerCase() !== "singapore") {
    res.status(403).json({ error: "Accounting features are only available for Singapore companies." });
    return false;
  }
  return true;
}

// ─── Chart of Accounts ──────────────────────────────────────────────────────

router.get("/accounts", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;

  const companyId = req.session.companyId!;
  await ensureAccountsSeeded(companyId);

  const accounts = await db.select()
    .from(accountsTable)
    .where(eq(accountsTable.companyId, companyId))
    .orderBy(asc(accountsTable.code));

  res.json(accounts);
});

router.post("/accounts", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;
  if (!req.session.isAdmin) { res.status(403).json({ error: "Admin only" }); return; }

  const companyId = req.session.companyId!;
  const { code, name, type, subType, description } = req.body;

  if (!code?.trim()) { res.status(400).json({ error: "Account code is required" }); return; }
  if (!name?.trim()) { res.status(400).json({ error: "Account name is required" }); return; }

  const VALID_TYPES = ["asset", "liability", "equity", "revenue", "expense"];
  if (!VALID_TYPES.includes(type)) { res.status(400).json({ error: "Invalid account type" }); return; }

  try {
    const [account] = await db.insert(accountsTable).values({
      companyId, code: code.trim(), name: name.trim(),
      type, subType: subType || type, description: description || null,
    }).returning();
    logAudit({ req, action: "create", entityType: "account", entityId: account.id, entityLabel: `${account.code} ${account.name}` });
    res.status(201).json(account);
  } catch (err: any) {
    if (err.code === "23505") {
      res.status(400).json({ error: `Account code "${code}" already exists for this company` });
    } else {
      res.status(500).json({ error: "Failed to create account" });
    }
  }
});

router.put("/accounts/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;
  if (!req.session.isAdmin) { res.status(403).json({ error: "Admin only" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid account ID" }); return; }

  const [existing] = await db.select().from(accountsTable).where(eq(accountsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Account not found" }); return; }

  const { name, subType, description, isActive } = req.body;
  const updates: any = {};
  if (name !== undefined) updates.name = name.trim();
  if (subType !== undefined) updates.subType = subType;
  if (description !== undefined) updates.description = description || null;
  if (isActive !== undefined) updates.isActive = Boolean(isActive);

  try {
    const [updated] = await db.update(accountsTable).set(updates).where(eq(accountsTable.id, id)).returning();
    logAudit({ req, action: "update", entityType: "account", entityId: id, entityLabel: `${updated.code} ${updated.name}` });
    res.json(updated);
  } catch {
    res.status(500).json({ error: "Failed to update account" });
  }
});

router.delete("/accounts/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;
  if (!req.session.isAdmin) { res.status(403).json({ error: "Admin only" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid account ID" }); return; }

  const [existing] = await db.select().from(accountsTable).where(eq(accountsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Account not found" }); return; }
  if (existing.isSystem) { res.status(400).json({ error: "System accounts cannot be deleted. You can deactivate them instead." }); return; }

  const usedLines = await db.select({ id: journalLinesTable.id })
    .from(journalLinesTable)
    .where(eq(journalLinesTable.accountId, id))
    .limit(1);
  if (usedLines.length > 0) {
    res.status(400).json({ error: "This account has journal entries. Deactivate it instead of deleting." });
    return;
  }

  await db.delete(accountsTable).where(eq(accountsTable.id, id));
  logAudit({ req, action: "delete", entityType: "account", entityId: id, entityLabel: `${existing.code} ${existing.name}` });
  res.json({ success: true });
});

// ─── Journal Entries ─────────────────────────────────────────────────────────

router.get("/journal-entries", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;

  const companyId = req.session.companyId!;
  const entries = await db.select()
    .from(journalEntriesTable)
    .where(eq(journalEntriesTable.companyId, companyId))
    .orderBy(desc(journalEntriesTable.entryDate), desc(journalEntriesTable.id));

  res.json(entries);
});

router.get("/journal-entries/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [entry] = await db.select().from(journalEntriesTable).where(eq(journalEntriesTable.id, id));
  if (!entry) { res.status(404).json({ error: "Journal entry not found" }); return; }

  const lines = await db.select({
    line:    journalLinesTable,
    account: accountsTable,
  })
    .from(journalLinesTable)
    .innerJoin(accountsTable, eq(journalLinesTable.accountId, accountsTable.id))
    .where(eq(journalLinesTable.journalEntryId, id));

  res.json({
    ...entry,
    lines: lines.map(r => ({
      ...r.line,
      debit:  parseFloat(r.line.debit ?? "0"),
      credit: parseFloat(r.line.credit ?? "0"),
      accountCode: r.account.code,
      accountName: r.account.name,
      accountType: r.account.type,
    })),
  });
});

router.post("/journal-entries", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;

  const companyId = req.session.companyId!;
  const { entryDate, description, lines } = req.body as {
    entryDate:   string;
    description: string;
    lines: Array<{ accountId: number; description?: string; debit: number; credit: number }>;
  };

  if (!entryDate)        { res.status(400).json({ error: "Entry date is required" }); return; }
  if (!description?.trim()) { res.status(400).json({ error: "Description is required" }); return; }
  if (!Array.isArray(lines) || lines.length < 2) {
    res.status(400).json({ error: "At least 2 journal lines are required" }); return;
  }

  const totalDebit  = lines.reduce((s, l) => s + (Number(l.debit)  || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  if (Math.abs(totalDebit - totalCredit) > 0.001) {
    res.status(400).json({ error: `Journal entry is not balanced. Debits: ${totalDebit.toFixed(2)}, Credits: ${totalCredit.toFixed(2)}` });
    return;
  }

  const accountIds = lines.map(l => l.accountId);
  const accounts = await db.select({ id: accountsTable.id })
    .from(accountsTable)
    .where(and(eq(accountsTable.companyId, companyId)));
  const validIds = new Set(accounts.map(a => a.id));
  const invalid = accountIds.find(id => !validIds.has(id));
  if (invalid) { res.status(400).json({ error: `Account ID ${invalid} not found for this company` }); return; }

  try {
    const [entry] = await db.insert(journalEntriesTable).values({
      companyId,
      entryDate,
      description: description.trim(),
      refType: "manual",
      status: "posted",
      createdBy: req.session.userId!,
    }).returning();

    await db.insert(journalLinesTable).values(
      lines.map(l => ({
        journalEntryId: entry.id,
        accountId:      l.accountId,
        description:    l.description || null,
        debit:          l.debit  > 0 ? l.debit.toFixed(2)  : "0",
        credit:         l.credit > 0 ? l.credit.toFixed(2) : "0",
      }))
    );

    logAudit({ req, action: "create", entityType: "journal_entry", entityId: entry.id, entityLabel: description });
    res.status(201).json({ ...entry, lines });
  } catch {
    res.status(500).json({ error: "Failed to create journal entry" });
  }
});

router.delete("/journal-entries/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;
  if (!req.session.isAdmin) { res.status(403).json({ error: "Admin only" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [entry] = await db.select().from(journalEntriesTable).where(eq(journalEntriesTable.id, id));
  if (!entry) { res.status(404).json({ error: "Journal entry not found" }); return; }
  if (entry.refType !== "manual") {
    res.status(400).json({ error: "Auto-posted entries cannot be deleted. They are reversed automatically when the source document changes." });
    return;
  }

  await db.delete(journalLinesTable).where(eq(journalLinesTable.journalEntryId, id));
  await db.delete(journalEntriesTable).where(eq(journalEntriesTable.id, id));
  logAudit({ req, action: "delete", entityType: "journal_entry", entityId: id, entityLabel: entry.description });
  res.json({ success: true });
});

// ─── Trial Balance ────────────────────────────────────────────────────────────

router.get("/trial-balance", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;

  const companyId = req.session.companyId!;
  const fromDate  = (req.query.from as string) || null;
  const toDate    = (req.query.to   as string) || null;

  await ensureAccountsSeeded(companyId);

  const accounts = await db.select()
    .from(accountsTable)
    .where(and(eq(accountsTable.companyId, companyId), eq(accountsTable.isActive, true)))
    .orderBy(asc(accountsTable.code));

  const entriesQuery = db.select({
    entryId:   journalEntriesTable.id,
    entryDate: journalEntriesTable.entryDate,
  })
    .from(journalEntriesTable)
    .where(and(
      eq(journalEntriesTable.companyId, companyId),
      eq(journalEntriesTable.status, "posted"),
      ...(fromDate ? [sql`${journalEntriesTable.entryDate} >= ${fromDate}`] : []),
      ...(toDate   ? [sql`${journalEntriesTable.entryDate} <= ${toDate}`]   : []),
    ));

  const entries = await entriesQuery;
  const entryIds = entries.map(e => e.entryId);

  let linesByAccount: Record<number, { debit: number; credit: number }> = {};

  if (entryIds.length > 0) {
    const lines = await db.select()
      .from(journalLinesTable)
      .where(sql`${journalLinesTable.journalEntryId} = ANY(${sql.raw(`ARRAY[${entryIds.join(",")}]::int[]`)})`);

    for (const line of lines) {
      if (!linesByAccount[line.accountId]) linesByAccount[line.accountId] = { debit: 0, credit: 0 };
      linesByAccount[line.accountId].debit  += parseFloat(line.debit  ?? "0");
      linesByAccount[line.accountId].credit += parseFloat(line.credit ?? "0");
    }
  }

  const rows = accounts.map(a => {
    const totals = linesByAccount[a.id] ?? { debit: 0, credit: 0 };
    return {
      id:           a.id,
      code:         a.code,
      name:         a.name,
      type:         a.type,
      subType:      a.subType,
      totalDebit:   totals.debit,
      totalCredit:  totals.credit,
      balance:      totals.debit - totals.credit,
    };
  });

  const grandDebit  = rows.reduce((s, r) => s + r.totalDebit,  0);
  const grandCredit = rows.reduce((s, r) => s + r.totalCredit, 0);

  res.json({
    fromDate: fromDate || null,
    toDate:   toDate   || null,
    rows,
    grandDebit,
    grandCredit,
    balanced: Math.abs(grandDebit - grandCredit) < 0.01,
  });
});

// ─── Profit & Loss Statement ─────────────────────────────────────────────────

router.get("/profit-loss", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;

  const companyId = req.session.companyId!;
  const fromDate  = (req.query.from as string) || null;
  const toDate    = (req.query.to   as string) || null;

  await ensureAccountsSeeded(companyId);

  // All revenue + expense accounts for this company
  const accounts = await db.select()
    .from(accountsTable)
    .where(and(
      eq(accountsTable.companyId, companyId),
      eq(accountsTable.isActive, true),
      sql`${accountsTable.type} IN ('revenue','expense')`,
    ))
    .orderBy(asc(accountsTable.code));

  // Include both 'posted' and 'reversed' entries so that a voided invoice
  // (original reversed + reversal posted) nets to zero rather than showing
  // only the reversal (which would produce a negative revenue line).
  const entries = await db.select({ entryId: journalEntriesTable.id })
    .from(journalEntriesTable)
    .where(and(
      eq(journalEntriesTable.companyId, companyId),
      sql`${journalEntriesTable.status} IN ('posted','reversed')`,
      ...(fromDate ? [sql`${journalEntriesTable.entryDate} >= ${fromDate}`] : []),
      ...(toDate   ? [sql`${journalEntriesTable.entryDate} <= ${toDate}`]   : []),
    ));

  const entryIds = entries.map(e => e.entryId);
  let linesByAccount: Record<number, { debit: number; credit: number }> = {};

  if (entryIds.length > 0) {
    const lines = await db.select()
      .from(journalLinesTable)
      .where(sql`${journalLinesTable.journalEntryId} = ANY(${sql.raw(`ARRAY[${entryIds.join(",")}]::int[]`)})`);
    for (const l of lines) {
      if (!linesByAccount[l.accountId]) linesByAccount[l.accountId] = { debit: 0, credit: 0 };
      linesByAccount[l.accountId].debit  += parseFloat(l.debit  ?? "0");
      linesByAccount[l.accountId].credit += parseFloat(l.credit ?? "0");
    }
  }

  function netAmount(acct: typeof accounts[0]) {
    const t = linesByAccount[acct.id] ?? { debit: 0, credit: 0 };
    // Revenue: positive = credit > debit
    // Expense: positive = debit > credit
    return acct.type === "revenue" ? t.credit - t.debit : t.debit - t.credit;
  }

  function mapAcct(acct: typeof accounts[0]) {
    return { code: acct.code, name: acct.name, subType: acct.subType, amount: parseFloat(netAmount(acct).toFixed(2)) };
  }

  const revenue         = accounts.filter(a => a.type === "revenue" && a.subType === "sales").map(mapAcct);
  const otherIncome     = accounts.filter(a => a.type === "revenue" && a.subType === "other_income").map(mapAcct);
  const costOfSales     = accounts.filter(a => a.type === "expense" && a.subType === "cost_of_sales").map(mapAcct);
  const operatingExpenses = accounts.filter(a => a.type === "expense" && a.subType === "operating_expense" && a.code !== "7300").map(mapAcct);
  const incomeTaxAcct   = accounts.find(a => a.code === "7300");

  const totalRevenue          = revenue.reduce((s, a) => s + a.amount, 0);
  const totalOtherIncome      = otherIncome.reduce((s, a) => s + a.amount, 0);
  const totalCostOfSales      = costOfSales.reduce((s, a) => s + a.amount, 0);
  const grossProfit           = totalRevenue + totalOtherIncome - totalCostOfSales;
  const totalOperatingExpenses = operatingExpenses.reduce((s, a) => s + a.amount, 0);
  const operatingProfit       = grossProfit - totalOperatingExpenses;
  const incomeTax             = incomeTaxAcct ? parseFloat(netAmount(incomeTaxAcct).toFixed(2)) : 0;
  const netProfit             = operatingProfit - incomeTax;

  res.json({
    period: { from: fromDate, to: toDate },
    revenue,
    otherIncome,
    totalRevenue: parseFloat((totalRevenue + totalOtherIncome).toFixed(2)),
    costOfSales,
    totalCostOfSales: parseFloat(totalCostOfSales.toFixed(2)),
    grossProfit: parseFloat(grossProfit.toFixed(2)),
    operatingExpenses,
    totalOperatingExpenses: parseFloat(totalOperatingExpenses.toFixed(2)),
    operatingProfit: parseFloat(operatingProfit.toFixed(2)),
    incomeTax: parseFloat(incomeTax.toFixed(2)),
    netProfit: parseFloat(netProfit.toFixed(2)),
  });
});

// ─── GST F5 Return (Singapore) ───────────────────────────────────────────────

router.get("/gst-f5", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;

  const companyId = req.session.companyId!;
  const fromDate  = (req.query.from as string) || null;
  const toDate    = (req.query.to   as string) || null;

  await ensureAccountsSeeded(companyId);

  const [company]  = await db.select().from(companiesTable).where(eq(companiesTable.id, companyId)).limit(1);
  const [settings] = await db.select().from(settingsTable).where(eq(settingsTable.companyId, companyId)).limit(1);
  const gstRate    = parseFloat((settings as any)?.gstRate ?? "9");

  // ─ Box 1 + Box 6: standard-rated sales invoices (non-draft, non-void, GST > 0) ─
  const invRows = await db.select({
    id:             invoicesTable.id,
    invNumber:      invoicesTable.invNumber,
    customerName:   invoicesTable.customerName,
    issueDate:      invoicesTable.issueDate,
    subtotal:       invoicesTable.subtotal,
    discountAmount: invoicesTable.discountAmount,
    tax:            invoicesTable.tax,
    totalAmount:    invoicesTable.totalAmount,
    currency:       invoicesTable.currency,
    exchangeRate:   (invoicesTable as any).exchangeRate,
    status:         invoicesTable.status,
  })
  .from(invoicesTable)
  .where(and(
    eq(invoicesTable.companyId, companyId),
    sql`${invoicesTable.status} NOT IN ('draft', 'void')`,
    sql`CAST(${invoicesTable.tax} AS numeric) > 0`,
    ...(fromDate ? [sql`${invoicesTable.issueDate} >= ${fromDate}`] : []),
    ...(toDate   ? [sql`${invoicesTable.issueDate} <= ${toDate}`]   : []),
  ));

  const invBox1 = invRows.reduce((s, r) => {
    const fx = parseFloat(r.exchangeRate ?? "1") || 1;
    return s + (parseFloat(r.subtotal ?? "0") - parseFloat(r.discountAmount ?? "0")) * fx;
  }, 0);
  const invBox6 = invRows.reduce((s, r) => {
    const fx = parseFloat(r.exchangeRate ?? "1") || 1;
    return s + parseFloat(r.tax ?? "0") * fx;
  }, 0);

  // ─ Box 1/2/3/6: confirmed income records (non-trade income) ─
  const incomeRows = await db.select({
    id:           incomeRecordsTable.id,
    payerName:    incomeRecordsTable.payerName,
    description:  incomeRecordsTable.description,
    category:     incomeRecordsTable.category,
    incomeDate:   incomeRecordsTable.incomeDate,
    amount:       incomeRecordsTable.amount,
    gstAmount:    incomeRecordsTable.gstAmount,
    gstTreatment: incomeRecordsTable.gstTreatment,
    currency:     incomeRecordsTable.currency,
    exchangeRate: (incomeRecordsTable as any).exchangeRate,
  })
  .from(incomeRecordsTable)
  .where(and(
    eq(incomeRecordsTable.companyId, companyId),
    eq(incomeRecordsTable.status, "confirmed"),
    ...(fromDate ? [sql`${incomeRecordsTable.incomeDate} >= ${fromDate}`] : []),
    ...(toDate   ? [sql`${incomeRecordsTable.incomeDate} <= ${toDate}`]   : []),
  ));

  const incomeBox1 = incomeRows.filter(r => r.gstTreatment === "standard_rated").reduce((s, r) => {
    const fx = parseFloat(r.exchangeRate ?? "1") || 1;
    return s + parseFloat(r.amount ?? "0") * fx;
  }, 0);
  const incomeBox2 = incomeRows.filter(r => r.gstTreatment === "zero_rated").reduce((s, r) => {
    const fx = parseFloat(r.exchangeRate ?? "1") || 1;
    return s + parseFloat(r.amount ?? "0") * fx;
  }, 0);
  const incomeBox3 = incomeRows.filter(r => r.gstTreatment === "exempt").reduce((s, r) => {
    const fx = parseFloat(r.exchangeRate ?? "1") || 1;
    return s + parseFloat(r.amount ?? "0") * fx;
  }, 0);
  // Box 5 = out-of-scope SUPPLIES (sales/income side only — e.g. grants, non-business receipts)
  const incomeBox5 = incomeRows.filter(r => r.gstTreatment === "out_of_scope").reduce((s, r) => {
    const fx = parseFloat(r.exchangeRate ?? "1") || 1;
    return s + parseFloat(r.amount ?? "0") * fx;
  }, 0);
  const incomeBox6 = incomeRows.filter(r => r.gstTreatment === "standard_rated").reduce((s, r) => {
    const fx = parseFloat(r.exchangeRate ?? "1") || 1;
    return s + parseFloat(r.gstAmount ?? "0") * fx;
  }, 0);

  const box1 = invBox1 + incomeBox1;
  const box6 = invBox6 + incomeBox6;

  // ─ Box 4 / Box 5 / Box 7: purchases from vendor invoices ─
  // IRAS F5:
  //   Box 4 = net value of standard-rated (SR 9%) purchases (excl. GST)
  //   Box 5 = zero-rated (ZR) + exempt (ES) purchases
  //   Box 7 = claimable input tax = GST on SR purchases
  const viRows = await db.select({
    id:           vendorInvoicesTable.id,
    piNumber:     vendorInvoicesTable.piNumber,
    vendorName:   vendorInvoicesTable.vendorName,
    piDate:       vendorInvoicesTable.piDate,
    totalAmount:  vendorInvoicesTable.totalAmount,
    gstAmount:    vendorInvoicesTable.gstAmount,
    gstTreatment: vendorInvoicesTable.gstTreatment,
    currency:     vendorInvoicesTable.currency,
    exchangeRate: (vendorInvoicesTable as any).exchangeRate,
  })
  .from(vendorInvoicesTable)
  .where(and(
    eq(vendorInvoicesTable.companyId, companyId),
    ...(fromDate ? [sql`COALESCE(${vendorInvoicesTable.piDate}, to_char(${vendorInvoicesTable.createdAt}, 'YYYY-MM-DD')) >= ${fromDate}`] : []),
    ...(toDate   ? [sql`COALESCE(${vendorInvoicesTable.piDate}, to_char(${vendorInvoicesTable.createdAt}, 'YYYY-MM-DD')) <= ${toDate}`]   : []),
  ));

  // Segment vendor invoices by GST treatment
  // Only standard-rated purchases contribute to the F5:
  //   Box 4 = net value of SR purchases (excl. GST)
  //   Box 7 = input tax claimed on SR purchases
  // ZR, exempt, and out-of-scope purchases are non-claimable and have no F5 box.
  const viSR = viRows.filter(r => !r.gstTreatment || r.gstTreatment === "standard_rated");

  // Box 4: net amount (excl. GST) of SR purchases — converted to SGD via exchange rate
  const viBox4 = viSR.reduce((s, r) => {
    const fx = parseFloat(r.exchangeRate ?? "1") || 1;
    return s + (parseFloat(r.totalAmount ?? "0") - parseFloat(r.gstAmount ?? "0")) * fx;
  }, 0);
  // Box 7 contribution from vendor invoices: GST amount on SR purchases — converted to SGD
  const viBox7 = viSR.reduce((s, r) => {
    const fx = parseFloat(r.exchangeRate ?? "1") || 1;
    return s + parseFloat(r.gstAmount ?? "0") * fx;
  }, 0);

  // ─ Confirmed expenses with GST claimable → also contribute to Box 4 (net) + Box 7 (GST) ─
  const expenseRows = await db.select({
    id:          expensesTable.id,
    vendorName:  expensesTable.vendorName,
    description: expensesTable.description,
    category:    expensesTable.category,
    expenseDate: expensesTable.expenseDate,
    amount:      expensesTable.amount,
    gstAmount:   expensesTable.gstAmount,
    currency:    expensesTable.currency,
  })
  .from(expensesTable)
  .where(and(
    eq(expensesTable.companyId,    companyId),
    eq(expensesTable.status,       "confirmed"),
    eq(expensesTable.gstClaimable, true),
    ...(fromDate ? [sql`${expensesTable.expenseDate} >= ${fromDate}`] : []),
    ...(toDate   ? [sql`${expensesTable.expenseDate} <= ${toDate}`]   : []),
  ));

  const expenseBox4 = expenseRows.reduce((s, r) => s + parseFloat(r.amount ?? "0"), 0);
  const expenseBox7 = expenseRows.reduce((s, r) => s + parseFloat(r.gstAmount ?? "0"), 0);

  // Box 4 = net SR vendor invoices + GST-claimable expenses
  const totalBox4 = viBox4 + expenseBox4;
  // Box 5 = out-of-scope SUPPLIES (income/sales side) — NOT vendor purchases
  const totalBox5 = incomeBox5;
  // Box 7 = input tax from SR vendor invoices + claimable expenses
  const totalBox7 = viBox7 + expenseBox7;
  const box8 = box6 - totalBox7;

  res.json({
    period:  { from: fromDate, to: toDate },
    company: { name: company?.name, gstRegistrationNo: company?.registrationNo, address: company?.address },
    gstRate,
    box1: parseFloat(box1.toFixed(2)),
    box2: parseFloat(incomeBox2.toFixed(2)),
    box3: parseFloat(incomeBox3.toFixed(2)),
    box4: parseFloat(totalBox4.toFixed(2)),
    box5: parseFloat(totalBox5.toFixed(2)),
    box6: parseFloat(box6.toFixed(2)),
    box7: parseFloat(totalBox7.toFixed(2)),
    box8: parseFloat(box8.toFixed(2)),
    invoices: invRows.map(r => {
      const fx = parseFloat(r.exchangeRate ?? "1") || 1;
      const net = parseFloat(r.subtotal ?? "0") - parseFloat(r.discountAmount ?? "0");
      const gst = parseFloat(r.tax ?? "0");
      return {
        id:           r.id,
        invNumber:    r.invNumber,
        customerName: r.customerName,
        issueDate:    r.issueDate,
        netAmount:    parseFloat(net.toFixed(2)),
        gstAmount:    parseFloat(gst.toFixed(2)),
        totalAmount:  parseFloat(parseFloat(r.totalAmount ?? "0").toFixed(2)),
        netAmountSGD: parseFloat((net * fx).toFixed(2)),
        gstAmountSGD: parseFloat((gst * fx).toFixed(2)),
        currency:     r.currency ?? "SGD",
        exchangeRate: fx,
        status:       r.status,
      };
    }),
    vendorInvoices: viRows.map(r => {
      const fx = parseFloat(r.exchangeRate ?? "1") || 1;
      const netFx = (parseFloat(r.totalAmount ?? "0") - parseFloat(r.gstAmount ?? "0")) * fx;
      const gstFx = parseFloat(r.gstAmount ?? "0") * fx;
      return {
        id:           r.id,
        piNumber:     r.piNumber,
        vendorName:   r.vendorName,
        piDate:       r.piDate,
        netAmount:    parseFloat((parseFloat(r.totalAmount ?? "0") - parseFloat(r.gstAmount ?? "0")).toFixed(2)),
        gstAmount:    parseFloat(parseFloat(r.gstAmount ?? "0").toFixed(2)),
        totalAmount:  parseFloat(parseFloat(r.totalAmount ?? "0").toFixed(2)),
        netAmountSGD: parseFloat(netFx.toFixed(2)),
        gstAmountSGD: parseFloat(gstFx.toFixed(2)),
        gstTreatment: r.gstTreatment ?? "standard_rated",
        currency:     r.currency,
        exchangeRate: fx,
      };
    }),
    expenses: expenseRows.map(r => ({
      id:          r.id,
      vendorName:  r.vendorName,
      description: r.description,
      category:    r.category,
      expenseDate: r.expenseDate,
      amount:      parseFloat(parseFloat(r.amount ?? "0").toFixed(2)),
      gstAmount:   parseFloat(parseFloat(r.gstAmount ?? "0").toFixed(2)),
      currency:    r.currency,
    })),
    incomeRecords: incomeRows.map(r => {
      const fx = parseFloat(r.exchangeRate ?? "1") || 1;
      return {
        id:           r.id,
        payerName:    r.payerName,
        description:  r.description,
        category:     r.category,
        incomeDate:   r.incomeDate,
        amount:       parseFloat(parseFloat(r.amount ?? "0").toFixed(2)),
        gstAmount:    parseFloat(parseFloat(r.gstAmount ?? "0").toFixed(2)),
        amountSGD:    parseFloat((parseFloat(r.amount ?? "0") * fx).toFixed(2)),
        gstAmountSGD: parseFloat((parseFloat(r.gstAmount ?? "0") * fx).toFixed(2)),
        gstTreatment: r.gstTreatment,
        currency:     r.currency,
        exchangeRate: fx,
      };
    }),
  });
});

// ─── AR Aging Report ─────────────────────────────────────────────────────────

router.get("/ar-aging", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;

  const companyId = req.session.companyId!;
  const asOf = (req.query.asOf as string) || new Date().toISOString().split("T")[0];
  const asOfMs = new Date(asOf + "T00:00:00").getTime();

  const rows = await db.select({
    id: invoicesTable.id, invNumber: invoicesTable.invNumber,
    customerName: invoicesTable.customerName, issueDate: invoicesTable.issueDate,
    totalAmount: invoicesTable.totalAmount, status: invoicesTable.status,
    paymentTerms: invoicesTable.paymentTerms,
  })
  .from(invoicesTable)
  .where(and(
    eq(invoicesTable.companyId, companyId),
    sql`${invoicesTable.status} NOT IN ('draft', 'void', 'paid')`,
    sql`COALESCE(${invoicesTable.issueDate}, to_char(${invoicesTable.createdAt}::date, 'YYYY-MM-DD')) <= ${asOf}`,
  ));

  function termsDays(pt: string | null): number {
    const s = (pt ?? "").toLowerCase();
    if (s.includes("cod") || s.includes("advance")) return 0;
    if (s.includes("7"))  return 7;
    if (s.includes("14")) return 14;
    return 30;
  }

  const byCustomer: Record<string, { customerName: string; current: number; b1_30: number; b31_60: number; b61_90: number; b91plus: number; total: number; invoices: any[] }> = {};

  for (const inv of rows) {
    const name   = inv.customerName || "Unknown";
    const amount = parseFloat(inv.totalAmount ?? "0");
    const dueMs  = new Date((inv.issueDate || asOf) + "T00:00:00").getTime() + termsDays(inv.paymentTerms) * 86_400_000;
    const days   = Math.floor((asOfMs - dueMs) / 86_400_000);
    if (!byCustomer[name]) byCustomer[name] = { customerName: name, current: 0, b1_30: 0, b31_60: 0, b61_90: 0, b91plus: 0, total: 0, invoices: [] };
    if      (days <= 0)  byCustomer[name].current  += amount;
    else if (days <= 30) byCustomer[name].b1_30    += amount;
    else if (days <= 60) byCustomer[name].b31_60   += amount;
    else if (days <= 90) byCustomer[name].b61_90   += amount;
    else                 byCustomer[name].b91plus  += amount;
    byCustomer[name].total += amount;
    byCustomer[name].invoices.push({ id: inv.id, invNumber: inv.invNumber, issueDate: inv.issueDate, amount, daysPastDue: days });
  }

  const customers = Object.values(byCustomer).sort((a, b) => b.total - a.total)
    .map(c => ({ ...c, current: +c.current.toFixed(2), b1_30: +c.b1_30.toFixed(2), b31_60: +c.b31_60.toFixed(2), b61_90: +c.b61_90.toFixed(2), b91plus: +c.b91plus.toFixed(2), total: +c.total.toFixed(2) }));

  const totals = customers.reduce((s, c) => ({
    current: s.current + c.current, b1_30: s.b1_30 + c.b1_30, b31_60: s.b31_60 + c.b31_60,
    b61_90: s.b61_90 + c.b61_90, b91plus: s.b91plus + c.b91plus, total: s.total + c.total,
  }), { current: 0, b1_30: 0, b31_60: 0, b61_90: 0, b91plus: 0, total: 0 });

  res.json({ asOf, customers, totals });
});

// ─── AP Aging Report ─────────────────────────────────────────────────────────

router.get("/ap-aging", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;

  const companyId = req.session.companyId!;
  const asOf   = (req.query.asOf as string) || new Date().toISOString().split("T")[0];
  const asOfMs = new Date(asOf + "T00:00:00").getTime();
  const TERMS  = 30;

  const rows = await db.select({
    id: vendorInvoicesTable.id, piNumber: vendorInvoicesTable.piNumber,
    vendorName: vendorInvoicesTable.vendorName, piDate: vendorInvoicesTable.piDate,
    totalAmount: vendorInvoicesTable.totalAmount, paidAmount: vendorInvoicesTable.paidAmount,
    status: vendorInvoicesTable.status,
  })
  .from(vendorInvoicesTable)
  .where(and(
    eq(vendorInvoicesTable.companyId, companyId),
    sql`${vendorInvoicesTable.status} != 'paid'`,
    sql`COALESCE(${vendorInvoicesTable.piDate}, to_char(${vendorInvoicesTable.createdAt}::date, 'YYYY-MM-DD')) <= ${asOf}`,
  ));

  const byVendor: Record<string, { vendorName: string; current: number; b1_30: number; b31_60: number; b61_90: number; b91plus: number; total: number; invoices: any[] }> = {};

  for (const vi of rows) {
    const name    = vi.vendorName || "Unknown";
    const balance = parseFloat(vi.totalAmount ?? "0") - parseFloat(vi.paidAmount ?? "0");
    if (balance < 0.005) continue;
    const dueMs = new Date((vi.piDate || asOf) + "T00:00:00").getTime() + TERMS * 86_400_000;
    const days  = Math.floor((asOfMs - dueMs) / 86_400_000);
    if (!byVendor[name]) byVendor[name] = { vendorName: name, current: 0, b1_30: 0, b31_60: 0, b61_90: 0, b91plus: 0, total: 0, invoices: [] };
    if      (days <= 0)  byVendor[name].current  += balance;
    else if (days <= 30) byVendor[name].b1_30    += balance;
    else if (days <= 60) byVendor[name].b31_60   += balance;
    else if (days <= 90) byVendor[name].b61_90   += balance;
    else                 byVendor[name].b91plus  += balance;
    byVendor[name].total += balance;
    byVendor[name].invoices.push({ id: vi.id, piNumber: vi.piNumber, piDate: vi.piDate, balance: +balance.toFixed(2), daysPastDue: days, status: vi.status });
  }

  const vendors = Object.values(byVendor).sort((a, b) => b.total - a.total)
    .map(v => ({ ...v, current: +v.current.toFixed(2), b1_30: +v.b1_30.toFixed(2), b31_60: +v.b31_60.toFixed(2), b61_90: +v.b61_90.toFixed(2), b91plus: +v.b91plus.toFixed(2), total: +v.total.toFixed(2) }));

  const totals = vendors.reduce((s, v) => ({
    current: s.current + v.current, b1_30: s.b1_30 + v.b1_30, b31_60: s.b31_60 + v.b31_60,
    b61_90: s.b61_90 + v.b61_90, b91plus: s.b91plus + v.b91plus, total: s.total + v.total,
  }), { current: 0, b1_30: 0, b31_60: 0, b61_90: 0, b91plus: 0, total: 0 });

  res.json({ asOf, vendors, totals });
});

// ─── Balance Sheet ────────────────────────────────────────────────────────────

router.get("/balance-sheet", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;

  const companyId = req.session.companyId!;
  const asOf = (req.query.asOf as string) || new Date().toISOString().split("T")[0];

  await ensureAccountsSeeded(companyId);

  const allAccounts = await db.select().from(accountsTable)
    .where(and(eq(accountsTable.companyId, companyId), eq(accountsTable.isActive, true)))
    .orderBy(asc(accountsTable.code));

  const entries = await db.select({ entryId: journalEntriesTable.id })
    .from(journalEntriesTable)
    .where(and(
      eq(journalEntriesTable.companyId, companyId),
      sql`${journalEntriesTable.status} IN ('posted', 'reversed')`,
      sql`${journalEntriesTable.entryDate} <= ${asOf}`,
    ));

  const linesByAccount: Record<number, { debit: number; credit: number }> = {};
  if (entries.length > 0) {
    const ids = entries.map(e => e.entryId);
    const lines = await db.select().from(journalLinesTable)
      .where(sql`${journalLinesTable.journalEntryId} = ANY(${sql.raw(`ARRAY[${ids.join(",")}]::int[]`)})`);
    for (const l of lines) {
      if (!linesByAccount[l.accountId]) linesByAccount[l.accountId] = { debit: 0, credit: 0 };
      linesByAccount[l.accountId].debit  += parseFloat(l.debit  ?? "0");
      linesByAccount[l.accountId].credit += parseFloat(l.credit ?? "0");
    }
  }

  const bal    = (a: typeof allAccounts[0]) => { const t = linesByAccount[a.id] ?? { debit: 0, credit: 0 }; return a.type === "asset" ? t.debit - t.credit : t.credit - t.debit; };
  const mapA   = (a: typeof allAccounts[0]) => ({ code: a.code, name: a.name, subType: a.subType, amount: parseFloat(bal(a).toFixed(2)) });

  const assets      = allAccounts.filter(a => a.type === "asset").map(mapA);
  const liabilities = allAccounts.filter(a => a.type === "liability").map(mapA);
  const equity      = allAccounts.filter(a => a.type === "equity").map(mapA);

  const retainedEarnings = allAccounts
    .filter(a => a.type === "revenue" || a.type === "expense")
    .reduce((s, a) => { const t = linesByAccount[a.id] ?? { debit: 0, credit: 0 }; return s + (a.type === "revenue" ? t.credit - t.debit : t.debit - t.credit); }, 0);

  const totalAssets      = assets.reduce((s, a) => s + a.amount, 0);
  const totalLiabilities = liabilities.reduce((s, a) => s + a.amount, 0);
  const totalEquity      = equity.reduce((s, a) => s + a.amount, 0) + retainedEarnings;

  res.json({
    asOf,
    assets, totalAssets: parseFloat(totalAssets.toFixed(2)),
    liabilities, totalLiabilities: parseFloat(totalLiabilities.toFixed(2)),
    equity, retainedEarnings: parseFloat(retainedEarnings.toFixed(2)),
    totalEquity: parseFloat(totalEquity.toFixed(2)),
    totalLiabilitiesAndEquity: parseFloat((totalLiabilities + totalEquity).toFixed(2)),
    balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
  });
});

// ─── Customer Statement ───────────────────────────────────────────────────────

router.get("/customer-statement", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;

  const companyId = req.session.companyId!;
  const customer  = (req.query.customer as string) || "";
  const fromDate  = (req.query.from as string) || null;
  const toDate    = (req.query.to   as string) || null;

  const nameRows = await db.selectDistinct({ name: invoicesTable.customerName })
    .from(invoicesTable)
    .where(and(eq(invoicesTable.companyId, companyId), sql`${invoicesTable.status} != 'draft'`, sql`${invoicesTable.customerName} IS NOT NULL`))
    .orderBy(asc(invoicesTable.customerName));
  const customerNames = nameRows.map(r => r.name).filter(Boolean) as string[];

  if (!customer) { res.json({ customer: "", customerNames, entries: [], totalBilled: 0, totalPaid: 0, balance: 0 }); return; }

  const invRows = await db.select({
    id: invoicesTable.id, invNumber: invoicesTable.invNumber,
    issueDate: invoicesTable.issueDate, totalAmount: invoicesTable.totalAmount,
    status: invoicesTable.status, paymentTerms: invoicesTable.paymentTerms,
  })
  .from(invoicesTable)
  .where(and(
    eq(invoicesTable.companyId, companyId),
    sql`LOWER(${invoicesTable.customerName}) = LOWER(${customer})`,
    sql`${invoicesTable.status} NOT IN ('draft', 'void')`,
    ...(fromDate ? [sql`${invoicesTable.issueDate} >= ${fromDate}`] : []),
    ...(toDate   ? [sql`${invoicesTable.issueDate} <= ${toDate}`]   : []),
  ))
  .orderBy(asc(invoicesTable.issueDate), asc(invoicesTable.id));

  const totalBilled = invRows.reduce((s, i) => s + parseFloat(i.totalAmount ?? "0"), 0);
  const totalPaid   = invRows.filter(i => i.status === "paid").reduce((s, i) => s + parseFloat(i.totalAmount ?? "0"), 0);

  res.json({
    customer, customerNames,
    entries: invRows.map(inv => ({ id: inv.id, invNumber: inv.invNumber, issueDate: inv.issueDate, amount: parseFloat(parseFloat(inv.totalAmount ?? "0").toFixed(2)), status: inv.status, paymentTerms: inv.paymentTerms })),
    totalBilled: parseFloat(totalBilled.toFixed(2)),
    totalPaid:   parseFloat(totalPaid.toFixed(2)),
    balance:     parseFloat((totalBilled - totalPaid).toFixed(2)),
  });
});

export default router;

// ─── GST F7 (Amended Return) ─────────────────────────────────────────────────

router.get("/gst-f7", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;

  const companyId  = req.session.companyId!;
  const fromDate   = (req.query.from  as string) || null;
  const toDate     = (req.query.to    as string) || null;
  const origFromDate = (req.query.origFrom as string) || null;
  const origToDate   = (req.query.origTo   as string) || null;

  await ensureAccountsSeeded(companyId);

  const [company]  = await db.select().from(companiesTable).where(eq(companiesTable.id, companyId)).limit(1);
  const [settings] = await db.select().from(settingsTable).where(eq(settingsTable.companyId, companyId)).limit(1);
  const gstRate    = parseFloat((settings as any)?.gstRate ?? "9");

  async function computeF5Boxes(fDate: string | null, tDate: string | null) {
    // Sales invoices — apply exchange rate so amounts are always in SGD
    const invRows = await db.select({
      subtotal: invoicesTable.subtotal, discountAmount: invoicesTable.discountAmount,
      tax: invoicesTable.tax, gstTreatment: (invoicesTable as any).gstTreatment,
      exchangeRate: (invoicesTable as any).exchangeRate,
    })
    .from(invoicesTable)
    .where(and(
      eq(invoicesTable.companyId, companyId),
      sql`${invoicesTable.status} NOT IN ('draft','void')`,
      sql`CAST(${invoicesTable.tax} AS numeric) > 0`,
      ...(fDate ? [sql`${invoicesTable.issueDate} >= ${fDate}`] : []),
      ...(tDate ? [sql`${invoicesTable.issueDate} <= ${tDate}`] : []),
    ));
    const box1 = invRows.reduce((s, r) => {
      const fx = parseFloat(r.exchangeRate ?? "1") || 1;
      return s + (parseFloat(r.subtotal ?? "0") - parseFloat(r.discountAmount ?? "0")) * fx;
    }, 0);
    const box6 = invRows.reduce((s, r) => {
      const fx = parseFloat(r.exchangeRate ?? "1") || 1;
      return s + parseFloat(r.tax ?? "0") * fx;
    }, 0);

    // Vendor invoices — apply exchange rate; use net amount (excl. GST) for box4
    const viRows = await db.select({
      totalAmount: vendorInvoicesTable.totalAmount,
      gstAmount:   vendorInvoicesTable.gstAmount,
      gstTreatment: vendorInvoicesTable.gstTreatment,
      exchangeRate: (vendorInvoicesTable as any).exchangeRate,
    })
      .from(vendorInvoicesTable)
      .where(and(
        eq(vendorInvoicesTable.companyId, companyId),
        ...(fDate ? [sql`COALESCE(${vendorInvoicesTable.piDate}, to_char(${vendorInvoicesTable.createdAt},'YYYY-MM-DD')) >= ${fDate}`] : []),
        ...(tDate ? [sql`COALESCE(${vendorInvoicesTable.piDate}, to_char(${vendorInvoicesTable.createdAt},'YYYY-MM-DD')) <= ${tDate}`] : []),
      ));
    const box4 = viRows.reduce((s, r) => {
      if (r.gstTreatment && r.gstTreatment !== "standard_rated") return s;
      const fx  = parseFloat(r.exchangeRate ?? "1") || 1;
      const net = parseFloat(r.totalAmount ?? "0") - parseFloat(r.gstAmount ?? "0");
      return s + net * fx;
    }, 0);
    const box7raw = viRows.reduce((s, r) => {
      if (r.gstTreatment && r.gstTreatment !== "standard_rated") return s;
      const fx  = parseFloat(r.exchangeRate ?? "1") || 1;
      return s + parseFloat(r.gstAmount ?? "0") * fx;
    }, 0);

    // Also include journal-line box7 contributions for manually-entered entries
    const [gstInputAcct] = await db.select().from(accountsTable)
      .where(and(eq(accountsTable.companyId, companyId), eq(accountsTable.code, "1110"))).limit(1);
    let box7je = 0;
    if (gstInputAcct) {
      const entries = await db.select({ entryId: journalEntriesTable.id }).from(journalEntriesTable)
        .where(and(eq(journalEntriesTable.companyId, companyId), eq(journalEntriesTable.status, "posted"),
          sql`${journalEntriesTable.refType} IS NULL`,  // manual entries only — avoid double-counting
          ...(fDate ? [sql`${journalEntriesTable.entryDate} >= ${fDate}`] : []),
          ...(tDate ? [sql`${journalEntriesTable.entryDate} <= ${tDate}`] : []),
        ));
      const eIds = entries.map(e => e.entryId);
      if (eIds.length > 0) {
        const lines = await db.select().from(journalLinesTable)
          .where(and(eq(journalLinesTable.accountId, gstInputAcct.id), sql`${journalLinesTable.journalEntryId} = ANY(${sql.raw(`ARRAY[${eIds.join(",")}]::int[]`)})`));
        box7je = lines.reduce((s, l) => s + parseFloat(l.debit ?? "0"), 0);
      }
    }
    const box7 = box7raw + box7je;
    return { box1, box2: 0, box3: 0, box4, box5: 0, box6, box7, box8: box6 - box7 };
  }

  const [original, amended] = await Promise.all([
    computeF5Boxes(origFromDate, origToDate),
    computeF5Boxes(fromDate, toDate),
  ]);

  const delta = {
    box1: amended.box1 - original.box1, box2: 0, box3: 0,
    box4: amended.box4 - original.box4, box5: 0,
    box6: amended.box6 - original.box6, box7: amended.box7 - original.box7,
    box8: amended.box8 - original.box8,
  };

  res.json({
    originalPeriod: { from: origFromDate, to: origToDate },
    amendedPeriod:  { from: fromDate,     to: toDate     },
    company: { name: company?.name, gstRegistrationNo: company?.registrationNo, address: company?.address },
    gstRate,
    original: { box1: +original.box1.toFixed(2), box2: 0, box3: 0, box4: +original.box4.toFixed(2), box5: 0, box6: +original.box6.toFixed(2), box7: +original.box7.toFixed(2), box8: +original.box8.toFixed(2) },
    amended:  { box1: +amended.box1.toFixed(2),  box2: 0, box3: 0, box4: +amended.box4.toFixed(2),  box5: 0, box6: +amended.box6.toFixed(2),  box7: +amended.box7.toFixed(2),  box8: +amended.box8.toFixed(2) },
    delta:    { box1: +delta.box1.toFixed(2),    box2: 0, box3: 0, box4: +delta.box4.toFixed(2),    box5: 0, box6: +delta.box6.toFixed(2),    box7: +delta.box7.toFixed(2),    box8: +delta.box8.toFixed(2) },
  });
});

// ─── Vendor Statement ─────────────────────────────────────────────────────────

router.get("/vendor-statement", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;

  const companyId = req.session.companyId!;
  const vendor    = (req.query.vendor as string) || "";
  const fromDate  = (req.query.from   as string) || null;
  const toDate    = (req.query.to     as string) || null;

  const nameRows = await db.selectDistinct({ name: vendorInvoicesTable.vendorName })
    .from(vendorInvoicesTable)
    .where(and(eq(vendorInvoicesTable.companyId, companyId), sql`${vendorInvoicesTable.vendorName} IS NOT NULL`))
    .orderBy(asc(vendorInvoicesTable.vendorName));
  const vendorNames = nameRows.map(r => r.name).filter(Boolean) as string[];

  if (!vendor) { res.json({ vendor: "", vendorNames, entries: [], totalBilled: 0, totalPaid: 0, balance: 0 }); return; }

  const piRows = await db.select()
    .from(vendorInvoicesTable)
    .where(and(
      eq(vendorInvoicesTable.companyId, companyId),
      sql`LOWER(${vendorInvoicesTable.vendorName}) = LOWER(${vendor})`,
      ...(fromDate ? [sql`COALESCE(${vendorInvoicesTable.piDate}, to_char(${vendorInvoicesTable.createdAt},'YYYY-MM-DD')) >= ${fromDate}`] : []),
      ...(toDate   ? [sql`COALESCE(${vendorInvoicesTable.piDate}, to_char(${vendorInvoicesTable.createdAt},'YYYY-MM-DD')) <= ${toDate}`]   : []),
    ))
    .orderBy(asc(vendorInvoicesTable.piDate), asc(vendorInvoicesTable.id));

  const totalBilled = piRows.reduce((s, r) => s + parseFloat(r.totalAmount ?? "0"), 0);
  const totalPaid   = piRows.filter(r => r.status === "paid").reduce((s, r) => s + parseFloat(r.totalAmount ?? "0"), 0);

  res.json({
    vendor, vendorNames,
    entries: piRows.map(r => ({
      id: r.id, piNumber: r.piNumber, piDate: r.piDate,
      amount: +parseFloat(r.totalAmount ?? "0").toFixed(2),
      paidAmount: +parseFloat(r.paidAmount ?? "0").toFixed(2),
      balance: +Math.max(0, parseFloat(r.totalAmount ?? "0") - parseFloat(r.paidAmount ?? "0")).toFixed(2),
      status: r.status, currency: r.currency,
    })),
    totalBilled: +totalBilled.toFixed(2),
    totalPaid:   +totalPaid.toFixed(2),
    balance:     +(totalBilled - totalPaid).toFixed(2),
  });
});

// ─── General Ledger ───────────────────────────────────────────────────────────

router.get("/general-ledger", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;

  const companyId = req.session.companyId!;
  const accountId = req.query.accountId ? parseInt(req.query.accountId as string, 10) : null;
  const fromDate  = (req.query.from as string) || null;
  const toDate    = (req.query.to   as string) || null;

  await ensureAccountsSeeded(companyId);

  const accounts = await db.select()
    .from(accountsTable)
    .where(and(eq(accountsTable.companyId, companyId), eq(accountsTable.isActive, true)))
    .orderBy(asc(accountsTable.code));

  if (!accountId) {
    res.json({ accounts: accounts.map(a => ({ id: a.id, code: a.code, name: a.name, type: a.type })), transactions: [], openingBalance: 0, closingBalance: 0 });
    return;
  }

  const [account] = accounts.filter(a => a.id === accountId);
  if (!account) { res.status(404).json({ error: "Account not found" }); return; }

  // Opening balance: all posted entries BEFORE fromDate
  let openingDebit = 0, openingCredit = 0;
  if (fromDate) {
    const obEntries = await db.select({ entryId: journalEntriesTable.id })
      .from(journalEntriesTable)
      .where(and(eq(journalEntriesTable.companyId, companyId), eq(journalEntriesTable.status, "posted"), sql`${journalEntriesTable.entryDate} < ${fromDate}`));
    const obIds = obEntries.map(e => e.entryId);
    if (obIds.length > 0) {
      const obLines = await db.select().from(journalLinesTable)
        .where(and(eq(journalLinesTable.accountId, accountId), sql`${journalLinesTable.journalEntryId} = ANY(${sql.raw(`ARRAY[${obIds.join(",")}]::int[]`)})`));
      openingDebit  = obLines.reduce((s, l) => s + parseFloat(l.debit  ?? "0"), 0);
      openingCredit = obLines.reduce((s, l) => s + parseFloat(l.credit ?? "0"), 0);
    }
  }
  const openingBalance = openingDebit - openingCredit;

  // Period entries
  const entries = await db.select({ entryId: journalEntriesTable.id, entryDate: journalEntriesTable.entryDate, reference: journalEntriesTable.refNumber, description: journalEntriesTable.description })
    .from(journalEntriesTable)
    .where(and(
      eq(journalEntriesTable.companyId, companyId),
      eq(journalEntriesTable.status, "posted"),
      ...(fromDate ? [sql`${journalEntriesTable.entryDate} >= ${fromDate}`] : []),
      ...(toDate   ? [sql`${journalEntriesTable.entryDate} <= ${toDate}`]   : []),
    ))
    .orderBy(asc(journalEntriesTable.entryDate), asc(journalEntriesTable.id));

  const entryIds = entries.map(e => e.entryId);
  let lines: any[] = [];
  if (entryIds.length > 0) {
    lines = await db.select().from(journalLinesTable)
      .where(and(eq(journalLinesTable.accountId, accountId), sql`${journalLinesTable.journalEntryId} = ANY(${sql.raw(`ARRAY[${entryIds.join(",")}]::int[]`)})`));
  }

  const linesByEntry: Record<number, typeof lines[0]> = {};
  for (const l of lines) linesByEntry[l.journalEntryId] = l;

  let running = openingBalance;
  const transactions = entries
    .filter(e => linesByEntry[e.entryId])
    .map(e => {
      const l = linesByEntry[e.entryId];
      const debit  = parseFloat(l.debit  ?? "0");
      const credit = parseFloat(l.credit ?? "0");
      running += debit - credit;
      return { journalEntryId: e.entryId, date: e.entryDate, reference: e.reference, description: e.description || l.description, debit: +debit.toFixed(2), credit: +credit.toFixed(2), balance: +running.toFixed(2) };
    });

  res.json({
    account: { id: account.id, code: account.code, name: account.name, type: account.type, subType: account.subType },
    accounts: accounts.map(a => ({ id: a.id, code: a.code, name: a.name, type: a.type })),
    openingBalance: +openingBalance.toFixed(2),
    closingBalance: +running.toFixed(2),
    transactions,
  });
});

// ─── Cash Flow Statement (Indirect Method) ────────────────────────────────────

router.get("/cash-flow", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;

  const companyId = req.session.companyId!;
  const fromDate  = (req.query.from as string) || null;
  const toDate    = (req.query.to   as string) || null;

  if (!fromDate || !toDate) {
    res.status(400).json({ error: "from and to dates are required" });
    return;
  }

  await ensureAccountsSeeded(companyId);

  const accounts = await db.select()
    .from(accountsTable)
    .where(and(eq(accountsTable.companyId, companyId), eq(accountsTable.isActive, true)))
    .orderBy(asc(accountsTable.code));

  const byCode = (code: string) => accounts.find(a => a.code === code);

  // ── Period entries (fromDate..toDate inclusive) ──────────────────────────
  const periodEntries = await db.select({ entryId: journalEntriesTable.id })
    .from(journalEntriesTable)
    .where(and(
      eq(journalEntriesTable.companyId, companyId),
      sql`${journalEntriesTable.status} IN ('posted','reversed')`,
      sql`${journalEntriesTable.entryDate} >= ${fromDate}`,
      sql`${journalEntriesTable.entryDate} <= ${toDate}`,
    ));
  const periodIds = periodEntries.map(e => e.entryId);

  // ── Pre-period entries (before fromDate) — for opening cash balance ──────
  const preEntries = await db.select({ entryId: journalEntriesTable.id })
    .from(journalEntriesTable)
    .where(and(
      eq(journalEntriesTable.companyId, companyId),
      sql`${journalEntriesTable.status} IN ('posted','reversed')`,
      sql`${journalEntriesTable.entryDate} < ${fromDate}`,
    ));
  const preIds = preEntries.map(e => e.entryId);

  // Build debit/credit movement maps
  const periodMov: Record<number, { debit: number; credit: number }> = {};
  if (periodIds.length > 0) {
    const lines = await db.select().from(journalLinesTable)
      .where(sql`${journalLinesTable.journalEntryId} = ANY(${sql.raw(`ARRAY[${periodIds.join(",")}]::int[]`)})`);
    for (const l of lines) {
      if (!periodMov[l.accountId]) periodMov[l.accountId] = { debit: 0, credit: 0 };
      periodMov[l.accountId].debit  += parseFloat(l.debit  ?? "0");
      periodMov[l.accountId].credit += parseFloat(l.credit ?? "0");
    }
  }

  const preMov: Record<number, { debit: number; credit: number }> = {};
  if (preIds.length > 0) {
    const lines = await db.select().from(journalLinesTable)
      .where(sql`${journalLinesTable.journalEntryId} = ANY(${sql.raw(`ARRAY[${preIds.join(",")}]::int[]`)})`);
    for (const l of lines) {
      if (!preMov[l.accountId]) preMov[l.accountId] = { debit: 0, credit: 0 };
      preMov[l.accountId].debit  += parseFloat(l.debit  ?? "0");
      preMov[l.accountId].credit += parseFloat(l.credit ?? "0");
    }
  }

  // CF impact for a balance sheet account over the period.
  // credit − debit is positive for:
  //   assets:     asset decreased → cash inflow
  //   liabilities: liability increased → cash inflow
  //   equity:     equity increased → cash inflow
  const cfBs = (code: string): number => {
    const acct = byCode(code);
    if (!acct) return 0;
    const m = periodMov[acct.id] ?? { debit: 0, credit: 0 };
    return +(m.credit - m.debit).toFixed(2);
  };

  // Asset balance up to a given movement map (debit − credit for asset accounts)
  const assetBal = (code: string, mov: typeof preMov): number => {
    const acct = byCode(code);
    if (!acct) return 0;
    const m = mov[acct.id] ?? { debit: 0, credit: 0 };
    return +(m.debit - m.credit).toFixed(2);
  };

  // ── Net Profit ─────────────────────────────────────────────────────────────
  let totalRevenue = 0, totalExpense = 0, depreciation = 0;
  for (const acct of accounts) {
    const m = periodMov[acct.id] ?? { debit: 0, credit: 0 };
    if (acct.type === "revenue") {
      totalRevenue += m.credit - m.debit;
    } else if (acct.type === "expense") {
      const exp = m.debit - m.credit;
      if (acct.code === "6700") depreciation = exp;
      totalExpense += exp;
    }
  }
  const netProfit            = +(totalRevenue - totalExpense).toFixed(2);
  const addBackDepreciation  = +depreciation.toFixed(2);

  // ── Working Capital Changes ─────────────────────────────────────────────────
  const wc = {
    changeAR:               cfBs("1100"),
    changeOtherReceivables: cfBs("1120"),
    changeGstInput:         cfBs("1110"),
    changeInventory:        cfBs("1200"),
    changePrepayments:      cfBs("1300"),
    changeDeposits:         cfBs("1400"),
    changeAP:               cfBs("2000"),
    changeGstOutput:        cfBs("2010"),
    changeAccruals:         cfBs("2020"),
    changeStaffPayable:     cfBs("2040"),
    changeCPF:              cfBs("2050"),
  };
  const totalWC     = +Object.values(wc).reduce((s, v) => s + v, 0).toFixed(2);
  const netOperating = +(netProfit + addBackDepreciation + totalWC).toFixed(2);

  // ── Investing Activities ────────────────────────────────────────────────────
  const investing = {
    equipment:  cfBs("1500"),
    furniture:  cfBs("1600"),
    renovation: cfBs("1700"),
  };
  const netInvesting = +Object.values(investing).reduce((s, v) => s + v, 0).toFixed(2);

  // ── Financing Activities ────────────────────────────────────────────────────
  const financing = {
    directorsLoan: cfBs("2100"),
    bankLoan:      cfBs("2200"),
    shareCapital:  cfBs("3000"),
  };
  const netFinancing = +Object.values(financing).reduce((s, v) => s + v, 0).toFixed(2);

  // ── Cash Reconciliation ─────────────────────────────────────────────────────
  const netChange   = +(netOperating + netInvesting + netFinancing).toFixed(2);
  const cashCodes   = ["1000", "1010", "1020", "1030"];
  const openingCash = +cashCodes.reduce((s, c) => s + assetBal(c, preMov), 0).toFixed(2);
  const closingCash = +(openingCash + netChange).toFixed(2);

  res.json({
    period: { from: fromDate, to: toDate },
    netProfit,
    addBackDepreciation,
    workingCapital: wc,
    totalWorkingCapitalChange: totalWC,
    netOperating,
    investing,
    netInvesting,
    financing,
    netFinancing,
    netChange,
    openingCash,
    closingCash,
  });
});

// ─── GST Input / Output Tax Listing ─────────────────────────────────────────

router.get("/gst-io-listing", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;

  const companyId = req.session.companyId!;
  const fromDate  = (req.query.from as string) || null;
  const toDate    = (req.query.to   as string) || null;

  if (!fromDate || !toDate) {
    res.status(400).json({ error: "from and to dates are required" });
    return;
  }

  try {
    const [company]  = await db.select().from(companiesTable).where(eq(companiesTable.id, companyId)).limit(1);
    const [settings] = await db.select().from(settingsTable).where(eq(settingsTable.companyId, companyId)).limit(1);
    const gstRate    = parseFloat(settings?.gstRate ?? "9");

    // ── Output Tax: confirmed/paid invoices in period ──────────────────────
    const invRows = await db.select({
      id:             invoicesTable.id,
      invNumber:      invoicesTable.invNumber,
      customerName:   invoicesTable.customerName,
      issueDate:      invoicesTable.issueDate,
      createdAt:      invoicesTable.createdAt,
      subtotal:       invoicesTable.subtotal,
      discountAmount: invoicesTable.discountAmount,
      tax:            invoicesTable.tax,
      totalAmount:    invoicesTable.totalAmount,
      status:         invoicesTable.status,
    }).from(invoicesTable).where(and(
      eq(invoicesTable.companyId, companyId),
      sql`${invoicesTable.status} NOT IN ('draft','void')`,
      sql`COALESCE(${invoicesTable.issueDate}, to_char(${invoicesTable.createdAt},'YYYY-MM-DD')) >= ${fromDate}`,
      sql`COALESCE(${invoicesTable.issueDate}, to_char(${invoicesTable.createdAt},'YYYY-MM-DD')) <= ${toDate}`,
    )).orderBy(asc(invoicesTable.issueDate), asc(invoicesTable.id));

    const outputLines = invRows.map(r => {
      const taxableAmt = +(parseFloat(r.subtotal ?? "0") - parseFloat(r.discountAmount ?? "0")).toFixed(2);
      const gstAmt     = +parseFloat(r.tax ?? "0").toFixed(2);
      const totalAmt   = +parseFloat(r.totalAmount ?? "0").toFixed(2);
      const date       = r.issueDate ?? r.createdAt?.toISOString().slice(0, 10) ?? "";
      return {
        date, docNo: r.invNumber ?? "", party: r.customerName ?? "",
        taxType: gstAmt > 0 ? "SR" : "ZR" as "SR" | "ZR",
        taxableAmt, gstAmt, totalAmt, status: r.status ?? "",
      };
    });

    // ── Input Tax: vendor invoices in period ───────────────────────────────
    const viRows = await db.select({
      id:          vendorInvoicesTable.id,
      piNumber:    vendorInvoicesTable.piNumber,
      vendorName:  vendorInvoicesTable.vendorName,
      piDate:      vendorInvoicesTable.piDate,
      createdAt:   vendorInvoicesTable.createdAt,
      totalAmount: vendorInvoicesTable.totalAmount,
      currency:    vendorInvoicesTable.currency,
    }).from(vendorInvoicesTable).where(and(
      eq(vendorInvoicesTable.companyId, companyId),
      sql`COALESCE(${vendorInvoicesTable.piDate}, to_char(${vendorInvoicesTable.createdAt},'YYYY-MM-DD')) >= ${fromDate}`,
      sql`COALESCE(${vendorInvoicesTable.piDate}, to_char(${vendorInvoicesTable.createdAt},'YYYY-MM-DD')) <= ${toDate}`,
    )).orderBy(asc(vendorInvoicesTable.piDate), asc(vendorInvoicesTable.id));

    // Vendor GST status lookup
    const allVendors = await db.select({ name: vendorsTable.name, gstRegistered: vendorsTable.gstRegistered, country: vendorsTable.country })
      .from(vendorsTable).where(eq(vendorsTable.companyId, companyId));
    const vendorMap = new Map(allVendors.map(v => [v.name?.toLowerCase() ?? "", v]));

    const inputLines = viRows.map(r => {
      const totalAmt   = +parseFloat(r.totalAmount ?? "0").toFixed(2);
      const date       = r.piDate ?? r.createdAt?.toISOString().slice(0, 10) ?? "";
      const vendor     = vendorMap.get((r.vendorName ?? "").toLowerCase());
      const isOverseas = vendor?.country && vendor.country.toLowerCase() !== "singapore";
      const isReg      = !!vendor?.gstRegistered;
      const hasGst     = !isOverseas && isReg && (r.currency ?? "SGD") === "SGD";
      const gstAmt     = hasGst ? +(totalAmt * gstRate / (100 + gstRate)).toFixed(2) : 0;
      const taxableAmt = hasGst ? +(totalAmt - gstAmt).toFixed(2) : totalAmt;
      const taxType    = hasGst ? "TX" : (isOverseas ? "NR" : "EP");
      return { date, docNo: r.piNumber ?? "", party: r.vendorName ?? "", taxType, taxableAmt, gstAmt, totalAmt, currency: r.currency ?? "SGD" };
    });

    // ── Summary ────────────────────────────────────────────────────────────
    const srLines   = outputLines.filter(l => l.taxType === "SR");
    const outputSR  = srLines.reduce((s, l) => s + l.taxableAmt, 0);
    const outGst    = srLines.reduce((s, l) => s + l.gstAmt, 0);
    const outputZR  = outputLines.filter(l => l.taxType === "ZR").reduce((s, l) => s + l.taxableAmt, 0);
    const txLines   = inputLines.filter(l => l.taxType === "TX");
    const inputTX   = txLines.reduce((s, l) => s + l.taxableAmt, 0);
    const inGst     = txLines.reduce((s, l) => s + l.gstAmt, 0);

    res.json({
      period:  { from: fromDate, to: toDate },
      company: { name: company?.name ?? "", gstRegistrationNo: company?.registrationNo ?? "", address: company?.address ?? "" },
      gstRate,
      outputLines,
      inputLines,
      summary: {
        outputSR:    +outputSR.toFixed(2),
        outputSRGst: +outGst.toFixed(2),
        outputZR:    +outputZR.toFixed(2),
        inputTX:     +inputTX.toFixed(2),
        inputTXGst:  +inGst.toFixed(2),
        netGst:      +(outGst - inGst).toFixed(2),
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to generate GST IO listing" });
  }
});

// ─── IRAS Audit File (IAF) ────────────────────────────────────────────────────

router.get("/iaf", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  if (!(await requireSingapore(req, res))) return;

  const companyId = req.session.companyId!;
  const fromDate  = (req.query.from as string) || null;
  const toDate    = (req.query.to   as string) || null;

  if (!fromDate || !toDate) {
    res.status(400).json({ error: "from and to dates are required" });
    return;
  }

  try {
  await ensureAccountsSeeded(companyId);

  // ── Company + settings ───────────────────────────────────────────────────
  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, companyId)).limit(1);
  const [settings] = await db.select().from(settingsTable).where(eq(settingsTable.companyId, companyId)).limit(1);
  const gstRate = parseFloat(settings?.gstRate ?? "9");

  // ── SA: confirmed invoices in period ────────────────────────────────────
  const invoices = await db.select().from(invoicesTable)
    .where(and(
      eq(invoicesTable.companyId, companyId),
      sql`${invoicesTable.status} NOT IN ('draft','void')`,
      sql`COALESCE(${invoicesTable.issueDate}, TO_CHAR(${invoicesTable.createdAt}, 'YYYY-MM-DD')) >= ${fromDate}`,
      sql`COALESCE(${invoicesTable.issueDate}, TO_CHAR(${invoicesTable.createdAt}, 'YYYY-MM-DD')) <= ${toDate}`,
    ))
    .orderBy(asc(invoicesTable.issueDate));

  // ── PA: vendor invoices in period ────────────────────────────────────────
  const vendorInvs = await db.select().from(vendorInvoicesTable)
    .where(and(
      eq(vendorInvoicesTable.companyId, companyId),
      sql`COALESCE(${vendorInvoicesTable.piDate}, TO_CHAR(${vendorInvoicesTable.createdAt}, 'YYYY-MM-DD')) >= ${fromDate}`,
      sql`COALESCE(${vendorInvoicesTable.piDate}, TO_CHAR(${vendorInvoicesTable.createdAt}, 'YYYY-MM-DD')) <= ${toDate}`,
    ))
    .orderBy(asc(vendorInvoicesTable.piDate));

  // vendor GST lookup by name (best-effort)
  const allVendors = await db.select().from(vendorsTable).where(eq(vendorsTable.companyId, companyId));
  const vendorMap = new Map(allVendors.map(v => [v.name.toLowerCase().trim(), v]));

  // ── GA: posted journal entries + lines in period ────────────────────────
  const entries = await db.select().from(journalEntriesTable)
    .where(and(
      eq(journalEntriesTable.companyId, companyId),
      sql`${journalEntriesTable.status} IN ('posted','reversed')`,
      sql`${journalEntriesTable.entryDate} >= ${fromDate}`,
      sql`${journalEntriesTable.entryDate} <= ${toDate}`,
    ))
    .orderBy(asc(journalEntriesTable.entryDate));

  const entryIds = entries.map(e => e.id);
  let jLines: { journalEntryId: number; accountId: number; debit: string | null; credit: string | null; description: string | null }[] = [];
  if (entryIds.length > 0) {
    jLines = await db.select({
      journalEntryId: journalLinesTable.journalEntryId,
      accountId:      journalLinesTable.accountId,
      debit:          journalLinesTable.debit,
      credit:         journalLinesTable.credit,
      description:    journalLinesTable.description,
    }).from(journalLinesTable)
      .where(sql`${journalLinesTable.journalEntryId} = ANY(${sql.raw(`ARRAY[${entryIds.join(",")}]::int[]`)})`);
  }

  const accounts = await db.select().from(accountsTable).where(eq(accountsTable.companyId, companyId));
  const accountMap = new Map(accounts.map(a => [a.id, a]));
  const entryMap   = new Map(entries.map(e => [e.id, e]));

  // ── Build IAF text ──────────────────────────────────────────────────────
  const today    = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const pFrom    = fromDate.replace(/-/g, "");
  const pTo      = toDate.replace(/-/g, "");
  const gstRegNo = company.registrationNo || "NA";

  const safe    = (s: string | null | undefined) => (s || "").replace(/[\|]/g, " ").replace(/\r?\n/g, " ").trim() || "NA";
  const fmtD    = (d: string | null | undefined) => (d || "").replace(/-/g, "").slice(0, 8) || today;
  const fmtA    = (n: number) => n.toFixed(2);
  const acctType = (t: string | null | undefined) => {
    switch (t) {
      case "asset":     return "A";
      case "liability": return "L";
      case "equity":    return "E";
      case "revenue":   return "I";
      case "expense":   return "X";
      default:          return "A";
    }
  };

  const lines: string[] = [];
  lines.push(`AF|${today}|${safe(company.name)}|${safe(gstRegNo)}|${pFrom}|${pTo}|SGD|GST|`);

  // SA records
  let saCount = 0, saNet = 0, saGst = 0;
  for (const inv of invoices) {
    const docDate = fmtD(inv.issueDate ?? inv.createdAt?.toISOString().slice(0, 10) ?? null);
    const total   = parseFloat(inv.totalAmount ?? "0");
    const gst     = parseFloat(inv.tax ?? "0");
    const net     = total - gst;
    const currency = inv.currency || "SGD";
    const txCode  = gst > 0.005 ? "SR" : "ZR";
    lines.push(`SA|SI|${docDate}|${safe(inv.invNumber)}|${safe(inv.customerName)}|NA|${txCode}|${fmtA(net)}|${fmtA(gst)}|${fmtA(net)}|${fmtA(gst)}|${currency}|1.00|`);
    saCount++; saNet += net; saGst += gst;
  }

  // PA records
  let paCount = 0, paNet = 0, paGst = 0;
  for (const vi of vendorInvs) {
    const docDate = fmtD(vi.piDate ?? vi.createdAt?.toISOString().slice(0, 10) ?? null);
    const gross   = parseFloat(vi.totalAmount ?? "0");
    const vendor  = vendorMap.get(vi.vendorName.toLowerCase().trim());
    let net: number, gst: number, txCode: string, vendorGstNo: string;
    if (vendor?.gstRegistered) {
      net = gross / (1 + gstRate / 100);
      gst = gross - net;
      txCode     = "SR";
      vendorGstNo = safe(vendor.gstNo);
    } else {
      net = gross; gst = 0;
      txCode     = "NR";
      vendorGstNo = "NA";
    }
    lines.push(`PA|PI|${docDate}|${safe(vi.piNumber)}|${safe(vi.vendorName)}|${vendorGstNo}|${txCode}|${fmtA(net)}|${fmtA(gst)}|${fmtA(net)}|${fmtA(gst)}|SGD|1.00|`);
    paCount++; paNet += net; paGst += gst;
  }

  // GA records
  let gaCount = 0, totalDebit = 0, totalCredit = 0;
  for (const jl of jLines) {
    const entry   = entryMap.get(jl.journalEntryId);
    const account = accountMap.get(jl.accountId);
    if (!entry || !account) continue;
    const debit  = parseFloat(jl.debit  ?? "0");
    const credit = parseFloat(jl.credit ?? "0");
    const docDate = fmtD(entry.entryDate);
    const desc    = safe(jl.description || entry.description || "");
    lines.push(`GA|${docDate}|${safe(account.code)}|${safe(account.name)}|${safe(entry.refNumber ?? "")}|${desc}|${fmtA(debit)}|${fmtA(credit)}|${acctType(account.type)}|`);
    gaCount++; totalDebit += debit; totalCredit += credit;
  }

  // Footer summary
  lines.push(`AF|${saCount}|${fmtA(saNet)}|${fmtA(saGst)}|${paCount}|${fmtA(paNet)}|${fmtA(paGst)}|${gaCount}|${fmtA(totalDebit)}|${fmtA(totalCredit)}|`);

  res.json({
    saCount,
    paCount,
    gaCount,
    saNet:  +saNet.toFixed(2),
    saGst:  +saGst.toFixed(2),
    paNet:  +paNet.toFixed(2),
    paGst:  +paGst.toFixed(2),
    filename: `IAF_${gstRegNo}_${pFrom}_${pTo}.txt`,
    content: lines.join("\r\n"),
  });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to generate IAF" });
  }
});

// ─── AR: Open invoices for a customer ──────────────────────────────────────

router.get("/ar/customer-invoices", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  const companyId = req.session.companyId!;
  const customerName = (req.query.customerName as string) || "";
  if (!customerName.trim()) { res.status(400).json({ error: "customerName required" }); return; }

  const rows = await db.select({
    id: invoicesTable.id, invNumber: invoicesTable.invNumber,
    issueDate: invoicesTable.issueDate, totalAmount: invoicesTable.totalAmount,
    currency: invoicesTable.currency, paymentTerms: invoicesTable.paymentTerms, status: invoicesTable.status,
  })
  .from(invoicesTable)
  .where(and(
    eq(invoicesTable.companyId, companyId),
    sql`lower(${invoicesTable.customerName}) = lower(${customerName})`,
    sql`${invoicesTable.status} NOT IN ('draft', 'void', 'paid')`,
  ))
  .orderBy(asc(invoicesTable.issueDate), asc(invoicesTable.id));

  const result = await Promise.all(rows.map(async (inv) => {
    const payments = await db.select({ amount: invoicePaymentsTable.amount })
      .from(invoicePaymentsTable).where(eq(invoicePaymentsTable.invoiceId, inv.id));
    const paidAmount = payments.reduce((s, p) => s + parseFloat(p.amount ?? "0"), 0);
    const total = parseFloat(inv.totalAmount ?? "0");
    return {
      id: inv.id, invNumber: inv.invNumber, issueDate: inv.issueDate,
      totalAmount: +total.toFixed(2), paidAmount: +paidAmount.toFixed(2),
      outstanding: +Math.max(0, total - paidAmount).toFixed(2),
      currency: inv.currency, paymentTerms: inv.paymentTerms, status: inv.status,
    };
  }));

  res.json({ invoices: result });
});

// ─── AR: Customer deposit balance ──────────────────────────────────────────

router.get("/ar/customer-deposit", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  const companyId = req.session.companyId!;
  const customerName = (req.query.customerName as string) || "";
  if (!customerName.trim()) { res.status(400).json({ error: "customerName required" }); return; }

  const deposits = await db.select().from(customerDepositsTable)
    .where(and(
      eq(customerDepositsTable.companyId, companyId),
      sql`lower(${customerDepositsTable.customerName}) = lower(${customerName})`,
      eq(customerDepositsTable.status, "available"),
    ))
    .orderBy(asc(customerDepositsTable.paymentDate));

  const totalBalance = deposits.reduce((s, d) => {
    return s + parseFloat(d.totalAmount) - parseFloat(d.appliedAmount ?? "0");
  }, 0);

  res.json({
    deposits: deposits.map(d => ({
      id: d.id,
      totalAmount: parseFloat(d.totalAmount),
      appliedAmount: parseFloat(d.appliedAmount ?? "0"),
      available: parseFloat(d.totalAmount) - parseFloat(d.appliedAmount ?? "0"),
      currency: d.currency, paymentDate: d.paymentDate, bankRef: d.bankRef,
    })),
    totalBalance: +totalBalance.toFixed(2),
  });
});

// ─── AR: Bulk payment (knock-off) ──────────────────────────────────────────

router.post("/ar/bulk-payment", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;

  const companyId = req.session.companyId!;
  const userId = req.session.userId!;
  const { customerName, paymentDate, paymentMethod, bankRef, totalAmount, allocations, notes } = req.body;

  if (!customerName || !paymentDate || !allocations || !Array.isArray(allocations)) {
    res.status(400).json({ error: "customerName, paymentDate, and allocations are required" }); return;
  }

  const totalNum = parseFloat(String(totalAmount || 0));
  const allocTotal = (allocations as any[]).reduce((s, a) => s + parseFloat(String(a.amount || 0)), 0);
  const excess = Math.max(0, totalNum - allocTotal);
  const isCash = (paymentMethod || "bank_transfer") === "cash";

  await ensureAccountsSeeded(companyId);

  const [dep2035] = await db.select({ id: accountsTable.id }).from(accountsTable)
    .where(and(eq(accountsTable.companyId, companyId), eq(accountsTable.code, "2035"))).limit(1);
  if (!dep2035) {
    await db.insert(accountsTable).values({
      companyId, code: "2035", name: "Customer Deposits / Advance Receipts",
      type: "liability" as any, subType: "current_liability", isActive: true, isSystem: false,
    });
  }

  const getAcct = async (code: string) => {
    const [a] = await db.select().from(accountsTable)
      .where(and(eq(accountsTable.companyId, companyId), eq(accountsTable.code, code))).limit(1);
    return a ?? null;
  };

  const [cashAcct, arAcct, depositAcct] = await Promise.all([
    getAcct(isCash ? "1000" : "1010"),
    getAcct("1100"),
    getAcct("2035"),
  ]);

  const [co] = await db.select({ country: companiesTable.country }).from(companiesTable).where(eq(companiesTable.id, companyId)).limit(1);
  const isSgp = co?.country?.toLowerCase() === "singapore";

  const processedPayments: Array<{ paymentId: number; invoiceId: number; invNumber: string; amount: number }> = [];

  for (const alloc of allocations as any[]) {
    const invId = parseInt(String(alloc.invoiceId));
    const allocAmt = parseFloat(String(alloc.amount));
    if (isNaN(invId) || allocAmt <= 0.004) continue;

    const [inv] = await db.select().from(invoicesTable)
      .where(and(eq(invoicesTable.id, invId), eq(invoicesTable.companyId, companyId))).limit(1);
    if (!inv || inv.status === "void" || inv.status === "draft") continue;

    const [payment] = await db.insert(invoicePaymentsTable).values({
      companyId, invoiceId: invId, paymentDate,
      amount: allocAmt.toFixed(2),
      reference: bankRef || null,
      paymentMethod: paymentMethod || "bank_transfer",
      notes: notes || null,
      createdBy: userId,
    }).returning();

    const allPmts = await db.select({ amount: invoicePaymentsTable.amount })
      .from(invoicePaymentsTable).where(eq(invoicePaymentsTable.invoiceId, invId));
    const paidTotal = allPmts.reduce((s, p) => s + parseFloat(p.amount ?? "0"), 0);
    const invTotal = parseFloat(inv.totalAmount ?? "0");
    let newStatus = inv.status;
    if (paidTotal >= invTotal - 0.005) newStatus = "paid";
    else if (paidTotal > 0.004) newStatus = "partial";
    if (newStatus !== inv.status) {
      await db.update(invoicesTable).set({ status: newStatus }).where(eq(invoicesTable.id, invId));
    }

    processedPayments.push({ paymentId: payment.id, invoiceId: invId, invNumber: inv.invNumber, amount: allocAmt });
  }

  // Create customer deposit record for excess
  let depositRecord: any = null;
  if (excess > 0.004) {
    const [dep] = await db.insert(customerDepositsTable).values({
      companyId, customerName, currency: "SGD",
      totalAmount: excess.toFixed(2), appliedAmount: "0", status: "available",
      paymentDate, paymentMethod: paymentMethod || "bank_transfer",
      bankRef: bankRef || null,
      notes: `Excess from bulk payment${notes ? `: ${notes}` : ""}`,
      createdBy: userId,
    }).returning();
    depositRecord = dep;
  }

  // Post JE
  if (isSgp && cashAcct && arAcct && processedPayments.length > 0) {
    const invNumbers = processedPayments.map(p => p.invNumber).join(", ");
    const ref = bankRef ? ` (Ref: ${bankRef})` : "";

    if (isCash) {
      for (const p of processedPayments) {
        const desc = `Cash receipt — Invoice ${p.invNumber} — ${customerName}${ref}`;
        try {
          const [entry] = await db.insert(journalEntriesTable).values({
            companyId, entryDate: paymentDate, description: desc,
            refType: "invoice_payment", refId: p.paymentId, refNumber: p.invNumber,
            status: "posted", createdBy: userId,
          }).returning();
          await db.insert(journalLinesTable).values([
            { journalEntryId: entry.id, accountId: cashAcct.id, description: desc, debit: p.amount.toFixed(2), credit: "0.00" },
            { journalEntryId: entry.id, accountId: arAcct.id,   description: desc, debit: "0.00", credit: p.amount.toFixed(2) },
          ]);
        } catch {}
      }
      if (excess > 0.004 && depositAcct && depositRecord) {
        const desc = `Cash receipt — Customer deposit — ${customerName}${ref}`;
        try {
          const [entry] = await db.insert(journalEntriesTable).values({
            companyId, entryDate: paymentDate, description: desc,
            refType: "customer_deposit", refId: depositRecord.id, refNumber: `DEP-${depositRecord.id}`,
            status: "posted", createdBy: userId,
          }).returning();
          await db.insert(journalLinesTable).values([
            { journalEntryId: entry.id, accountId: cashAcct.id,    description: desc, debit: excess.toFixed(2), credit: "0.00" },
            { journalEntryId: entry.id, accountId: depositAcct.id, description: desc, debit: "0.00", credit: excess.toFixed(2) },
          ]);
          await db.update(customerDepositsTable).set({ journalEntryId: entry.id }).where(eq(customerDepositsTable.id, depositRecord.id));
        } catch {}
      }
    } else {
      const desc = `Payment received — ${customerName} — ${invNumbers}${ref}`;
      try {
        const [entry] = await db.insert(journalEntriesTable).values({
          companyId, entryDate: paymentDate, description: desc,
          refType: "invoice_payment", refId: processedPayments[0]?.paymentId ?? 0, refNumber: invNumbers,
          status: "posted", createdBy: userId,
        }).returning();
        const lines: any[] = [
          { journalEntryId: entry.id, accountId: cashAcct.id, description: desc, debit: totalNum.toFixed(2), credit: "0.00" },
        ];
        if (allocTotal > 0.004) {
          lines.push({ journalEntryId: entry.id, accountId: arAcct.id, description: `AR settlement — ${invNumbers}`, debit: "0.00", credit: allocTotal.toFixed(2) });
        }
        if (excess > 0.004 && depositAcct && depositRecord) {
          lines.push({ journalEntryId: entry.id, accountId: depositAcct.id, description: `Customer deposit — ${customerName}`, debit: "0.00", credit: excess.toFixed(2) });
          await db.update(customerDepositsTable).set({ journalEntryId: entry.id }).where(eq(customerDepositsTable.id, depositRecord.id));
        }
        await db.insert(journalLinesTable).values(lines);
      } catch {}
    }
  }

  logAudit({ req, action: "ar:bulk-payment", entityType: "invoice", entityId: 0,
    entityLabel: `${customerName} — ${processedPayments.length} invoices`,
    details: { totalAmount: totalNum, allocated: allocTotal, excess } });

  res.json({
    processed: processedPayments.length,
    totalAllocated: +allocTotal.toFixed(2),
    excess: +excess.toFixed(2),
    depositId: depositRecord?.id ?? null,
    payments: processedPayments,
  });
});

// ─── AR: Apply existing customer credit to invoices ────────────────────────

router.post("/ar/apply-credit", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;

  const companyId = req.session.companyId!;
  const userId = req.session.userId!;
  const { depositId, applyDate, allocations } = req.body;

  if (!depositId || !allocations || !Array.isArray(allocations)) {
    res.status(400).json({ error: "depositId and allocations are required" }); return;
  }

  const [deposit] = await db.select().from(customerDepositsTable)
    .where(and(eq(customerDepositsTable.id, parseInt(String(depositId))), eq(customerDepositsTable.companyId, companyId))).limit(1);
  if (!deposit) { res.status(404).json({ error: "Deposit not found" }); return; }

  const available = parseFloat(deposit.totalAmount) - parseFloat(deposit.appliedAmount ?? "0");
  const applyTotal = (allocations as any[]).reduce((s, a) => s + parseFloat(String(a.amount || 0)), 0);

  if (applyTotal > available + 0.004) {
    res.status(400).json({ error: `Apply amount exceeds available balance of ${available.toFixed(2)}` }); return;
  }

  const date = applyDate || new Date().toISOString().split("T")[0];
  const processedPayments: Array<{ paymentId: number; invoiceId: number; invNumber: string; amount: number }> = [];

  for (const alloc of allocations as any[]) {
    const invId = parseInt(String(alloc.invoiceId));
    const allocAmt = parseFloat(String(alloc.amount));
    if (isNaN(invId) || allocAmt <= 0.004) continue;

    const [inv] = await db.select().from(invoicesTable)
      .where(and(eq(invoicesTable.id, invId), eq(invoicesTable.companyId, companyId))).limit(1);
    if (!inv || inv.status === "void" || inv.status === "draft") continue;

    const [payment] = await db.insert(invoicePaymentsTable).values({
      companyId, invoiceId: invId, paymentDate: date,
      amount: allocAmt.toFixed(2),
      reference: `DEP-${deposit.id}`,
      paymentMethod: "customer_deposit",
      notes: `Applied from customer credit (DEP-${deposit.id})`,
      createdBy: userId,
    }).returning();

    const allPmts = await db.select({ amount: invoicePaymentsTable.amount }).from(invoicePaymentsTable).where(eq(invoicePaymentsTable.invoiceId, invId));
    const paidTotal = allPmts.reduce((s, p) => s + parseFloat(p.amount ?? "0"), 0);
    const invTotal = parseFloat(inv.totalAmount ?? "0");
    let newStatus = inv.status;
    if (paidTotal >= invTotal - 0.005) newStatus = "paid";
    else if (paidTotal > 0.004) newStatus = "partial";
    if (newStatus !== inv.status) {
      await db.update(invoicesTable).set({ status: newStatus }).where(eq(invoicesTable.id, invId));
    }

    processedPayments.push({ paymentId: payment.id, invoiceId: invId, invNumber: inv.invNumber, amount: allocAmt });
  }

  const newApplied = parseFloat(deposit.appliedAmount ?? "0") + applyTotal;
  const newStatus = newApplied >= parseFloat(deposit.totalAmount) - 0.004 ? "exhausted" : "available";
  await db.update(customerDepositsTable)
    .set({ appliedAmount: newApplied.toFixed(2), status: newStatus })
    .where(eq(customerDepositsTable.id, deposit.id));

  // JE: DR 2035 / CR 1100 per invoice
  const [co] = await db.select({ country: companiesTable.country }).from(companiesTable).where(eq(companiesTable.id, companyId)).limit(1);
  if (co?.country?.toLowerCase() === "singapore") {
    await ensureAccountsSeeded(companyId);
    const getAcct = async (code: string) => {
      const [a] = await db.select().from(accountsTable).where(and(eq(accountsTable.companyId, companyId), eq(accountsTable.code, code))).limit(1);
      return a ?? null;
    };
    const [depositAcct, arAcct] = await Promise.all([getAcct("2035"), getAcct("1100")]);
    if (depositAcct && arAcct) {
      for (const p of processedPayments) {
        const desc = `Credit applied — Invoice ${p.invNumber} — ${deposit.customerName} (DEP-${deposit.id})`;
        try {
          const [entry] = await db.insert(journalEntriesTable).values({
            companyId, entryDate: date, description: desc,
            refType: "invoice_payment", refId: p.paymentId, refNumber: p.invNumber,
            status: "posted", createdBy: userId,
          }).returning();
          await db.insert(journalLinesTable).values([
            { journalEntryId: entry.id, accountId: depositAcct.id, description: desc, debit: p.amount.toFixed(2), credit: "0.00" },
            { journalEntryId: entry.id, accountId: arAcct.id,      description: desc, debit: "0.00", credit: p.amount.toFixed(2) },
          ]);
        } catch {}
      }
    }
  }

  res.json({ processed: processedPayments.length, totalApplied: +applyTotal.toFixed(2), remainingBalance: +(available - applyTotal).toFixed(2) });
});

// ─── AP: Bulk payment to vendor ────────────────────────────────────────────

router.post("/ap/bulk-payment", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;

  const companyId = req.session.companyId!;
  const userId = req.session.userId!;
  const { vendorName, paymentDate, paymentMethod, bankRef, totalAmount, allocations, notes } = req.body;

  if (!vendorName || !paymentDate || !allocations || !Array.isArray(allocations)) {
    res.status(400).json({ error: "vendorName, paymentDate, and allocations are required" }); return;
  }

  const totalNum = parseFloat(String(totalAmount || 0));
  const isCash = (paymentMethod || "bank_transfer") === "cash";

  await ensureAccountsSeeded(companyId);

  const getAcct = async (code: string) => {
    const [a] = await db.select().from(accountsTable)
      .where(and(eq(accountsTable.companyId, companyId), eq(accountsTable.code, code))).limit(1);
    return a ?? null;
  };

  const [cashAcct, apAcct] = await Promise.all([
    getAcct(isCash ? "1000" : "1010"),
    getAcct("2000"),
  ]);

  const [co] = await db.select({ country: companiesTable.country })
    .from(companiesTable).where(eq(companiesTable.id, companyId)).limit(1);
  const isSgp = co?.country?.toLowerCase() === "singapore";

  const processedPayments: Array<{ paymentId: number; vendorInvoiceId: number; piNumber: string; amount: number }> = [];
  let totalPaid = 0;

  for (const alloc of allocations as any[]) {
    const piId = parseInt(String(alloc.vendorInvoiceId));
    const allocAmt = parseFloat(String(alloc.amount));
    if (isNaN(piId) || allocAmt <= 0.004) continue;

    const [pi] = await db.select().from(vendorInvoicesTable)
      .where(and(eq(vendorInvoicesTable.id, piId), eq(vendorInvoicesTable.companyId, companyId))).limit(1);
    if (!pi || pi.status === "paid") continue;

    const [payment] = await db.insert(vendorPaymentsTable).values({
      companyId, vendorInvoiceId: piId, paymentDate,
      amount: allocAmt.toFixed(2),
      reference: bankRef || null,
      paymentMethod: paymentMethod || "bank_transfer",
      notes: notes || null,
      createdBy: userId,
    }).returning();

    const allPmts = await db.select({ amount: vendorPaymentsTable.amount })
      .from(vendorPaymentsTable).where(eq(vendorPaymentsTable.vendorInvoiceId, piId));
    const paidTotal = allPmts.reduce((s, p) => s + parseFloat(p.amount ?? "0"), 0);
    const piTotal = parseFloat(pi.totalAmount ?? "0");
    let newStatus = pi.status;
    if (paidTotal >= piTotal - 0.005 && piTotal > 0) newStatus = "paid";
    else if (paidTotal > 0.004) newStatus = "partial";
    if (newStatus !== pi.status) {
      await db.update(vendorInvoicesTable)
        .set({ paidAmount: paidTotal.toFixed(2), status: newStatus })
        .where(eq(vendorInvoicesTable.id, piId));
    }

    processedPayments.push({ paymentId: payment.id, vendorInvoiceId: piId, piNumber: pi.piNumber, amount: allocAmt });
    totalPaid += allocAmt;
  }

  // Post JE
  if (isSgp && cashAcct && apAcct && processedPayments.length > 0) {
    const piNumbers = processedPayments.map(p => p.piNumber).join(", ");
    const ref = bankRef ? ` (Ref: ${bankRef})` : "";

    if (isCash) {
      for (const p of processedPayments) {
        const desc = `Cash payment — PI ${p.piNumber} — ${vendorName}${ref}`;
        try {
          const [entry] = await db.insert(journalEntriesTable).values({
            companyId, entryDate: paymentDate, description: desc,
            refType: "vendor_payment", refId: p.paymentId, refNumber: p.piNumber,
            status: "posted", createdBy: userId,
          }).returning();
          await db.insert(journalLinesTable).values([
            { journalEntryId: entry.id, accountId: apAcct.id,   description: desc, debit: p.amount.toFixed(2), credit: "0.00" },
            { journalEntryId: entry.id, accountId: cashAcct.id, description: desc, debit: "0.00", credit: p.amount.toFixed(2) },
          ]);
        } catch {}
      }
    } else {
      const desc = `Payment to ${vendorName} — ${piNumbers}${ref}`;
      try {
        const [entry] = await db.insert(journalEntriesTable).values({
          companyId, entryDate: paymentDate, description: desc,
          refType: "vendor_payment", refId: processedPayments[0]?.paymentId ?? 0, refNumber: piNumbers,
          status: "posted", createdBy: userId,
        }).returning();
        await db.insert(journalLinesTable).values([
          { journalEntryId: entry.id, accountId: apAcct.id,   description: `AP settlement — ${piNumbers}`, debit: totalPaid.toFixed(2), credit: "0.00" },
          { journalEntryId: entry.id, accountId: cashAcct.id, description: desc, debit: "0.00", credit: totalNum.toFixed(2) },
        ]);
      } catch {}
    }
  }

  logAudit({ req, action: "ap:bulk-payment", entityType: "vendor_invoice", entityId: 0,
    entityLabel: `${vendorName} — ${processedPayments.length} PIs`,
    details: { totalPaid, pis: processedPayments.length } });

  res.json({ processed: processedPayments.length, totalPaid: +totalPaid.toFixed(2), payments: processedPayments });
});

// ─── AP: Open vendor invoices for a vendor ─────────────────────────────────

router.get("/ap/vendor-invoices", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  const companyId = req.session.companyId!;
  const vendorName = (req.query.vendorName as string) || "";
  if (!vendorName.trim()) { res.status(400).json({ error: "vendorName required" }); return; }

  const rows = await db.select()
    .from(vendorInvoicesTable)
    .where(and(
      eq(vendorInvoicesTable.companyId, companyId),
      sql`lower(${vendorInvoicesTable.vendorName}) = lower(${vendorName})`,
      sql`${vendorInvoicesTable.status} IN ('pending', 'partial')`,
    ))
    .orderBy(asc(vendorInvoicesTable.piDate), asc(vendorInvoicesTable.id));

  res.json({
    invoices: rows.map(r => ({
      id: r.id, piNumber: r.piNumber, piDate: r.piDate,
      totalAmount: parseFloat(r.totalAmount ?? "0"),
      paidAmount: parseFloat(r.paidAmount ?? "0"),
      outstanding: Math.max(0, parseFloat(r.totalAmount ?? "0") - parseFloat(r.paidAmount ?? "0")),
      currency: r.currency, status: r.status,
    })),
  });
});

// ─── Exchange Rate ────────────────────────────────────────────────────────────

/** GET /exchange-rate?currency=USD&date=2025-04-15
 *  Returns the exchange rate from `currency` to SGD on the given date (or latest). */
router.get("/exchange-rate", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const currency = ((req.query.currency as string) || "SGD").toUpperCase();
  const date = (req.query.date as string) || undefined;
  if (currency === "SGD") { res.json({ currency: "SGD", date: date || "latest", rateSGD: 1 }); return; }
  try {
    const rate = await getExchangeRateToSGD(currency, date);
    res.json({ currency, date: date || "latest", rateSGD: parseFloat(rate.toFixed(6)) });
  } catch (e: any) {
    res.status(502).json({ error: `Could not fetch exchange rate: ${e.message}` });
  }
});

/** POST /exchange-rate/backfill
 *  Auto-fills exchange rates for all existing non-SGD records in the current company
 *  that still have the default rate of 1.000000. */
router.post("/exchange-rate/backfill", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  const companyId = req.session.companyId!;
  let updated = 0; let failed = 0; const errors: string[] = [];

  // Vendor invoices
  const vis = await db.select({
    id: vendorInvoicesTable.id, currency: vendorInvoicesTable.currency,
    piDate: vendorInvoicesTable.piDate,
    exchangeRate: (vendorInvoicesTable as any).exchangeRate,
  }).from(vendorInvoicesTable).where(eq(vendorInvoicesTable.companyId, companyId));
  for (const vi of vis) {
    if ((vi.currency ?? "SGD") === "SGD") continue;
    if (parseFloat(vi.exchangeRate ?? "1") !== 1.0) continue; // already set
    try {
      const rate = await getExchangeRateToSGD(vi.currency!, vi.piDate || undefined);
      await db.update(vendorInvoicesTable).set({ exchangeRate: rate.toFixed(6) } as any).where(eq(vendorInvoicesTable.id, vi.id));
      updated++;
    } catch (e: any) { failed++; errors.push(`VI #${vi.id}: ${e.message}`); }
  }

  // Sales invoices
  const invs = await db.select({
    id: invoicesTable.id, currency: invoicesTable.currency,
    issueDate: invoicesTable.issueDate,
    exchangeRate: (invoicesTable as any).exchangeRate,
  }).from(invoicesTable).where(eq(invoicesTable.companyId, companyId));
  for (const inv of invs) {
    if ((inv.currency ?? "SGD") === "SGD") continue;
    if (parseFloat(inv.exchangeRate ?? "1") !== 1.0) continue;
    try {
      const rate = await getExchangeRateToSGD(inv.currency!, inv.issueDate || undefined);
      await db.update(invoicesTable).set({ exchangeRate: rate.toFixed(6) } as any).where(eq(invoicesTable.id, inv.id));
      updated++;
    } catch (e: any) { failed++; errors.push(`INV #${inv.id}: ${e.message}`); }
  }

  // Income records
  const incomes = await db.select({
    id: incomeRecordsTable.id, currency: incomeRecordsTable.currency,
    incomeDate: incomeRecordsTable.incomeDate,
    exchangeRate: (incomeRecordsTable as any).exchangeRate,
  }).from(incomeRecordsTable).where(eq(incomeRecordsTable.companyId, companyId));
  for (const inc of incomes) {
    if ((inc.currency ?? "SGD") === "SGD") continue;
    if (parseFloat(inc.exchangeRate ?? "1") !== 1.0) continue;
    try {
      const rate = await getExchangeRateToSGD(inc.currency!, inc.incomeDate || undefined);
      await db.update(incomeRecordsTable).set({ exchangeRate: rate.toFixed(6) } as any).where(eq(incomeRecordsTable.id, inc.id));
      updated++;
    } catch (e: any) { failed++; errors.push(`INC #${inc.id}: ${e.message}`); }
  }

  res.json({ updated, failed, errors: errors.slice(0, 20) });
});
