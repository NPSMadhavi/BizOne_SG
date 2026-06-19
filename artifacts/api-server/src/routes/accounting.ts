import { Router, type IRouter } from "express";
import { db, accountsTable, journalEntriesTable, journalLinesTable, companiesTable, invoicesTable, vendorInvoicesTable, settingsTable } from "@workspace/db";
import { eq, and, desc, sql, asc } from "drizzle-orm";
import { logAudit } from "../lib/audit.js";
import { DEFAULT_ACCOUNTS, ensureAccountsSeeded } from "../lib/accounts-seed.js";

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

  const box1 = invRows.reduce((s, r) =>
    s + parseFloat(r.subtotal ?? "0") - parseFloat(r.discountAmount ?? "0"), 0);
  const box6 = invRows.reduce((s, r) => s + parseFloat(r.tax ?? "0"), 0);

  // ─ Box 4: taxable purchases from vendor invoices ─
  const viRows = await db.select({
    id:          vendorInvoicesTable.id,
    piNumber:    vendorInvoicesTable.piNumber,
    vendorName:  vendorInvoicesTable.vendorName,
    piDate:      vendorInvoicesTable.piDate,
    totalAmount: vendorInvoicesTable.totalAmount,
    currency:    vendorInvoicesTable.currency,
  })
  .from(vendorInvoicesTable)
  .where(and(
    eq(vendorInvoicesTable.companyId, companyId),
    ...(fromDate ? [sql`COALESCE(${vendorInvoicesTable.piDate}, to_char(${vendorInvoicesTable.createdAt}, 'YYYY-MM-DD')) >= ${fromDate}`] : []),
    ...(toDate   ? [sql`COALESCE(${vendorInvoicesTable.piDate}, to_char(${vendorInvoicesTable.createdAt}, 'YYYY-MM-DD')) <= ${toDate}`]   : []),
  ));

  const box4 = viRows.reduce((s, r) => s + parseFloat(r.totalAmount ?? "0"), 0);

  // ─ Box 7: input tax from GL account 1110 (GST Input Tax Recoverable) ─
  const [gstInputAcct] = await db.select().from(accountsTable)
    .where(and(eq(accountsTable.companyId, companyId), eq(accountsTable.code, "1110"))).limit(1);

  let box7 = 0;
  if (gstInputAcct) {
    const jeWhere = and(
      eq(journalEntriesTable.companyId, companyId),
      eq(journalEntriesTable.status,    "posted"),
      ...(fromDate ? [sql`${journalEntriesTable.entryDate} >= ${fromDate}`] : []),
      ...(toDate   ? [sql`${journalEntriesTable.entryDate} <= ${toDate}`]   : []),
    );
    const entries  = await db.select({ entryId: journalEntriesTable.id }).from(journalEntriesTable).where(jeWhere);
    const entryIds = entries.map(e => e.entryId);
    if (entryIds.length > 0) {
      const lines = await db.select().from(journalLinesTable).where(and(
        eq(journalLinesTable.accountId, gstInputAcct.id),
        sql`${journalLinesTable.journalEntryId} = ANY(${sql.raw(`ARRAY[${entryIds.join(",")}]::int[]`)})`,
      ));
      box7 = lines.reduce((s, l) => s + parseFloat(l.debit ?? "0"), 0);
    }
  }

  const box8 = box6 - box7;

  res.json({
    period:  { from: fromDate, to: toDate },
    company: { name: company?.name, gstRegistrationNo: company?.registrationNo, address: company?.address },
    gstRate,
    box1: parseFloat(box1.toFixed(2)),
    box2: 0,
    box3: 0,
    box4: parseFloat(box4.toFixed(2)),
    box5: 0,
    box6: parseFloat(box6.toFixed(2)),
    box7: parseFloat(box7.toFixed(2)),
    box8: parseFloat(box8.toFixed(2)),
    invoices: invRows.map(r => ({
      id:           r.id,
      invNumber:    r.invNumber,
      customerName: r.customerName,
      issueDate:    r.issueDate,
      netAmount:    parseFloat((parseFloat(r.subtotal ?? "0") - parseFloat(r.discountAmount ?? "0")).toFixed(2)),
      gstAmount:    parseFloat(parseFloat(r.tax ?? "0").toFixed(2)),
      totalAmount:  parseFloat(parseFloat(r.totalAmount ?? "0").toFixed(2)),
      status:       r.status,
    })),
    vendorInvoices: viRows.map(r => ({
      id:          r.id,
      piNumber:    r.piNumber,
      vendorName:  r.vendorName,
      piDate:      r.piDate,
      totalAmount: parseFloat(parseFloat(r.totalAmount ?? "0").toFixed(2)),
      currency:    r.currency,
    })),
  });
});

export default router;
