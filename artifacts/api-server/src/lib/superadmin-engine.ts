import pg from "pg";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { masterPool, APP_ALL_MODULES } from "@workspace/db";
import { logger } from "./logger.js";
import { setLoginPasswordHash } from "./login-password.js";

export function generateLicenseKey(prefix = "BIZ-SG"): string {
  const seg1 = crypto.randomBytes(2).toString("hex").toUpperCase();
  const seg2 = crypto.randomBytes(2).toString("hex").toUpperCase();
  const seg3 = crypto.randomBytes(2).toString("hex").toUpperCase();
  return `${prefix}-${seg1}-${seg2}-${seg3}`;
}

export function computeExpiryStatus(expiryDateStr: string | Date, status: string): string {
  if (status === "Suspended" || status === "Revoked" || status === "Pending") {
    return status;
  }
  const expiry = new Date(expiryDateStr);
  const now = new Date();
  // Strip time for clean date comparison
  const expDateOnly = new Date(expiry.getFullYear(), expiry.getMonth(), expiry.getDate());
  const todayDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (expDateOnly.getTime() < todayDateOnly.getTime()) {
    return "Expired";
  }
  return "Active";
}

export async function logSuperAdminAction(options: {
  userId?: number | null;
  username?: string;
  action: string;
  entityType: string;
  entityId?: string | number | null;
  details?: Record<string, any>;
  req?: any;
}): Promise<void> {
  const { userId, username = "superadmin", action, entityType, entityId, details = {}, req } = options;
  const ipAddress = req?.headers?.["x-forwarded-for"] || req?.socket?.remoteAddress || null;

  try {
    await masterPool.query(
      `INSERT INTO superadmin_audit_logs (
        user_id, username, action, entity_type, entity_id, details, ip_address, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [
        userId || null,
        username,
        action,
        entityType,
        entityId != null ? String(entityId) : null,
        JSON.stringify(details),
        ipAddress ? String(ipAddress).slice(0, 45) : null,
      ],
    );
  } catch (err: any) {
    logger.warn({ err: err?.message, action }, "[superadmin-audit] Failed to record audit log");
  }
}

export async function ensureSuperAdminSchema(pool: pg.Pool = masterPool): Promise<void> {
  // 1. Ensure master tables exist
  await pool.query(`
    -- Companies enhancements
    ALTER TABLE companies ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Active';
    ALTER TABLE companies ADD COLUMN IF NOT EXISTS notes TEXT;

    -- Subscription Plans
    CREATE TABLE IF NOT EXISTS superadmin_plans (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      description TEXT,
      duration TEXT NOT NULL DEFAULT 'Yearly',
      duration_days INTEGER NOT NULL DEFAULT 365,
      price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
      currency TEXT NOT NULL DEFAULT 'SGD',
      max_users INTEGER NOT NULL DEFAULT 5,
      modules JSONB NOT NULL DEFAULT '[]'::jsonb,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Licenses
    CREATE TABLE IF NOT EXISTS superadmin_licenses (
      id SERIAL PRIMARY KEY,
      license_key TEXT NOT NULL UNIQUE,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      plan_id INTEGER REFERENCES superadmin_plans(id) ON DELETE SET NULL,
      plan_type TEXT NOT NULL DEFAULT 'Standard',
      purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
      expiry_date DATE NOT NULL,
      is_renewable BOOLEAN NOT NULL DEFAULT TRUE,
      status TEXT NOT NULL DEFAULT 'Active',
      payment_status TEXT NOT NULL DEFAULT 'Paid',
      max_users INTEGER NOT NULL DEFAULT 5,
      enabled_modules JSONB NOT NULL DEFAULT '[]'::jsonb,
      notes TEXT,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_superadmin_licenses_company ON superadmin_licenses(company_id);
    CREATE INDEX IF NOT EXISTS idx_superadmin_licenses_status ON superadmin_licenses(status);
    CREATE INDEX IF NOT EXISTS idx_superadmin_licenses_expiry ON superadmin_licenses(expiry_date);

    -- Renewals History
    CREATE TABLE IF NOT EXISTS superadmin_license_renewals (
      id SERIAL PRIMARY KEY,
      license_id INTEGER NOT NULL REFERENCES superadmin_licenses(id) ON DELETE CASCADE,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      previous_expiry_date DATE NOT NULL,
      new_expiry_date DATE NOT NULL,
      renewal_date DATE NOT NULL DEFAULT CURRENT_DATE,
      payment_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
      payment_status TEXT NOT NULL DEFAULT 'Paid',
      payment_reference TEXT,
      notes TEXT,
      renewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_superadmin_renewals_license ON superadmin_license_renewals(license_id);
    CREATE INDEX IF NOT EXISTS idx_superadmin_renewals_company ON superadmin_license_renewals(company_id);

    -- Audit Logs
    CREATE TABLE IF NOT EXISTS superadmin_audit_logs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      username TEXT NOT NULL DEFAULT 'superadmin',
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      ip_address TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_superadmin_audit_logs_created ON superadmin_audit_logs(created_at DESC);
  `);

  // 2. Seed Default Plans if table is empty
  const plansCheck = await pool.query("SELECT count(*)::int as count FROM superadmin_plans");
  if ((plansCheck.rows[0]?.count ?? 0) === 0) {
    logger.info("[superadmin-engine] Seeding default Singapore ERP subscription plans...");
    const coreModules = [
      "dashboard", "invoices", "quotations", "sales_orders", "purchase_orders", "purchase_quotations",
      "vendors", "customers", "address_book", "accounting_coa", "accounting_je", "accounting_gl",
      "accounting_tb", "accounting_bs", "accounting_pl", "report_templates"
    ];
    const growthModules = [
      ...coreModules,
      "delivery_orders", "proforma_invoices", "credit_notes", "debit_notes", "grn", "stock_items",
      "warehouses", "stock_transfer", "inventory_reports", "accounting_bank_recon", "accounting_gst_f5",
      "accounting_gst_f7", "accounting_gst_io", "accounting_wht", "accounting_ar", "accounting_ap",
      "point_of_sale", "pos_retail", "pos_supermarket", "pos_reports"
    ];

    const defaultPlans = [
      {
        name: "Starter ERP (SG)",
        code: "sg_starter",
        description: "Essential Singapore accounting, billing, and quotes for startups and micro-enterprises.",
        duration: "Yearly",
        durationDays: 365,
        price: 588.00,
        currency: "SGD",
        maxUsers: 3,
        modules: coreModules,
      },
      {
        name: "Professional Growth (SG)",
        code: "sg_growth",
        description: "Full-suite accounting, Singapore GST F5/F7, multi-location inventory, POS, and sales operations.",
        duration: "Yearly",
        durationDays: 365,
        price: 1548.00,
        currency: "SGD",
        maxUsers: 10,
        modules: growthModules,
      },
      {
        name: "Enterprise Singapore Suite",
        code: "sg_enterprise",
        description: "Unlimited power: Singapore GST, multi-price level, POS retail/F&B, Payroll & IR8A, Projects, WMS.",
        duration: "Yearly",
        durationDays: 365,
        price: 3588.00,
        currency: "SGD",
        maxUsers: -1, // Unlimited
        modules: APP_ALL_MODULES,
      },
      {
        name: "Trial / Evaluation (30 Days)",
        code: "sg_trial",
        description: "Complimentary 30-day full access trial for newly registered Singapore businesses.",
        duration: "Custom",
        durationDays: 30,
        price: 0.00,
        currency: "SGD",
        maxUsers: 5,
        modules: APP_ALL_MODULES,
      },
    ];

    for (const p of defaultPlans) {
      await pool.query(
        `INSERT INTO superadmin_plans (
          name, code, description, duration, duration_days, price, currency, max_users, modules, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE)
        ON CONFLICT (code) DO NOTHING`,
        [p.name, p.code, p.description, p.duration, p.durationDays, p.price, p.currency, p.maxUsers, JSON.stringify(p.modules)],
      );
    }
  }

    // 3. Seed / Ensure Initial Super Admin user
  const envUsername = (process.env.SUPERADMIN_USERNAME || "superadmin").trim().toLowerCase();
  const envEmail = (process.env.SUPERADMIN_EMAIL || "superadmin@bizone.sg").trim().toLowerCase();
  const rawPassword = process.env.SUPERADMIN_PASSWORD || "SuperAdmin@2026!";
  const passwordHash = await bcrypt.hash(rawPassword, 10);

  const saCheck = await pool.query(
    "SELECT id, username, email FROM users WHERE LOWER(role) = 'super_admin' OR username = 'superadmin' OR LOWER(username) = $1 OR LOWER(email) = $2 LIMIT 1",
    [envUsername, envEmail]
  );

  let saUserId: number;
  if (!saCheck.rows[0]) {
    const insertUser = await pool.query(
      `INSERT INTO users (
        username, role, email, full_name, phone_number, is_active, created_at, updated_at
      ) VALUES ($1, 'super_admin', $2, 'BizOne Super Administrator', '+65 6221 0000', TRUE, NOW(), NOW())
      RETURNING id`,
      [envUsername, envEmail],
    );
    const saUser = insertUser.rows[0];
    saUserId = saUser.id;
    await setLoginPasswordHash(saUserId, passwordHash);
    logger.info({ username: envUsername, email: envEmail }, "[superadmin-engine] Initial Super Admin account created successfully.");

    await logSuperAdminAction({
      userId: saUserId,
      username: envUsername,
      action: "superadmin_account_initialized",
      entityType: "user",
      entityId: saUserId,
      details: { email: envEmail, note: "Initial system-created Super Admin" },
    });
  } else {
    saUserId = saCheck.rows[0].id;
    await setLoginPasswordHash(saUserId, passwordHash);
    await pool.query(
      `UPDATE users SET 
        username = $1,
        email = $2,
        role = 'super_admin',
        is_active = TRUE,
        updated_at = NOW()
       WHERE id = $3`,
      [envUsername, envEmail, saUserId]
    );
  }

  // 4. Backfill baseline licenses for any existing registered companies without a license record
  const unassignedCompanies = await pool.query(`
    SELECT c.id, c.name, c.created_at
    FROM companies c
    LEFT JOIN superadmin_licenses l ON l.company_id = c.id
    WHERE l.id IS NULL
  `);

  if (unassignedCompanies.rows.length > 0) {
    const trialPlan = (await pool.query("SELECT * FROM superadmin_plans WHERE code = 'sg_trial' LIMIT 1")).rows[0];
    const planId = trialPlan?.id || null;
    const planType = trialPlan?.name || "Trial / Evaluation (30 Days)";
    const modules = trialPlan?.modules || APP_ALL_MODULES;

    for (const comp of unassignedCompanies.rows) {
      const key = generateLicenseKey("BIZ-SG");
      const purchaseDate = new Date(comp.created_at || Date.now());
      // Give 365 days from creation or today
      const expiryDate = new Date();
      expiryDate.setFullYear(expiryDate.getFullYear() + 1);

      await pool.query(
        `INSERT INTO superadmin_licenses (
          license_key, company_id, plan_id, plan_type, purchase_date, expiry_date,
          is_renewable, status, payment_status, max_users, enabled_modules, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, TRUE, 'Active', 'Paid', 10, $7, 'Auto-assigned active baseline license')`,
        [key, comp.id, planId, planType, purchaseDate.toISOString().slice(0, 10), expiryDate.toISOString().slice(0, 10), JSON.stringify(modules)],
      );
    }
    logger.info({ count: unassignedCompanies.rows.length }, "[superadmin-engine] Baseline licenses assigned to existing companies.");
  }
}

/**
 * Automatically assigns a fresh trial license upon company registration
 */
export async function autoAssignSignupLicense(companyId: number, adminUserId?: number, companyName?: string): Promise<any> {
  try {
    await ensureSuperAdminSchema(masterPool);

    const trialPlan = (await masterPool.query("SELECT * FROM superadmin_plans WHERE code = 'sg_trial' LIMIT 1")).rows[0];
    const planId = trialPlan?.id || null;
    const planType = trialPlan?.name || "Trial / Evaluation (30 Days)";
    const durationDays = trialPlan?.duration_days || 30;
    const maxUsers = trialPlan?.max_users || 5;
    const modules = trialPlan?.modules || APP_ALL_MODULES;

    const licenseKey = generateLicenseKey("BIZ-SG-NEW");
    const purchaseDate = new Date();
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + durationDays);

    const ins = await masterPool.query(
      `INSERT INTO superadmin_licenses (
        license_key, company_id, plan_id, plan_type, purchase_date, expiry_date,
        is_renewable, status, payment_status, max_users, enabled_modules, notes, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, TRUE, 'Active', 'Paid', $7, $8, 'Automatic registration 30-day trial license', $9)
      RETURNING *`,
      [
        licenseKey,
        companyId,
        planId,
        planType,
        purchaseDate.toISOString().slice(0, 10),
        expiryDate.toISOString().slice(0, 10),
        maxUsers,
        JSON.stringify(modules),
        adminUserId || null,
      ],
    );

    const license = ins.rows[0];

    await logSuperAdminAction({
      userId: adminUserId,
      username: "system_signup",
      action: "company_signup_license_assigned",
      entityType: "license",
      entityId: license.id,
      details: { companyId, companyName, licenseKey, planType, expiryDate: license.expiry_date },
    });

    return license;
  } catch (err: any) {
    logger.error({ err: err?.message, companyId }, "[superadmin-engine] Failed to auto-assign signup license");
    return null;
  }
}

/**
 * Middleware: Verify if tenant company's license is active
 */
export async function checkCompanyLicense(companyId: number): Promise<{
  allowed: boolean;
  license?: any;
  reason?: string;
  daysRemaining?: number;
}> {
  try {
    const res = await masterPool.query(
      `SELECT * FROM superadmin_licenses WHERE company_id = $1 ORDER BY expiry_date DESC, id DESC LIMIT 1`,
      [companyId],
    );
    const license = res.rows[0];
    if (!license) {
      // If no license record exists, treat as allowed (to not break legacy tenants)
      return { allowed: true };
    }

    const currentStatus = computeExpiryStatus(license.expiry_date, license.status);

    // If status changed to expired in computation, update DB record
    if (currentStatus === "Expired" && license.status === "Active") {
      await masterPool.query("UPDATE superadmin_licenses SET status = 'Expired', updated_at = NOW() WHERE id = $1", [license.id]);
      license.status = "Expired";
    }

    const expiryTime = new Date(license.expiry_date).getTime();
    const nowTime = Date.now();
    const daysRemaining = Math.ceil((expiryTime - nowTime) / (1000 * 60 * 60 * 24));

    if (license.status === "Suspended") {
      return {
        allowed: false,
        license,
        reason: "Your company BizOne account and license have been suspended by the administrator. Please contact BizOne Support.",
        daysRemaining,
      };
    }

    if (license.status === "Revoked") {
      return {
        allowed: false,
        license,
        reason: "Your company BizOne license has been revoked. Please contact BizOne Support.",
        daysRemaining,
      };
    }

    if (currentStatus === "Expired") {
      // Allow 3 days grace period before hard-blocking ERP
      if (daysRemaining < -3) {
        return {
          allowed: false,
          license,
          reason: `Your BizOne subscription license expired on ${license.expiry_date}. Please contact your Super Administrator to renew.`,
          daysRemaining,
        };
      }
    }

    return { allowed: true, license, daysRemaining };
  } catch (err: any) {
    logger.warn({ err: err?.message, companyId }, "[superadmin-engine] License verification check bypassed on error");
    return { allowed: true };
  }
}

