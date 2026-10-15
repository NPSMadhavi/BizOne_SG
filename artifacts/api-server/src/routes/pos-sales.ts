import { Router, type IRouter } from "express";
import { db, posSalesTable, usersTable, rolesTable, salesPersonsTable } from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { loadAssignedModules } from "../lib/assigned-modules.js";

const router: IRouter = Router();

type Visibility = {
  all: boolean;
  userId: number;
  salesPersonId: number | null;
  salesPersonName: string | null;
};

async function visibilityFor(req: { session: { userId?: number; companyId?: number; isAdmin?: boolean; userRole?: string } }): Promise<Visibility> {
  const userId = req.session.userId!;
  const isAdmin = Boolean(req.session.isAdmin || req.session.userRole === "admin");
  const [user] = await db
    .select({ salesPersonId: usersTable.salesPersonId, roleId: usersTable.roleId })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  let salesPersonName: string | null = null;
  if (user?.salesPersonId) {
    const [person] = await db
      .select({ name: salesPersonsTable.name })
      .from(salesPersonsTable)
      .where(eq(salesPersonsTable.id, user.salesPersonId))
      .limit(1);
    salesPersonName = person?.name ?? null;
  }
  if (isAdmin) {
    return { all: true, userId, salesPersonId: user?.salesPersonId ?? null, salesPersonName };
  }
  const [role] = user?.roleId
    ? await db.select({ name: rolesTable.name }).from(rolesTable).where(eq(rolesTable.id, user.roleId)).limit(1)
    : [];
  const scoped = Boolean(user?.salesPersonId) || /sales/i.test(role?.name || "");
  return {
    all: !scoped,
    userId,
    salesPersonId: user?.salesPersonId ?? null,
    salesPersonName,
  };
}

function owns(row: { salesPersonId: number | null; createdBy: number | null }, visibility: Visibility) {
  if (visibility.all) return true;
  if (visibility.salesPersonId && row.salesPersonId === visibility.salesPersonId) return true;
  if (row.createdBy === visibility.userId) return true;
  return false;
}

function toRecord(row: typeof posSalesTable.$inferSelect) {
  const payload = (row.payload || {}) as Record<string, unknown>;
  return {
    ...payload,
    id: row.id,
    posNumber: row.posNumber,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : payload.createdAt,
    channel: row.channel,
    salesPerson: row.salesPersonName || payload.salesPerson || undefined,
    salesPersonId: row.salesPersonId != null ? String(row.salesPersonId) : payload.salesPersonId,
    createdByUserId: row.createdBy ?? payload.createdByUserId,
    status: payload.status || "paid",
  };
}

async function nextPosNumber(companyId: number): Promise<string> {
  const [row] = await db
    .select({
      max: sql<number>`coalesce(max(nullif(regexp_replace(${posSalesTable.posNumber}, '\\D', '', 'g'), '')::int), 0)`,
    })
    .from(posSalesTable)
    .where(eq(posSalesTable.companyId, companyId));
  const next = Number(row?.max || 0) + 1;
  return `POS-${String(next).padStart(4, "0")}`;
}

router.get("/pos-sales", async (req, res): Promise<void> => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const companyId = req.session.companyId;
  if (!companyId) {
    res.status(403).json({ error: "Active company context required" });
    return;
  }
  const channel = String(req.query.channel || "").trim();
  const visibility = await visibilityFor(req);
  const wantsStore = String(req.query.scope || "") === "all";
  const assigned = wantsStore ? await loadAssignedModules(req.session.userId, companyId) : [];
  const storeReport = wantsStore && (visibility.all || assigned.includes("pos_reports"));
  const rows = await db
    .select()
    .from(posSalesTable)
    .where(
      channel
        ? and(eq(posSalesTable.companyId, companyId), eq(posSalesTable.channel, channel))
        : eq(posSalesTable.companyId, companyId),
    )
    .orderBy(desc(posSalesTable.createdAt));
  res.json(rows.filter((row) => owns(row, storeReport ? { ...visibility, all: true } : visibility)).map(toRecord));
});

