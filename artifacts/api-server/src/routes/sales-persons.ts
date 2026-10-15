import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { db, salesPersonsTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";

const router: IRouter = Router();

function requireCompany(req: { session: { userId?: number; companyId?: number } }, res: { status: (code: number) => { json: (body: unknown) => void } }): number | null {
  if (!req.session.userId) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  if (!req.session.companyId) {
    res.status(403).json({ error: "Active company context required" });
    return null;
  }
  return req.session.companyId;
}

function toPublic(row: typeof salesPersonsTable.$inferSelect) {
  return {
    id: String(row.id),
    name: row.name,
    employmentCode: row.employmentCode,
    department: row.department || "",
    phone: row.phone || "",
    country: row.country || "",
    address: row.address || "",
    hasPassword: Boolean(row.passwordHash),
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString().slice(0, 10) : String(row.createdAt),
  };
}

async function findByCode(companyId: number, code: string) {
  const normalized = code.trim().toLowerCase();
  if (!normalized) return null;
  const [row] = await db
    .select()
    .from(salesPersonsTable)
    .where(
      and(
        eq(salesPersonsTable.companyId, companyId),
        sql`lower(${salesPersonsTable.employmentCode}) = ${normalized}`,
      ),
    )
    .limit(1);
  return row ?? null;
}

router.get("/sales-persons", async (req, res): Promise<void> => {
  const companyId = requireCompany(req, res);
  if (!companyId) return;
  const rows = await db
    .select()
    .from(salesPersonsTable)
    .where(eq(salesPersonsTable.companyId, companyId))
    .orderBy(salesPersonsTable.name);
  res.json(rows.map(toPublic));
});

router.post("/sales-persons", async (req, res): Promise<void> => {
  const companyId = requireCompany(req, res);
  if (!companyId) return;
  const name = String(req.body?.name || "").trim();
  const employmentCode = String(req.body?.employmentCode || "").trim();
  if (!name) {
    res.status(400).json({ error: "Sales Person Name is required." });
    return;
  }
  if (!employmentCode) {
    res.status(400).json({ error: "Sales Person Code is required." });
    return;
  }
  const existing = await findByCode(companyId, employmentCode);
  if (existing) {
    res.status(400).json({ error: "A sales person with this code already exists." });
    return;
  }
  const password = String(req.body?.password || "").trim();
  const passwordHash = password ? await bcrypt.hash(password, 12) : "";
  const [row] = await db
    .insert(salesPersonsTable)
    .values({
      companyId,
      name,
      employmentCode,
      passwordHash,
      department: String(req.body?.department || "").trim(),
      phone: String(req.body?.phone || "").trim(),
      country: String(req.body?.country || "Singapore").trim() || "Singapore",
      address: String(req.body?.address || "").trim(),
    })
    .returning();
  res.status(201).json(toPublic(row));
});

router.put("/sales-persons/:id", async (req, res): Promise<void> => {
  const companyId = requireCompany(req, res);
  if (!companyId) return;
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid sales person" });
    return;
  }
  const [current] = await db
    .select()
    .from(salesPersonsTable)
    .where(and(eq(salesPersonsTable.id, id), eq(salesPersonsTable.companyId, companyId)))
    .limit(1);
  if (!current) {
    res.status(404).json({ error: "Sales person was not found." });
    return;
  }
  const name = req.body?.name != null ? String(req.body.name).trim() : current.name;
  const employmentCode = req.body?.employmentCode != null ? String(req.body.employmentCode).trim() : current.employmentCode;
  if (!name || !employmentCode) {
    res.status(400).json({ error: "Sales Person Name and Code are required." });
    return;
  }
  const duplicate = await findByCode(companyId, employmentCode);
  if (duplicate && duplicate.id !== current.id) {
    res.status(400).json({ error: "A sales person with this code already exists." });
    return;
  }
  const password = String(req.body?.password || "").trim();
  const passwordHash = password ? await bcrypt.hash(password, 12) : current.passwordHash;
  const [row] = await db
    .update(salesPersonsTable)
    .set({
      name,
      employmentCode,
      passwordHash,
      department: req.body?.department != null ? String(req.body.department).trim() : current.department,
      phone: req.body?.phone != null ? String(req.body.phone).trim() : current.phone,
      country: req.body?.country != null ? String(req.body.country).trim() : current.country,
      address: req.body?.address != null ? String(req.body.address).trim() : current.address,
      updatedAt: new Date(),
    })
    .where(eq(salesPersonsTable.id, current.id))
    .returning();
  res.json(toPublic(row));
});

