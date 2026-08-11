import nodemailer from "nodemailer";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { resolveSmtpSettings } from "./smtp.js";

function createTransporter(s: { smtpHost: string; smtpPort: string; smtpUser: string; smtpPass: string }) {
  return nodemailer.createTransport({
    host: s.smtpHost,
    port: parseInt(s.smtpPort || "587"),
    secure: parseInt(s.smtpPort || "587") === 465,
    auth: { user: s.smtpUser, pass: s.smtpPass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
}

function wrapHtml(body: string, companyName: string): string {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f4f4;font-family:sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:32px 16px;">
<table width="600" cellpadding="0" cellspacing="0" style="margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
<tr><td style="background:#19233b;padding:24px 32px;">
<span style="color:#ffffff;font-size:18px;font-weight:700;">${companyName}</span>
</td></tr>
<tr><td style="padding:28px 32px 20px 32px;font-size:14px;color:#333;line-height:1.7;">${body}</td></tr>
<tr><td style="padding:16px 32px 24px 32px;font-size:11px;color:#999;border-top:1px solid #eee;">
This is an automated notification from your document management system.
</td></tr>
</table></td></tr></table></body></html>`;
}

export interface VoucherEmailParams {
  companyId: number;
  companyName: string;
  toEmail: string | null | undefined;
  toName: string;
  subject: string;
  body: string;
}

export async function sendVoucherEmail(params: VoucherEmailParams): Promise<void> {
  if (!params.toEmail) return; // No email on user — skip silently

  try {
    const [row] = await db.select().from(settingsTable).where(eq(settingsTable.companyId, params.companyId)).limit(1);
    const settings = resolveSmtpSettings(row);
    if (!settings) return; // SMTP not configured

    const transporter = createTransporter(settings);
    await transporter.sendMail({
      from: settings.smtpFrom || settings.smtpUser,
      to: params.toEmail,
      subject: params.subject,
      html: wrapHtml(params.body, params.companyName),
    });
  } catch {
    // Email errors never crash the API — logged but swallowed
  }
}

// ── Pre-built notification emails ─────────────────────────────────────────────

export function buildVerifyEmail(opts: {
  voucherNumber: string; payee: string; amount: string; currency: string;
  preparedBy: string; appUrl: string;
}): string {
  return `<p>Hi,</p>
<p>A payment voucher has been submitted and requires your <strong>verification</strong>.</p>
<table style="border-collapse:collapse;width:100%;margin:16px 0;font-size:13px;">
  <tr><td style="padding:6px 12px 6px 0;color:#666;">Voucher No.</td><td style="padding:6px 0;font-weight:600;">${opts.voucherNumber}</td></tr>
  <tr><td style="padding:6px 12px 6px 0;color:#666;">Pay To</td><td style="padding:6px 0;">${opts.payee}</td></tr>
  <tr><td style="padding:6px 12px 6px 0;color:#666;">Amount</td><td style="padding:6px 0;font-weight:600;">${opts.currency} ${opts.amount}</td></tr>
  <tr><td style="padding:6px 12px 6px 0;color:#666;">Prepared By</td><td style="padding:6px 0;">${opts.preparedBy}</td></tr>
</table>
<p><a href="${opts.appUrl}" style="display:inline-block;padding:10px 20px;background:#19233b;color:#fff;font-weight:600;text-decoration:none;border-radius:6px;">Review &amp; Verify →</a></p>`;
}

export function buildApproveEmail(opts: {
  voucherNumber: string; payee: string; amount: string; currency: string;
  verifiedBy: string; appUrl: string;
}): string {
  return `<p>Hi,</p>
<p>A payment voucher has been <strong>verified</strong> and now requires your <strong>approval</strong>.</p>
<table style="border-collapse:collapse;width:100%;margin:16px 0;font-size:13px;">
  <tr><td style="padding:6px 12px 6px 0;color:#666;">Voucher No.</td><td style="padding:6px 0;font-weight:600;">${opts.voucherNumber}</td></tr>
  <tr><td style="padding:6px 12px 6px 0;color:#666;">Pay To</td><td style="padding:6px 0;">${opts.payee}</td></tr>
  <tr><td style="padding:6px 12px 6px 0;color:#666;">Amount</td><td style="padding:6px 0;font-weight:600;">${opts.currency} ${opts.amount}</td></tr>
  <tr><td style="padding:6px 12px 6px 0;color:#666;">Verified By</td><td style="padding:6px 0;">${opts.verifiedBy}</td></tr>
</table>
<p><a href="${opts.appUrl}" style="display:inline-block;padding:10px 20px;background:#19233b;color:#fff;font-weight:600;text-decoration:none;border-radius:6px;">Review &amp; Approve →</a></p>`;
}

export function buildPayEmail(opts: {
  voucherNumber: string; payee: string; amount: string; currency: string;
  approvedBy: string; appUrl: string;
}): string {
  return `<p>Hi,</p>
<p>A payment voucher has been <strong>approved</strong> and is ready for <strong>payment processing</strong>.</p>
<table style="border-collapse:collapse;width:100%;margin:16px 0;font-size:13px;">
  <tr><td style="padding:6px 12px 6px 0;color:#666;">Voucher No.</td><td style="padding:6px 0;font-weight:600;">${opts.voucherNumber}</td></tr>
  <tr><td style="padding:6px 12px 6px 0;color:#666;">Pay To</td><td style="padding:6px 0;">${opts.payee}</td></tr>
  <tr><td style="padding:6px 12px 6px 0;color:#666;">Amount</td><td style="padding:6px 0;font-weight:600;">${opts.currency} ${opts.amount}</td></tr>
  <tr><td style="padding:6px 12px 6px 0;color:#666;">Approved By</td><td style="padding:6px 0;">${opts.approvedBy}</td></tr>
</table>
<p><a href="${opts.appUrl}" style="display:inline-block;padding:10px 20px;background:#16a34a;color:#fff;font-weight:600;text-decoration:none;border-radius:6px;">Process Payment →</a></p>`;
}

export function buildPaidConfirmEmail(opts: {
  voucherNumber: string; payee: string; amount: string; currency: string;
  paidBy: string; paidDate: string; bankRef?: string | null; appUrl: string;
}): string {
  return `<p>Hi,</p>
<p>Your payment voucher has been <strong>paid</strong>.</p>
<table style="border-collapse:collapse;width:100%;margin:16px 0;font-size:13px;">
  <tr><td style="padding:6px 12px 6px 0;color:#666;">Voucher No.</td><td style="padding:6px 0;font-weight:600;">${opts.voucherNumber}</td></tr>
  <tr><td style="padding:6px 12px 6px 0;color:#666;">Pay To</td><td style="padding:6px 0;">${opts.payee}</td></tr>
  <tr><td style="padding:6px 12px 6px 0;color:#666;">Amount</td><td style="padding:6px 0;font-weight:600;">${opts.currency} ${opts.amount}</td></tr>
  <tr><td style="padding:6px 12px 6px 0;color:#666;">Paid By</td><td style="padding:6px 0;">${opts.paidBy}</td></tr>
  <tr><td style="padding:6px 12px 6px 0;color:#666;">Payment Date</td><td style="padding:6px 0;">${opts.paidDate}</td></tr>
  ${opts.bankRef ? `<tr><td style="padding:6px 12px 6px 0;color:#666;">Bank Ref</td><td style="padding:6px 0;">${opts.bankRef}</td></tr>` : ""}
</table>
<p><a href="${opts.appUrl}" style="display:inline-block;padding:10px 20px;background:#19233b;color:#fff;font-weight:600;text-decoration:none;border-radius:6px;">View Voucher →</a></p>`;
}
