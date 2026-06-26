import { Router } from "express";
import { db, purchaseOrdersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

const ACK_ACTIONS: Record<string, string> = {
  "order-received": "Order received with thanks",
  "received": "Received with thanks",
  "confirmed": "Confirmed",
};

function renderPage(title: string, heading: string, body: string, color: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${title}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; background: #f4f6f9; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
  .card { background: white; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); max-width: 480px; width: 100%; overflow: hidden; }
  .header { background: ${color}; padding: 28px 32px; text-align: center; }
  .header h1 { color: white; font-size: 20px; font-weight: 700; }
  .body { padding: 32px; }
  .icon { font-size: 48px; text-align: center; margin-bottom: 16px; }
  .msg { font-size: 15px; color: #444; line-height: 1.6; text-align: center; }
  .label { display: inline-block; margin-top: 16px; background: #f0f4ff; color: #1565c0; font-size: 13px; font-weight: 600; padding: 6px 14px; border-radius: 20px; }
  .footer { padding: 0 32px 24px; text-align: center; color: #aaa; font-size: 12px; }
</style>
</head>
<body>
<div class="card">
  <div class="header"><h1>BizOne° Document Portal</h1></div>
  <div class="body">
    <div class="icon">${heading}</div>
    <p class="msg">${body}</p>
  </div>
  <div class="footer">Powered by bizOneSG &ndash; Smarter Accounting. Better Business.</div>
</div>
</body>
</html>`;
}

// Public: supplier views acknowledgment page before clicking
router.get("/ack/po/:token", async (req, res): Promise<void> => {
  const { token } = req.params;

  const [po] = await db
    .select()
    .from(purchaseOrdersTable)
    .where(eq((purchaseOrdersTable as any).ackToken, token))
    .limit(1);

  if (!po) {
    res.status(404).send(renderPage("Not Found", "❌", "This acknowledgment link is invalid or has expired.", "#e53e3e"));
    return;
  }

  const alreadyAcked = !!(po as any).ackAt;

  if (alreadyAcked) {
    const ackDate = new Date((po as any).ackAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    const ackNote = (po as any).ackNote || "Acknowledged";
    res.send(renderPage("Already Acknowledged", "✅",
      `Purchase Order <strong>${(po as any).poNumber}</strong> was already acknowledged on ${ackDate}.<br><br><span class="label">${ackNote}</span>`,
      "#2e7d32"));
    return;
  }

  const buttons = Object.entries(ACK_ACTIONS).map(([action, label]) =>
    `<a href="/api/ack/po/${encodeURIComponent(token)}/${action}" style="display:block;margin:8px 0;padding:12px 20px;background:#1565c0;color:white;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;text-align:center;">${label}</a>`
  ).join("");

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Acknowledge PO ${(po as any).poNumber}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; background: #f4f6f9; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
  .card { background: white; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); max-width: 480px; width: 100%; overflow: hidden; }
  .header { background: linear-gradient(135deg,#0a2d6e,#1e88e5); padding: 28px 32px; text-align: center; }
  .header h1 { color: white; font-size: 20px; font-weight: 700; }
  .body { padding: 32px; }
  .po-info { background: #f8faff; border: 1px solid #e3ecff; border-radius: 8px; padding: 16px 20px; margin-bottom: 24px; }
  .po-info .row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 14px; }
  .po-info .row .lbl { color: #888; }
  .po-info .row .val { font-weight: 600; color: #222; }
  .section-title { font-size: 14px; color: #555; margin-bottom: 12px; text-align: center; }
  .footer { padding: 0 32px 24px; text-align: center; color: #aaa; font-size: 12px; }
</style>
</head>
<body>
<div class="card">
  <div class="header"><h1>BizOne° Document Portal</h1></div>
  <div class="body">
    <div class="po-info">
      <div class="row"><span class="lbl">PO Number</span><span class="val">${(po as any).poNumber}</span></div>
      <div class="row"><span class="lbl">Vendor</span><span class="val">${(po as any).vendorName}</span></div>
    </div>
    <p class="section-title">Please select your response:</p>
    ${buttons}
  </div>
  <div class="footer">Powered by bizOneSG &ndash; Smarter Accounting. Better Business.</div>
</div>
</body>
</html>`);
});

// Public: supplier submits acknowledgment
router.get("/ack/po/:token/:action", async (req, res): Promise<void> => {
  const { token, action } = req.params;
  const ackNote = ACK_ACTIONS[action];

  if (!ackNote) {
    res.status(400).send(renderPage("Invalid Action", "❌", "Unknown acknowledgment action.", "#e53e3e"));
    return;
  }

  const [po] = await db
    .select()
    .from(purchaseOrdersTable)
    .where(eq((purchaseOrdersTable as any).ackToken, token))
    .limit(1);

  if (!po) {
    res.status(404).send(renderPage("Not Found", "❌", "This acknowledgment link is invalid or has expired.", "#e53e3e"));
    return;
  }

  if (!(po as any).ackAt) {
    await db
      .update(purchaseOrdersTable)
      .set({ ackAt: new Date().toISOString(), ackNote } as any)
      .where(eq((purchaseOrdersTable as any).ackToken, token));
  }

  res.send(renderPage(
    "Thank You!",
    "✅",
    `Thank you! Your response "<strong>${ackNote}</strong>" for Purchase Order <strong>${(po as any).poNumber}</strong> has been recorded successfully.<br><br>The issuer has been notified.`,
    "#1565c0"
  ));
});

export default router;
