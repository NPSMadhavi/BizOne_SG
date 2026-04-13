import { Router } from "express";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

declare module "express-session" {
  interface SessionData {
    userId?: number;
  }
}

const router = Router();

async function ensureSettings() {
  const existing = await db.select().from(settingsTable).limit(1);
  if (existing.length === 0) {
    const [created] = await db.insert(settingsTable).values({ gstRate: "9" }).returning();
    return created;
  }
  return existing[0];
}

router.get("/", async (req, res) => {
  try {
    const settings = await ensureSettings();
    res.json({ id: settings.id, gstRate: parseFloat(settings.gstRate) });
  } catch (err) {
    res.status(500).json({ error: "Failed to get settings" });
  }
});

router.put("/", async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: "Unauthorized" });
  const { gstRate } = req.body;
  if (typeof gstRate !== "number" || gstRate < 0 || gstRate > 100) {
    return res.status(400).json({ error: "Invalid GST rate" });
  }
  try {
    const settings = await ensureSettings();
    const [updated] = await db
      .update(settingsTable)
      .set({ gstRate: gstRate.toString() })
      .where(eq(settingsTable.id, settings.id))
      .returning();
    res.json({ id: updated.id, gstRate: parseFloat(updated.gstRate) });
  } catch (err) {
    res.status(500).json({ error: "Failed to update settings" });
  }
});

export default router;
