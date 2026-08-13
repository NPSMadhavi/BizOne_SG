import { Router, type IRouter } from "express";
import { db, rolesTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requirePermission } from "../lib/auth-middleware.js";
import { logAudit } from "../lib/audit.js";

const router: IRouter = Router();

router.get("/roles", requirePermission("user_management:view"), async (req, res): Promise<void> => {
  const companyId = req.session.companyId;
  if (!companyId) {
    res.status(403).json({ error: "Active company context required" });
    return;
  }

  const rows = await db
    .select({ id: rolesTable.id, name: rolesTable.name })
    .from(rolesTable)
    .where(eq(rolesTable.companyId, companyId))
    .orderBy(rolesTable.name);

  res.json(rows);
});

router.post("/roles", requirePermission("user_management:create"), async (req, res): Promise<void> => {
  const companyId = req.session.companyId;
  if (!companyId) {
    res.status(403).json({ error: "Active company context required" });
    return;
  }

  const name = String(req.body?.name ?? "").trim();
  if (name.length < 2) {
    res.status(400).json({ error: "Role name must be at least 2 characters." });
    return;
  }
  if (name.length > 80) {
    res.status(400).json({ error: "Role name is too long." });
    return;
  }

  const [existing] = await db
    .select()
    .from(rolesTable)
    .where(
      and(
        eq(rolesTable.companyId, companyId),
        sql`lower(${rolesTable.name}) = ${name.toLowerCase()}`,
      ),
    )
    .limit(1);

  if (existing) {
    res.status(400).json({ error: "A role with this name already exists." });
    return;
  }

  const [role] = await db
    .insert(rolesTable)
    .values({ name, companyId })
    .returning({ id: rolesTable.id, name: rolesTable.name });

  logAudit({
    req,
    action: "create",
    entityType: "role",
    entityId: role.id,
    entityLabel: role.name,
  });

  res.status(201).json(role);
});

export default router;
