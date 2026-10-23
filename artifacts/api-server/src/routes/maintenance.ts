import { Router, type IRouter } from "express";
import { masterDb, masterPool, maintenanceTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

const DISABLED = {
  isEnabled: false,
  scheduledStart: null as string | null,
  scheduledEnd: null as string | null,
  message: null as string | null,
  contactEmail: null as string | null,
  updatedAt: null as Date | null,
  updatedByUser: null as number | null,
};

let maintenanceTableReady: Promise<boolean> | null = null;

async function ensureMaintenanceTable(): Promise<boolean> {
  if (!maintenanceTableReady) {
    maintenanceTableReady = (async () => {
      try {
        await masterPool.query(`
          CREATE TABLE IF NOT EXISTS maintenance (
            id serial PRIMARY KEY,
            is_enabled boolean NOT NULL DEFAULT false,
            scheduled_start timestamptz,
            scheduled_end timestamptz,
            message text,
            contact_email text,
            updated_at timestamptz DEFAULT now(),
            updated_by_user integer
          )
        `);
        return true;
      } catch {
        return false;
      }
    })();
  }
  return maintenanceTableReady;
}

async function getOrCreateMaintenance() {
  const ok = await ensureMaintenanceTable();
  if (!ok) return null;
  const rows = await masterDb.select().from(maintenanceTable).limit(1);
  if (rows.length > 0) return rows[0];
  const [created] = await masterDb.insert(maintenanceTable).values({
    isEnabled: false,
    scheduledStart: null,
    scheduledEnd: null,
    message: null,
    contactEmail: null,
  }).returning();
  return created;
}

router.get("/maintenance", async (_req, res): Promise<void> => {
  try {
    const row = await getOrCreateMaintenance();
    if (!row) {
      res.json(DISABLED);
      return;
    }
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
    // Never block the app on maintenance status — return disabled.
    res.json(DISABLED);
  }
});

router.put("/maintenance", async (req, res): Promise<void> => {
  if (!req.session.userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  if (!req.session.isAdmin) { res.status(403).json({ error: "Admin only" }); return; }

  const { isEnabled, scheduledStart, scheduledEnd, message, contactEmail } = req.body;

  try {
    const existing = await getOrCreateMaintenance();
    if (!existing) {
      res.status(500).json({ error: "Failed to update maintenance" });
      return;
    }
    const [updated] = await masterDb.update(maintenanceTable)
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