router.delete("/sales-persons/:id", async (req, res): Promise<void> => {
  const companyId = requireCompany(req, res);
  if (!companyId) return;
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid sales person" });
    return;
  }
  const deleted = await db
    .delete(salesPersonsTable)
    .where(and(eq(salesPersonsTable.id, id), eq(salesPersonsTable.companyId, companyId)))
    .returning({ id: salesPersonsTable.id });
  if (!deleted.length) {
    res.status(404).json({ error: "Sales person was not found." });
    return;
  }
  res.json({ success: true });
});

router.post("/sales-persons/import", async (req, res): Promise<void> => {
  const companyId = requireCompany(req, res);
  if (!companyId) return;
  const persons = Array.isArray(req.body?.persons) ? req.body.persons : [];
  for (const person of persons) {
    const name = String(person?.name || "").trim();
    const employmentCode = String(person?.employmentCode || person?.name || "").trim();
    if (!name || !employmentCode) continue;
    const existing = await findByCode(companyId, employmentCode);
    const password = String(person?.password || "").trim();
    if (existing) {
      if (password && !existing.passwordHash) {
        await db
          .update(salesPersonsTable)
          .set({ passwordHash: await bcrypt.hash(password, 12), updatedAt: new Date() })
          .where(eq(salesPersonsTable.id, existing.id));
      }
      continue;
    }
    await db.insert(salesPersonsTable).values({
      companyId,
      name,
      employmentCode,
      passwordHash: password ? await bcrypt.hash(password, 12) : "",
      department: String(person?.department || "").trim(),
      phone: String(person?.phone || "").trim(),
      country: String(person?.country || "Singapore").trim() || "Singapore",
      address: String(person?.address || "").trim(),
    });
  }
  const rows = await db
    .select()
    .from(salesPersonsTable)
    .where(eq(salesPersonsTable.companyId, companyId))
    .orderBy(salesPersonsTable.name);
  res.json(rows.map(toPublic));
});

router.post("/sales-persons/login", async (req, res): Promise<void> => {
  const companyId = requireCompany(req, res);
  if (!companyId) return;
  const code = String(req.body?.salesPersonId || req.body?.employmentCode || req.body?.name || "").trim();
  const password = String(req.body?.password || "");
  if (!code || !password.trim()) {
    res.status(400).json({ error: "Sales Person ID and password are required." });
    return;
  }
  const byCode = await findByCode(companyId, code);
  let row = byCode;
  if (!row) {
    const [byName] = await db
      .select()
      .from(salesPersonsTable)
      .where(
        and(
          eq(salesPersonsTable.companyId, companyId),
          sql`lower(${salesPersonsTable.name}) = ${code.toLowerCase()}`,
        ),
      )
      .limit(1);
    row = byName ?? null;
  }
  if (!row || !row.passwordHash || !(await bcrypt.compare(password, row.passwordHash))) {
    res.status(401).json({ error: "Invalid Sales Person ID or password." });
    return;
  }
  res.json(toPublic(row));
});

router.post("/sales-persons/:id/password", async (req, res): Promise<void> => {
  const companyId = requireCompany(req, res);
  if (!companyId) return;
  const id = Number(req.params.id);
  const password = String(req.body?.password || "").trim();
  const confirm = String(req.body?.confirmPassword || "").trim();
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid sales person" });
    return;
  }
  if (!/^\d{8}$/.test(password)) {
    res.status(400).json({ error: "Password must be 8 digits." });
    return;
  }
  if (password !== confirm) {
    res.status(400).json({ error: "Password and confirm password do not match." });
    return;
  }
  const [current] = await db
    .select()
    .from(salesPersonsTable)
    .where(and(eq(salesPersonsTable.id, id), eq(salesPersonsTable.companyId, companyId)))
    .limit(1);
  if (!current) {
    res.status(404).json({ error: "Sales person was not found." });
    return;
  }
  const [row] = await db
    .update(salesPersonsTable)
    .set({ passwordHash: await bcrypt.hash(password, 12), updatedAt: new Date() })
    .where(eq(salesPersonsTable.id, current.id))
    .returning();
  res.json(toPublic(row));
});

export default router;
