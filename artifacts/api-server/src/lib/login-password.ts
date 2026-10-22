import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { masterDb, loginCredentialsTable } from "@workspace/db";

export async function getLoginPasswordHash(userId: number): Promise<string | null> {
  const [row] = await masterDb
    .select({ passwordHash: loginCredentialsTable.passwordHash })
    .from(loginCredentialsTable)
    .where(eq(loginCredentialsTable.userId, userId))
    .limit(1);
  return row?.passwordHash ?? null;
}

export async function setLoginPasswordHash(userId: number, passwordHash: string): Promise<void> {
  const [existing] = await masterDb
    .select({ userId: loginCredentialsTable.userId })
    .from(loginCredentialsTable)
    .where(eq(loginCredentialsTable.userId, userId))
    .limit(1);
  if (existing) {
    await masterDb
      .update(loginCredentialsTable)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(loginCredentialsTable.userId, userId));
    return;
  }
  await masterDb.insert(loginCredentialsTable).values({ userId, passwordHash });
}

export async function loginPasswordMatches(userId: number, password: string): Promise<boolean> {
  const hash = await getLoginPasswordHash(userId);
  if (!hash) return false;
  return bcrypt.compare(password, hash);
}
