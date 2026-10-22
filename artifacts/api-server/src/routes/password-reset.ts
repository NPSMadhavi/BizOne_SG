import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { companyDbContext, db, masterDb, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { openCompanyPool } from "../lib/company-database.js";
import { publishAllCompanyUsersToMaster } from "../lib/login-account.js";
import { logger } from "../lib/logger.js";
import { createMailTransporter, resolveSmtpSettings } from "../lib/smtp.js";

const OTP_TTL_MS = 10 * 60 * 1000;
const RESET_TTL_MS = 10 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;
const MAX_REQUESTS = 5;
const REQUEST_WINDOW_MS = 15 * 60 * 1000;

type Ticket = {
  userId: number;
  otpHash: string;
  expiresAt: number;
  attempts: number;
};

type Grant = {
  userId: number;
  expiresAt: number;
};

const tickets = new Map<string, Ticket>();
const grants = new Map<string, Grant>();
const requestHits = new Map<string, number[]>();

const pepper =
  process.env.SESSION_SECRET?.trim() || randomBytes(32).toString("hex");

function hashValue(value: string) {
  return createHmac("sha256", pepper).update(value).digest("hex");
}

function hashesMatch(left: string, right: string) {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

function pruneExpired() {
  const now = Date.now();
  for (const [id, ticket] of tickets) {
    if (ticket.expiresAt <= now) tickets.delete(id);
  }
  for (const [token, grant] of grants) {
    if (grant.expiresAt <= now) grants.delete(token);
  }
}

function tooManyRequests(key: string) {
  const now = Date.now();
  const hits = (requestHits.get(key) ?? []).filter((at) => now - at < REQUEST_WINDOW_MS);
  if (hits.length >= MAX_REQUESTS) {
    requestHits.set(key, hits);
    return true;
  }
  hits.push(now);
  requestHits.set(key, hits);
  return false;
}

function localPhoneDigits(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("65") && digits.length === 10) digits = digits.slice(2);
  return digits;
}

function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  if (!name || !domain) return "your email";
  return `${name.slice(0, 1)}***@${domain}`;
}

function accountEmail(user: { email: string | null; username: string }) {
  const email = user.email?.trim().toLowerCase();
  if (email?.includes("@")) return email;
  const username = user.username.trim().toLowerCase();
  return username.includes("@") ? username : "";
}

async function findByEmail(email: string) {
  const lookup = () =>
    masterDb
      .select()
      .from(usersTable)
      .where(sql`lower(${usersTable.email}) = ${email} OR lower(${usersTable.username}) = ${email}`)
      .limit(1);

  let [user] = await lookup();
  if (!user) {
    await publishAllCompanyUsersToMaster().catch(() => undefined);
    [user] = await lookup();
  }
  return user ?? null;
}

async function findByPhone(digits: string) {
  const lookup = () =>
    masterDb
      .select()
      .from(usersTable)
      .where(
        sql`right(regexp_replace(coalesce(${usersTable.phoneNumber}, ''), '\\D', '', 'g'), 8) = ${digits}`,
      )
      .limit(1);

  let [user] = await lookup();
  if (!user) {
    await publishAllCompanyUsersToMaster().catch(() => undefined);
    [user] = await lookup();
  }
  return user ?? null;
}

async function sendOtpEmail(to: string, otp: string) {
  const settings = resolveSmtpSettings(null);
  if (!settings) {
    throw new Error("Email delivery is not configured");
  }
  const transporter = createMailTransporter(settings);
  await transporter.sendMail({
    from: settings.smtpFrom || settings.smtpUser,
    to,
    subject: "BizOne password reset code",
    text: `Your BizOne password reset code is ${otp}. It expires in 10 minutes. If you did not ask for this, you can ignore this email.`,
    html: `<p>Your BizOne password reset code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px;">${otp}</p><p>This code expires in 10 minutes. If you did not ask to reset your password, you can ignore this email.</p>`,
  });
}

async function savePassword(userId: number, username: string, companyId: number | null, passwordHash: string) {
  const { setLoginPasswordHash } = await import("../lib/login-password.js");
  const loginName = username.trim().toLowerCase();
  await setLoginPasswordHash(userId, passwordHash);
  await masterDb
    .update(usersTable)
    .set({ updatedAt: new Date() })
    .where(eq(usersTable.id, userId));

  if (!companyId) return;
  try {
    const tenantPool = await openCompanyPool(companyId);
    if (!tenantPool) return;
    await companyDbContext.run(tenantPool, async () => {
      await tenantPool.query(
        `UPDATE users SET password_hash = $1, updated_at = now()
         WHERE id = $2 OR lower(username) = $3`,
        [passwordHash, userId, loginName],
      ).catch(() => undefined);
    });
  } catch (err) {
    logger.warn(
      { userId, companyId, err: err instanceof Error ? err.message : String(err) },
      "password updated for sign-in, company copy was not updated",
    );
  }
}

