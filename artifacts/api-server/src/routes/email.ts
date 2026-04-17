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

    await transporter.sendMail({
      from: settings.smtpFrom || settings.smtpUser,
      to,
      subject,
      text: body,
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