router.post("/pos-sales", async (req, res): Promise<void> => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const companyId = req.session.companyId;
  if (!companyId) {
    res.status(403).json({ error: "Active company context required" });
    return;
  }
  const visibility = await visibilityFor(req);
  const body = req.body || {};
  const id = String(body.id || "").trim();
  if (!id) {
    res.status(400).json({ error: "Sale id is required" });
    return;
  }
  const [existing] = await db
    .select()
    .from(posSalesTable)
    .where(and(eq(posSalesTable.id, id), eq(posSalesTable.companyId, companyId)))
    .limit(1);
  if (existing) {
    if (!owns(existing, visibility)) {
      res.status(403).json({ error: "Permission denied" });
      return;
    }
    res.json(toRecord(existing));
    return;
  }

  let salesPersonId = visibility.salesPersonId;
  let salesPersonName = visibility.salesPersonName || (typeof body.salesPerson === "string" ? body.salesPerson : null);
  if (visibility.all) {
    const requested = Number(body.salesPersonId);
    if (Number.isFinite(requested) && requested > 0) salesPersonId = requested;
    if (typeof body.salesPerson === "string" && body.salesPerson.trim()) salesPersonName = body.salesPerson.trim();
  }
  const channel = String(body.channel || "retail").trim() || "retail";
  const payload = { ...body, channel, salesPerson: salesPersonName || undefined, salesPersonId: salesPersonId != null ? String(salesPersonId) : undefined, createdByUserId: req.session.userId };

  let posNumber = "";
  let saved = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    posNumber = await nextPosNumber(companyId);
    try {
      const [row] = await db
        .insert(posSalesTable)
        .values({
          id,
          companyId,
          channel,
          posNumber,
          salesPersonId,
          salesPersonName,
          createdBy: req.session.userId,
          payload: { ...payload, posNumber },
        })
        .returning();
      saved = row;
      break;
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === "23505") continue;
      throw err;
    }
  }
  if (!saved) {
    res.status(500).json({ error: "Could not allocate a POS number" });
    return;
  }
  res.status(201).json(toRecord(saved));
});

router.put("/pos-sales/:id", async (req, res): Promise<void> => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const companyId = req.session.companyId;
  if (!companyId) {
    res.status(403).json({ error: "Active company context required" });
    return;
  }
  const visibility = await visibilityFor(req);
  const [existing] = await db
    .select()
    .from(posSalesTable)
    .where(and(eq(posSalesTable.id, req.params.id), eq(posSalesTable.companyId, companyId)))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "POS sale not found" });
    return;
  }
  if (!owns(existing, visibility)) {
    res.status(403).json({ error: "Permission denied" });
    return;
  }
  const body = req.body || {};
  const salesPersonName = visibility.all
    ? (typeof body.salesPerson === "string" ? body.salesPerson : existing.salesPersonName)
    : existing.salesPersonName;
  const [row] = await db
    .update(posSalesTable)
    .set({
      salesPersonName,
      payload: {
        ...(typeof body === "object" ? body : {}),
        id: existing.id,
        posNumber: existing.posNumber,
        salesPerson: salesPersonName || undefined,
        salesPersonId: existing.salesPersonId != null ? String(existing.salesPersonId) : undefined,
        createdByUserId: existing.createdBy,
        channel: existing.channel,
      },
      updatedAt: new Date(),
    })
    .where(eq(posSalesTable.id, existing.id))
    .returning();
  res.json(toRecord(row));
});

router.delete("/pos-sales/:id", async (req, res): Promise<void> => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const companyId = req.session.companyId;
  if (!companyId) {
    res.status(403).json({ error: "Active company context required" });
    return;
  }
  const visibility = await visibilityFor(req);
  const [existing] = await db
    .select()
    .from(posSalesTable)
    .where(and(eq(posSalesTable.id, req.params.id), eq(posSalesTable.companyId, companyId)))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "POS sale not found" });
    return;
  }
  if (!owns(existing, visibility)) {
    res.status(403).json({ error: "Permission denied" });
    return;
  }
  await db.delete(posSalesTable).where(eq(posSalesTable.id, existing.id));
  res.json({ success: true });
});

router.post("/pos-sales/import", async (req, res): Promise<void> => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const companyId = req.session.companyId;
  if (!companyId) {
    res.status(403).json({ error: "Active company context required" });
    return;
  }
  const sales = Array.isArray(req.body?.sales) ? req.body.sales : [];
  const people = await db.select().from(salesPersonsTable).where(eq(salesPersonsTable.companyId, companyId));
  for (const sale of sales) {
    const id = String(sale?.id || "").trim();
    if (!id) continue;
    const [existing] = await db
      .select({ id: posSalesTable.id })
      .from(posSalesTable)
      .where(and(eq(posSalesTable.id, id), eq(posSalesTable.companyId, companyId)))
      .limit(1);
    if (existing) continue;
    const name = String(sale?.salesPerson || "").trim().toLowerCase();
    const matched = name
      ? people.find((person) => person.name.trim().toLowerCase() === name || person.employmentCode.trim().toLowerCase() === name)
      : undefined;
    const channel = String(sale?.channel || "retail");
    let posNumber = String(sale?.posNumber || "").trim();
    if (!posNumber) posNumber = await nextPosNumber(companyId);
    try {
      await db.insert(posSalesTable).values({
        id,
        companyId,
        channel,
        posNumber,
        salesPersonId: matched?.id ?? null,
        salesPersonName: sale?.salesPerson ? String(sale.salesPerson) : matched?.name ?? null,
        createdBy: null,
        payload: sale,
        createdAt: sale?.createdAt ? new Date(sale.createdAt) : new Date(),
      });
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === "23505") continue;
      throw err;
    }
  }
  res.json({ success: true });
});

export default router;
