import { Router, type IRouter } from "express";
import { db, auditLogsTable } from "@workspace/db";
import { eq, desc, and, gte, lte, ilike } from "drizzle-orm";

const router: IRouter = Router();

function requireAdmin(req: any, res: any): boolean {
  if (!req.session.userId) { res.status(401).json({ error: "Not authenticated" }); return false; }
  if (!req.session.isAdmin) { res.status(403).json({ error: "Admin access required" }); return false; }
  return true;
}

router.get("/audit-logs", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;

  const { companyId, userId, action, entityType, from, to, search, limit = "200", offset = "0" } = req.query as Record<string, string>;

  let rows = await db.select().from(auditLogsTable).orderBy(desc(auditLogsTable.createdAt));

  if (companyId) rows = rows.filter(r => r.companyId === parseInt(companyId));
  if (userId) rows = rows.filter(r => r.userId === parseInt(userId));
  if (action) rows = rows.filter(r => r.action === action);
  if (entityType) rows = rows.filter(r => r.entityType === entityType);
  if (from) rows = rows.filter(r => new Date(r.createdAt) >= new Date(from));
  if (to) rows = rows.filter(r => new Date(r.createdAt) <= new Date(to + "T23:59:59Z"));
  if (search) {
    const q = search.toLowerCase();
    rows = rows.filter(r =>
      (r.username || "").toLowerCase().includes(q) ||
      (r.entityLabel || "").toLowerCase().includes(q) ||
      (r.action || "").toLowerCase().includes(q) ||
      (r.entityType || "").toLowerCase().includes(q)
    );
  }

  const total = rows.length;
  const page = rows.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

  res.json({ total, rows: page });
});

export default router;
