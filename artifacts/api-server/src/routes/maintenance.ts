import { Router, type IRouter } from "express";
import { db, maintenanceTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

async function getOrCreateMaintenance() {
  const rows = await db.select().from(maintenanceTable).limit(1);
  if (rows.length > 0) return rows[0];
  const [created] = await db.insert(maintenanceTable).values({
    isEnabled: false,
    scheduledStart: null,
    scheduledEnd: null,
    message: null,
    contactEmail: null,
  }).returning();
  return created;
}

router.get("/maintenance", async (req, res): Promise<void> => {
  try {
    const row = await getOrCreateMaintenance();
    res.json({
      isEnabled: row.isEnabled,
      scheduledStart: row.scheduledStart,
      scheduledEnd: row.scheduledEnd,
      message: row.message,
      contactEmail: row.contactEmail,
      updatedAt: row.updatedAt,
      updatedByUser: row.updatedByUser,
    });
  } catch {
    res.status(500).json({ error: "Failed to fetch maintenance status" });
  }
});

router.put("/maintenance", async (req, res): Promise<void> => {
  if (!req.session.userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  if (!req.session.isAdmin) { res.status(403).json({ error: "Admin only" }); return; }

  const { isEnabled, scheduledStart, scheduledEnd, message, contactEmail } = req.body;

  try {
    const existing = await getOrCreateMaintenance();
    const [updated] = await db.update(maintenanceTable)
      .set({
        isEnabled: Boolean(isEnabled),
        scheduledStart: scheduledStart || null,
        scheduledEnd: scheduledEnd || null,
        message: message || null,
        contactEmail: contactEmail || null,
        updatedAt: new Date(),
        updatedByUser: String(req.session.userId),
      })
      .where(eq(maintenanceTable.id, existing.id))
      .returning();

    res.json({
      isEnabled: updated.isEnabled,
      scheduledStart: updated.scheduledStart,
      scheduledEnd: updated.scheduledEnd,
      message: updated.message,
      contactEmail: updated.contactEmail,
      updatedAt: updated.updatedAt,
      updatedByUser: updated.updatedByUser,
    });
  } catch {
    res.status(500).json({ error: "Failed to update maintenance" });
  }
});

export default router;
