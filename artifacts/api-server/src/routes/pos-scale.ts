import { Router, type IRouter } from "express";

/**
 * Abstraction endpoint for POS weighing-scale integration.
 * A local scale bridge (USB/RS-232 service) can later POST/GET real weights here.
 * Until a scale is connected, status stays disconnected and weight is null
 * so the POS falls back to manual entry.
 */
const router: IRouter = Router();

type ScaleRuntime = {
  status: "connected" | "disconnected" | "error" | "unsupported";
  /** Latest weight in kilograms, if any. */
  weightKg: number | null;
  updatedAt: string | null;
  message?: string;
};

const runtime: ScaleRuntime = {
  status: "disconnected",
  weightKg: null,
  updatedAt: null,
};

router.get("/pos/scale/status", (req, res): void => {
  if (!req.session.userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  res.json({
    status: runtime.status,
    connected: runtime.status === "connected",
    weightKg: runtime.weightKg,
    updatedAt: runtime.updatedAt,
    message: runtime.message || null,
  });
});

router.get("/pos/scale/weight", (req, res): void => {
  if (!req.session.userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  if (runtime.status !== "connected" || runtime.weightKg == null || !(runtime.weightKg > 0)) {
    res.status(503).json({
      error: "Scale not connected",
      status: runtime.status,
      weightKg: null,
      message: runtime.message || "Scale not connected",
    });
    return;
  }
  res.json({
    status: runtime.status,
    weightKg: runtime.weightKg,
    updatedAt: runtime.updatedAt,
  });
});

/**
 * Optional bridge: a local scale service can push the live weight.
 * Body: { weightKg: number, status?: "connected" }
 */
router.post("/pos/scale/weight", (req, res): void => {
  if (!req.session.userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const raw = Number(req.body?.weightKg);
  if (!Number.isFinite(raw) || raw < 0) {
    res.status(400).json({ error: "weightKg must be a non-negative number (kilograms)." });
    return;
  }
  runtime.weightKg = Math.round(raw * 1000) / 1000;
  runtime.status = req.body?.status === "disconnected" ? "disconnected" : "connected";
  runtime.updatedAt = new Date().toISOString();
  runtime.message = runtime.status === "connected" ? "Scale weight received." : "Scale disconnected.";
  res.json({
    status: runtime.status,
    weightKg: runtime.weightKg,
    updatedAt: runtime.updatedAt,
  });
});

router.post("/pos/scale/disconnect", (req, res): void => {
  if (!req.session.userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  runtime.status = "disconnected";
  runtime.weightKg = null;
  runtime.updatedAt = new Date().toISOString();
  runtime.message = undefined;
  res.json({ status: runtime.status, weightKg: null });
});

export default router;
