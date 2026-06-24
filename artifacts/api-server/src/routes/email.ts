import { Router } from "express";
import nodemailer from "nodemailer";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

function createTransporter(settings: any) {
  return nodemailer.createTransport({
    host: settings.smtpHost,
    port: parseInt(settings.smtpPort || "587"),
    secure: parseInt(settings.smtpPort || "587") === 465,
    auth: {
      user: settings.smtpUser,
      pass: settings.smtpPass,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
}

router.post("/send-email", async (req, res): Promise<void> => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { to, subject, body, pdfBase64, filename } = req.body as {
    to: string;
    subject: string;
    body: string;
    pdfBase64: string;
    filename: string;
  };

  if (!to || !subject || !pdfBase64 || !filename) {
    res.status(400).json({ error: "Missing required fields: to, subject, pdfBase64, filename" });
    return;
  }

  const companyId = (req.session as any).companyId;
  const settingsRows = companyId
    ? await db.select().from(settingsTable).where(eq(settingsTable.companyId, companyId)).limit(1)
    : await db.select().from(settingsTable).limit(1);
  const settings = settingsRows[0];

  if (!settings?.smtpHost || !settings?.smtpUser || !settings?.smtpPass) {
    res.status(503).json({ error: "SMTP is not configured. Please configure SMTP in Settings." });
    return;
  }

  try {
    const transporter = createTransporter(settings);

    const plainFooter = "\n\n--\nSent from bizOneSG – Smarter Accounting. Better Business.";

    // Convert plain-text body to email-safe HTML.
    // white-space:pre-wrap is ignored by Outlook and many mobile clients,
    // so we convert paragraph breaks (\n\n) to <p> tags and single line
    // breaks (\n) to <br> tags — universally supported by all email clients.
    function textToEmailHtml(text: string): string {
      const escaped = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      return escaped
        .split(/\n{2,}/)                           // split on blank lines → paragraphs
        .map(para => `<p style="margin:0 0 12px 0;">${para.replace(/\n/g, "<br>")}</p>`)
        .join("\n");
    }

    const htmlBody = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;font-size:14px;color:#333;line-height:1.6;max-width:600px;margin:0 auto;padding:20px;">
${textToEmailHtml(body)}
<hr style="border:none;border-top:1px solid #e0e0e0;margin:24px 0;" />
<p style="font-size:12px;color:#888;margin:0;">Sent from <strong style="color:#555;">bizOneSG</strong> &ndash; Smarter Accounting. Better Business.</p>
</body></html>`;

    await transporter.sendMail({
      from: settings.smtpFrom || settings.smtpUser,
      to,
      subject,
      text: body + plainFooter,
      html: htmlBody,
      attachments: [
        {
          filename,
          content: pdfBase64,
          encoding: "base64",
          contentType: "application/pdf",
        },
      ],
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to send email" });
  }
});

router.post("/test-email", async (req, res): Promise<void> => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const companyId = (req.session as any).companyId;
  const settingsRows = companyId
    ? await db.select().from(settingsTable).where(eq(settingsTable.companyId, companyId)).limit(1)
    : await db.select().from(settingsTable).limit(1);
  const settings = settingsRows[0];

  if (!settings?.smtpHost || !settings?.smtpUser || !settings?.smtpPass) {
    res.status(400).json({ error: "SMTP settings are incomplete. Please fill in all fields and save first." });
    return;
  }

  try {
    const transporter = createTransporter(settings);
    await transporter.verify();
    res.json({ success: true, message: "SMTP connection verified successfully!" });
  } catch (err: any) {
    res.status(400).json({ error: `Connection failed: ${err.message}` });
  }
});

export default router;
