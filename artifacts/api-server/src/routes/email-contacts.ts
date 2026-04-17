import { Router, type IRouter } from "express";
import { db, emailContactsTable } from "@workspace/db";
import { eq, and, ilike, desc, sql } from "drizzle-orm";

const router: IRouter = Router();

function requireAuth(req: any, res: any): boolean {
  if (!req.session.userId) { res.status(401).json({ error: "Not authenticated" }); return false; }
  return true;
}

function requireCompany(req: any, res: any): boolean {
  if (!req.session.companyId) { res.status(400).json({ error: "No company selected" }); return false; }
  return true;
}

router.get("/email-contacts", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  const companyId = req.session.companyId!;
  const q = (req.query.q as string) || "";

  try {
    const contacts = q.trim()
      ? await db.select().from(emailContactsTable)
          .where(and(
            eq(emailContactsTable.companyId, companyId),
            ilike(emailContactsTable.email, `%${q.trim()}%`)
          ))
          .orderBy(desc(emailContactsTable.useCount))
          .limit(10)
      : await db.select().from(emailContactsTable)
          .where(eq(emailContactsTable.companyId, companyId))
          .orderBy(desc(emailContactsTable.useCount))
          .limit(50);
    res.json(contacts);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch email contacts" });
  }
});

router.post("/email-contacts/track", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  const companyId = req.session.companyId!;
  const { emails } = req.body;

  if (!Array.isArray(emails) || emails.length === 0) {
    res.status(400).json({ error: "emails array required" }); return;
  }

  try {
    for (const email of emails) {
      if (!email || typeof email !== "string" || !email.includes("@")) continue;
      const existing = await db.select({ id: emailContactsTable.id })
        .from(emailContactsTable)
        .where(and(eq(emailContactsTable.companyId, companyId), ilike(emailContactsTable.email, email.trim())))
        .limit(1);

      if (existing.length > 0) {
        await db.update(emailContactsTable)
          .set({ useCount: sql`${emailContactsTable.useCount} + 1`, lastUsedAt: new Date() })
          .where(eq(emailContactsTable.id, existing[0].id));
      } else {
        await db.insert(emailContactsTable).values({
          companyId, email: email.trim().toLowerCase(), name: null,
        });
      }
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to track email contacts" });
  }
});

router.put("/email-contacts/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  const companyId = req.session.companyId!;
  const id = parseInt(req.params.id);
  const { name, email } = req.body;

  try {
    const [updated] = await db.update(emailContactsTable)
      .set({ name: name || null, email })
      .where(and(eq(emailContactsTable.id, id), eq(emailContactsTable.companyId, companyId)))
      .returning();
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Failed to update email contact" });
  }
});

router.delete("/email-contacts/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!requireCompany(req, res)) return;
  const companyId = req.session.companyId!;
  const id = parseInt(req.params.id);

  try {
    await db.delete(emailContactsTable)
      .where(and(eq(emailContactsTable.id, id), eq(emailContactsTable.companyId, companyId)));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete email contact" });
  }
});

export default router;
