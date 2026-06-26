import { Router } from "express";
import nodemailer from "nodemailer";
import { db, settingsTable, companiesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import path from "node:path";
import fs from "node:fs";

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

// Convert plain-text body to email-safe HTML paragraphs
function textToEmailHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .split(/\n{2,}/)
    .map(para => `<p style="margin:0 0 14px 0;color:#333333;font-size:14px;line-height:1.7;">${para.replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

// Load a logo from the assets directory as a Buffer (returns null if not found)
function loadLogoBuffer(filename: string): Buffer | null {
  try {
    // __dirname is set by esbuild banner to the dist directory
    const assetsDir = path.join(__dirname, "../assets");
    const p = path.join(assetsDir, filename);
    return fs.readFileSync(p);
  } catch {
    return null;
  }
}

function buildEmailHtml(body: string, isSingapore: boolean, companyName: string): string {
  const brand = isSingapore ? "BizOne Singapore" : "BizOne India";
  const brandShort = isSingapore ? "bizOneSG" : "bizOneIndia";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${companyName}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f9;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6f9;padding:32px 16px;">
  <tr>
    <td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#0a2d6e 0%,#1565c0 60%,#1e88e5 100%);padding:32px 40px;text-align:center;">
            <img src="cid:bizone-logo" alt="${brand}" style="height:52px;max-width:240px;object-fit:contain;" />
            <p style="margin:10px 0 0 0;color:rgba(255,255,255,0.80);font-size:12px;letter-spacing:0.5px;">Smarter Accounting. Better Business.</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 40px 28px 40px;">
            ${textToEmailHtml(body)}
          </td>
        </tr>

        <!-- Divider -->
        <tr>
          <td style="padding:0 40px;">
            <div style="border-top:1px solid #e8ecf0;"></div>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 40px 32px 40px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#9aa3af;">
              Sent from <strong style="color:#1565c0;">${brandShort}</strong> &ndash; Smarter Accounting. Better Business.
            </p>
            <p style="margin:6px 0 0 0;font-size:11px;color:#bdc3cb;">
              &copy; ${new Date().getFullYear()} ${companyName}. All rights reserved.
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
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

  // Get company name and country for branding
  let companyName = "RSV Infotech";
  let isSingapore = true;
  if (companyId) {
    const companyRows = await db.select({ name: companiesTable.name, country: companiesTable.country })
      .from(companiesTable)
      .where(eq(companiesTable.id, companyId))
      .limit(1);
    if (companyRows[0]) {
      companyName = companyRows[0].name;
      isSingapore = companyRows[0].country?.toLowerCase() !== "india";
    }
  }

  try {
    const transporter = createTransporter(settings);

    const logoFilename = isSingapore ? "bizone-sg.png" : "bizone-india.png";
    const logoBuffer = loadLogoBuffer(logoFilename);

    const htmlBody = buildEmailHtml(body, isSingapore, companyName);
    const brandShort = isSingapore ? "bizOneSG" : "bizOneIndia";
    const plainFooter = `\n\n--\nSent from ${brandShort} – Smarter Accounting. Better Business.`;

    const attachments: any[] = [
      {
        filename,
        content: pdfBase64,
        encoding: "base64",
        contentType: "application/pdf",
      },
    ];

    if (logoBuffer) {
      attachments.push({
        filename: logoFilename,
        content: logoBuffer,
        cid: "bizone-logo",
        contentType: "image/png",
      });
    }

    await transporter.sendMail({
      from: settings.smtpFrom || settings.smtpUser,
      to,
      subject,
      text: body + plainFooter,
      html: htmlBody,
      attachments,
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
