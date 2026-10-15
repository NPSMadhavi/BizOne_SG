import type { Request, Response, NextFunction } from "express";
import { db, rolePermissionsTable, permissionsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { loadAssignedModules } from "./assigned-modules.js";

async function fetchUserPermissions(roleId: number): Promise<string[]> {
  const rows = await db
    .select({
      module: permissionsTable.module,
      action: permissionsTable.action,
    })
    .from(rolePermissionsTable)
    .innerJoin(permissionsTable, eq(rolePermissionsTable.permissionId, permissionsTable.id))
    .where(eq(rolePermissionsTable.roleId, roleId));

  return rows.map(r => `${r.module}:${r.action}`);
}

export function requireAuthentication(req: Request, res: Response, next: NextFunction): void {
  if (!req.session || !req.session.userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (!req.session.companyId) {
    res.status(403).json({ error: "Active company context required" });
    return;
  }
  next();
}

export function requirePermission(permission: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.session || !req.session.userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const companyId = req.session.companyId;
    if (!companyId) {
      res.status(403).json({ error: "Active company context required" });
      return;
    }

    // Dynamic fallback to load permissions if missing in session
    if (!req.session.permissions) {
      if (req.session.roleId) {
        req.session.permissions = await fetchUserPermissions(req.session.roleId);
      } else {
        const [user] = await db
          .select()
          .from(usersTable)
          .where(eq(usersTable.id, req.session.userId));

        if (user && user.roleId) {
          req.session.roleId = user.roleId;
          req.session.permissions = await fetchUserPermissions(user.roleId);
        } else {
          req.session.permissions = [];
        }
      }
    }

    const userPermissions = req.session.permissions || [];
    const [moduleName, action] = permission.split(":");
    const isAdmin = Boolean(req.session.isAdmin || req.session.userRole === "admin");
    if (!isAdmin && moduleName) {
      const assigned = await loadAssignedModules(req.session.userId, companyId);
      if (!assigned.includes(moduleName)) {
        res.status(403).json({ error: `Permission denied: ${permission}` });
        return;
      }
      if (!userPermissions.includes(permission)) {
        const roleDefinesModule = userPermissions.some((entry) => entry.startsWith(`${moduleName}:`));
        if (!roleDefinesModule && (action === "view" || action === "create" || action === "edit")) {
          next();
          return;
        }
        res.status(403).json({ error: `Permission denied: ${permission}` });
        return;
      }
    } else if (!userPermissions.includes(permission)) {
      res.status(403).json({ error: `Permission denied: ${permission}` });
      return;
    }

    next();
  };
}
