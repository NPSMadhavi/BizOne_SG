import { Router, type Request } from "express";
import multer from "multer";
import { db, settingsTable, companiesTable, purchaseOrdersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { resolveSmtpSettings, createMailTransporter } from "../lib/smtp.js";

const emailUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 30 },
});

function uploadedFiles(req: Request): Express.Multer.File[] {
  if (!req.files) return [];
  if (Array.isArray(req.files)) return req.files;
  return Object.values(req.files).flat();
}

const router = Router();

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


function buildEmailHtml(body: string, _isSingapore: boolean, companyName: string, ackUrl?: string): string {
  const ackSection = ackUrl ? `
        <!-- ACK buttons -->
        <tr>
          <td style="padding:0 40px 28px 40px;">
            <p style="margin:0 0 12px 0;font-size:13px;color:#666666;">To acknowledge this Purchase Order, click one of the options below:</p>
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding-right:8px;">
                  <a href="${ackUrl}/order-received" style="display:inline-block;padding:9px 18px;background:#1565c0;color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;border-radius:6px;">Order received with thanks.</a>
                </td>
                <td style="padding-right:8px;">
                  <a href="${ackUrl}/received" style="display:inline-block;padding:9px 18px;background:#2e7d32;color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;border-radius:6px;">Received with thanks.</a>
                </td>
                <td>
                  <a href="${ackUrl}/confirmed" style="display:inline-block;padding:9px 18px;background:#6a1b9a;color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;border-radius:6px;">Confirmed!</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>` : "";

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

        <!-- Header: solid blue band with company name as text -->
        <tr>
          <td style="background:#0a2d6e;padding:24px 40px;text-align:center;">
            <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:0.5px;">${companyName}</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 40px 28px 40px;">
            ${textToEmailHtml(body)}
          </td>
        </tr>

        ${ackSection}

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

router.post("/send-email", emailUpload.any(), async (req, res): Promise<void> => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const to = String(req.body?.to || "").trim();
  const subject = String(req.body?.subject || "").trim();
  const body = String(req.body?.body || "");
  const poIdRaw = req.body?.poId;
  const poId = poIdRaw !== undefined && poIdRaw !== "" && poIdRaw !== null
    ? parseInt(String(poIdRaw), 10)
    : undefined;

  const files = uploadedFiles(req);
  const pdfFile = files.find(f => f.fieldname === "pdf") || files[0];
  const extraFiles = files.filter(f => f !== pdfFile);

  const jsonPdfBase64 = typeof req.body?.pdfBase64 === "string" ? req.body.pdfBase64 : "";
  const jsonFilename = typeof req.body?.filename === "string" ? req.body.filename : "";
  const extraAttachments = Array.isArray(req.body?.extraAttachments) ? req.body.extraAttachments : [];

  const filename = pdfFile?.originalname || jsonFilename;
  const hasPdf = Boolean(pdfFile?.buffer?.length) || Boolean(jsonPdfBase64);

  if (!to || !subject || !hasPdf || !filename) {
    res.status(400).json({ error: "Missing required fields: to, subject, pdf, filename" });
    return;
  }

  const companyId = (req.session as any).companyId;
  if (!companyId) {
    res.status(400).json({ error: "No active company selected. Please select a company before sending email." });
    return;
  }

  const settingsRows = await db.select().from(settingsTable).where(eq(settingsTable.companyId, companyId)).limit(1);
  const settings = resolveSmtpSettings(settingsRows[0]);

  if (!settings) {
    res.status(503).json({ error: "SMTP is not configured for this company. Please configure SMTP in Settings → Email, or set SMTP_HOST / SMTP_USER / SMTP_PASS in .env." });
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
    const transporter = createMailTransporter(settings);

    // If this is a PO email, generate/reuse an ACK token and build the ACK URL
    let ackUrl: string | undefined;
    if (poId) {
      const [poRow] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, poId)).limit(1);
      if (poRow) {
        const token = (poRow as any).ackToken || randomUUID();
        if (!(poRow as any).ackToken) {
          await db.update(purchaseOrdersTable).set({ ackToken: token } as any).where(eq(purchaseOrdersTable.id, poId));
        }
        const host = req.get("x-forwarded-host") || req.get("host") || "localhost";
        const proto = req.get("x-forwarded-proto") || "https";
        ackUrl = `${proto}://${host}/api/ack/po/${token}`;
      }
    }

    // Plain-text body only (customers flagged HTML emails as spam)
    let plainBody = body;
    if (ackUrl) {
      plainBody += `\n\nTo acknowledge this Purchase Order, please visit:\n${ackUrl}/order-received`;
    }
    const plainFooter = `\n\n--\n${companyName}`;

    const attachments: any[] = [];
    if (pdfFile?.buffer?.length) {
      attachments.push({
        filename,
        content: pdfFile.buffer,
        contentType: pdfFile.mimetype || "application/pdf",
      });
    } else {
      attachments.push({
        filename,
        content: jsonPdfBase64,
        encoding: "base64",
        contentType: "application/pdf",
      });
    }
    for (const file of extraFiles) {
      attachments.push({
        filename: file.originalname,
        content: file.buffer,
        contentType: file.mimetype || "application/octet-stream",
      });
    }
    if (extraAttachments?.length) {
      for (const att of extraAttachments) {
        attachments.push({ filename: att.filename, content: att.content, encoding: "base64", contentType: att.contentType });
      }
    }

    await transporter.sendMail({
      from: settings.smtpFrom || settings.smtpUser,
      to,
      subject,
      text: plainBody + plainFooter,
      attachments,
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to send email" });
  }
});

router.use((err: any, _req: any, res: any, next: any) => {
  if (err instanceof multer.MulterError) {
    res.status(413).json({
      error: err.code === "LIMIT_FILE_SIZE"
        ? "An attachment is too large (max 20MB per file)."
        : err.message,
    });
    return;
  }
  next(err);
});

router.post("/test-email", async (req, res): Promise<void> => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const companyId = (req.session as any).companyId;
  if (!companyId) {
    res.status(400).json({ error: "No active company selected. Please select a company before testing email." });
    return;
  }

  const settingsRows = await db.select().from(settingsTable).where(eq(settingsTable.companyId, companyId)).limit(1);
  const settings = resolveSmtpSettings(settingsRows[0]);

  if (!settings) {
    res.status(400).json({ error: "SMTP settings are incomplete. Configure Settings → Email, or set SMTP_HOST / SMTP_USER / SMTP_PASS in .env." });
    return;
  }

  try {
    const transporter = createMailTransporter(settings);
    await transporter.verify();
    res.json({ success: true, message: "SMTP connection verified successfully!" });
  } catch (err: any) {
    res.status(400).json({ error: `Connection failed: ${err.message}` });
  }
});

export default router;