const router: IRouter = Router();

router.post("/auth/forgot-password/request", async (req, res): Promise<void> => {
  pruneExpired();
  const channel = req.body?.channel === "phone" ? "phone" : req.body?.channel === "email" ? "email" : "";
  const raw = String(req.body?.value ?? "").trim();
  if (!channel || !raw) {
    res.status(400).json({ error: "Choose email or contact number" });
    return;
  }

  const limitKey = `${channel}:${raw.toLowerCase()}`;
  if (tooManyRequests(limitKey)) {
    res.status(429).json({ error: "Too many attempts. Try again in a few minutes." });
    return;
  }

  const user =
    channel === "email"
      ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)
        ? await findByEmail(raw.toLowerCase())
        : null
      : /^\d{8}$/.test(localPhoneDigits(raw))
        ? await findByPhone(localPhoneDigits(raw))
        : null;

  if (channel === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
    res.status(400).json({ error: "Enter a valid email address" });
    return;
  }
  if (channel === "phone" && localPhoneDigits(raw).length !== 8) {
    res.status(400).json({ error: "Enter a valid 8-digit contact number" });
    return;
  }
  if (!user) {
    res.status(404).json({
      error: channel === "email" ? "No account found with this email" : "No account found with this contact number",
    });
    return;
  }
  if (user.isActive === false) {
    res.status(403).json({ error: "Your account is inactive. Contact your administrator." });
    return;
  }

  const destination = accountEmail(user);
  if (!destination) {
    res.status(400).json({
      error: "This account has no email. Ask your administrator to reset the password.",
    });
    return;
  }

  const otp = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const resetId = randomBytes(24).toString("hex");
  try {
    await sendOtpEmail(destination, otp);
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "password reset email failed",
    );
    res.status(502).json({ error: "Could not send the verification code. Try again in a moment." });
    return;
  }

  tickets.set(resetId, {
    userId: user.id,
    otpHash: hashValue(otp),
    expiresAt: Date.now() + OTP_TTL_MS,
    attempts: 0,
  });

  res.json({
    resetId,
    masked: maskEmail(destination),
    expiresIn: OTP_TTL_MS / 1000,
  });
});

router.post("/auth/forgot-password/verify", async (req, res): Promise<void> => {
  pruneExpired();
  const resetId = String(req.body?.resetId ?? "");
  const otp = String(req.body?.otp ?? "").replace(/\D/g, "");
  const ticket = tickets.get(resetId);
  if (!ticket || ticket.expiresAt <= Date.now()) {
    tickets.delete(resetId);
    res.status(400).json({ error: "This code has expired. Request a new one." });
    return;
  }
  if (!/^\d{6}$/.test(otp) || !hashesMatch(ticket.otpHash, hashValue(otp))) {
    ticket.attempts += 1;
    if (ticket.attempts >= MAX_OTP_ATTEMPTS) {
      tickets.delete(resetId);
      res.status(400).json({ error: "Too many incorrect codes. Request a new one." });
      return;
    }
    res.status(400).json({ error: "Incorrect code" });
    return;
  }

  tickets.delete(resetId);
  const resetToken = randomBytes(32).toString("hex");
  grants.set(resetToken, { userId: ticket.userId, expiresAt: Date.now() + RESET_TTL_MS });
  res.json({ resetToken });
});

router.post("/auth/forgot-password/reset", async (req, res): Promise<void> => {
  pruneExpired();
  const resetToken = String(req.body?.resetToken ?? "");
  const password = String(req.body?.password ?? "");
  const confirmPassword = String(req.body?.confirmPassword ?? "");
  const grant = grants.get(resetToken);
  if (!grant || grant.expiresAt <= Date.now()) {
    grants.delete(resetToken);
    res.status(400).json({ error: "Reset session expired. Start again from Forgot Password." });
    return;
  }
  if (
    !password ||
    !/^[A-Z]/.test(password) ||
    !/\d/.test(password) ||
    !/[^A-Za-z0-9]/.test(password)
  ) {
    res.status(400).json({
      error: !password || !/^[A-Z]/.test(password)
        ? "Password must start with a capital letter"
        : "Password must start with a capital letter and include a number and a special character",
    });
    return;
  }
  if (password !== confirmPassword) {
    res.status(400).json({ error: "Password and confirm password do not match" });
    return;
  }

  const [user] = await masterDb.select().from(usersTable).where(eq(usersTable.id, grant.userId)).limit(1);
  if (!user || user.isActive === false) {
    grants.delete(resetToken);
    res.status(400).json({ error: "This account cannot be reset. Contact your administrator." });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await savePassword(user.id, user.username, user.companyId, passwordHash);
  grants.delete(resetToken);
  res.json({ message: "Password reset. Sign in with your new password." });
});

export default router;
