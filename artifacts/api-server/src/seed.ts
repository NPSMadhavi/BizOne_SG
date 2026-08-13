import bcrypt from "bcryptjs";
import { db, usersTable, companiesTable, settingsTable, rolesTable, permissionsTable, rolePermissionsTable, APP_ALL_MODULES } from "@workspace/db";
import { sql, eq } from "drizzle-orm";

export async function seedRolesForCompany(companyId: number, tx: any = db) {
  const rolesToSeed = [
    { name: "Administrator", actions: ["view", "create", "edit", "delete"], modules: [...APP_ALL_MODULES] },
    { name: "Manager", actions: ["view", "create", "edit"], modules: [...APP_ALL_MODULES] },
    { name: "Employee", actions: ["view"], modules: ["dashboard", "assets", "licenses", "employees", "service_reports"] },
    { name: "Accountant", actions: ["view", "create", "edit", "delete"], modules: ["dashboard", "invoices", "proforma_invoices", "credit_notes", "debit_notes", "accounting_coa", "accounting_je", "accounting_gl", "accounting_tb", "accounting_bs", "accounting_pl", "accounting_cf", "accounting_gst_f5", "accounting_gst_f7", "accounting_gst_io", "accounting_wht", "accounting_eci", "accounting_formcs", "accounting_iaf", "accounting_ar", "accounting_ar_aging", "accounting_cust_stmt", "accounting_ap", "accounting_ap_aging", "accounting_vendor_stmt", "payroll"] },
    { name: "Sales User", actions: ["view", "create", "edit"], modules: ["dashboard", "quotations", "sales_orders", "invoices", "customers"] },
  ];

  const allPermissions = await tx.select().from(permissionsTable);

  for (const r of rolesToSeed) {
    let [existingRole] = await tx
      .select()
      .from(rolesTable)
      .where(sql`lower(${rolesTable.name}) = ${r.name.toLowerCase()} AND ${rolesTable.companyId} = ${companyId}`);

    if (!existingRole) {
      [existingRole] = await tx
        .insert(rolesTable)
        .values({ name: r.name, companyId })
        .returning();
    }

    const allowedPermissions = allPermissions.filter((p: any) =>
      r.modules.includes(p.module) && r.actions.includes(p.action)
    );

    for (const perm of allowedPermissions) {
      await tx
        .insert(rolePermissionsTable)
        .values({ roleId: existingRole.id, permissionId: perm.id })
        .onConflictDoNothing();
    }
  }
}

export async function seedIfEmpty() {
  // 1. Seed companies first
  const [{ companyCount }] = await db
    .select({ companyCount: sql<number>`count(*)::int` })
    .from(companiesTable);

  if (companyCount === 0) {
    console.log("[seed] No companies found — seeding 3 companies...");
    await db.insert(companiesTable).values([
      {
        name: "RSV Infotech Pte Ltd",
        country: "SG",
        address: "101 Cecil Street, #20-12 Tong Eng Building, Singapore 069533",
        registrationNo: "200812581D",
        email: "admin@rsvinfotech.com",
        phone: "+65 6221 1234",
      },
      {
        name: "Netopsys Pte Ltd",
        country: "SG",
        address: "101 Cecil Street, #20-12 Tong Eng Building, Singapore 069533",
        registrationNo: "202312345K",
        email: "admin@netopsys.com",
        phone: "+65 6221 5678",
      },
      {
        name: "Netopsys AI Pvt Ltd",
        country: "IN",
        address: "Bengaluru, Karnataka, India",
        registrationNo: "U72900KA2023PTC123456",
        email: "admin@netopsys.ai",
        phone: "+91 80 1234 5678",
      },
    ]);
    console.log("[seed] 3 companies created.");
  } else {
    console.log(`[seed] ${companyCount} company/companies already exist — skipping company seed.`);
  }

  // 2. Seed permissions
  console.log("[seed] Seeding module permissions...");
  const actions = ["view", "create", "edit", "delete"];
  for (const moduleName of APP_ALL_MODULES) {
    for (const actionName of actions) {
      await db
        .insert(permissionsTable)
        .values({ module: moduleName, action: actionName })
        .onConflictDoNothing();
    }
  }
  console.log("[seed] Permissions seeded successfully.");

  // 3. Seed roles for all companies
  const companies = await db.select().from(companiesTable);
  console.log(`[seed] Seeding roles for ${companies.length} company/companies...`);
  for (const company of companies) {
    await seedRolesForCompany(company.id);
  }
  console.log("[seed] Roles and role permissions seeded successfully.");

  // 4. Seed user (assigning to first company + Administrator role)
  const [{ userCount }] = await db
    .select({ userCount: sql<number>`count(*)::int` })
    .from(usersTable);

  if (userCount === 0) {
    console.log("[seed] No users found — creating admin account...");
    const firstCompany = companies[0] || (await db.select().from(companiesTable).limit(1))[0];
    if (!firstCompany) {
      throw new Error("No company found to associate seed admin with");
    }

    const [adminRole] = await db
      .select()
      .from(rolesTable)
      .where(sql`lower(${rolesTable.name}) = 'administrator' AND ${rolesTable.companyId} = ${firstCompany.id}`)
      .limit(1);

    if (!adminRole) {
      throw new Error(`Administrator role not found for company ${firstCompany.name}`);
    }

    const passwordHash = await bcrypt.hash("admin123", 10);
    await db.insert(usersTable).values({
      username: "admin",
      passwordHash,
      role: "admin",
      companyId: firstCompany.id,
      roleId: adminRole.id,
    });
    console.log("[seed] Admin user created under company " + firstCompany.name + " with Administrator role.");
  } else {
    console.log(`[seed] ${userCount} user(s) already exist — skipping user seed.`);
    // Backfill existing users if they have missing company_id or role_id
    const existingUsers = await db.select().from(usersTable);
    const firstCompany = companies[0];
    if (firstCompany) {
      for (const u of existingUsers) {
        if (!u.companyId || !u.roleId) {
          const [adminRole] = await db
            .select()
            .from(rolesTable)
            .where(sql`lower(${rolesTable.name}) = 'administrator' AND ${rolesTable.companyId} = ${u.companyId || firstCompany.id}`)
            .limit(1);

          await db
            .update(usersTable)
            .set({
              companyId: u.companyId || firstCompany.id,
              roleId: u.roleId || (adminRole ? adminRole.id : null),
            })
            .where(eq(usersTable.id, u.id));
        }
      }
    }
  }

  const [{ settingsCount }] = await db
    .select({ settingsCount: sql<number>`count(*)::int` })
    .from(settingsTable);

  if (settingsCount === 0) {
    await db.insert(settingsTable).values({ gstRate: "9" });
    console.log("[seed] Default settings created.");
  }
}
