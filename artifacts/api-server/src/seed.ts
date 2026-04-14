import bcrypt from "bcryptjs";
import { db, usersTable, companiesTable, settingsTable } from "@workspace/db";
import { sql } from "drizzle-orm";

export async function seedIfEmpty() {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(usersTable);

  if (count > 0) {
    return;
  }

  const passwordHash = await bcrypt.hash("admin123", 10);

  await db.insert(usersTable).values({
    username: "admin",
    passwordHash,
    role: "admin",
  });

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

  const [settingsCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(settingsTable);

  if (settingsCount.count === 0) {
    await db.insert(settingsTable).values({ gstRate: "9" });
  }

  console.log("Seeded: admin user + 3 companies + settings");
}
