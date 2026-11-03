import type { Request, Response, NextFunction } from "express";
import { loadAssignedModules } from "./assigned-modules.js";
import { modulesRequiredForApi, normalizeApiPath } from "./module-access.js";
import { checkCompanyLicense } from "./superadmin-engine.js";

function isAdminSession(req: Request): boolean {
  return Boolean(
    req.session?.isAdmin ||
    req.session?.isSuperAdmin ||
    req.session?.userRole === "admin" ||
    req.session?.userRole === "super_admin" ||
    req.session?.userRole === "administrator"
  );
}

/**
 * Assigned company modules are the source of truth for non-admin API access.
 * Hiding a sidebar item is not enough: the same module list is checked here.
 */
export async function enforceAssignedModules(req: Request, res: Response, next: NextFunction): Promise<void> {
  const path = normalizeApiPath(req.originalUrl || req.url || req.path);
  if (path.startsWith("/auth") || path.startsWith("/health") || path.startsWith("/superadmin")) {
    next();
    return;
  }
  if (!req.session?.userId) {
    next();
    return;
  }

  // Super Admin bypasses company tenant module restrictions
  if (req.session?.isSuperAdmin || req.session?.userRole === "super_admin") {
    next();
    return;
  }

  // License verification: enforce active license policy on company operations
  const companyId = req.session.companyId;
  if (companyId && !path.startsWith("/select-company") && !path.startsWith("/companies")) {
    try {
      const licCheck = await checkCompanyLicense(companyId);
      if (!licCheck.allowed) {
        res.status(403).json({
          error: licCheck.reason || "License expired or suspended",
          licenseStatus: licCheck.license?.status || "Blocked",
          licenseBlocked: true,
        });
        return;
      }
    } catch {}
  }

  if (isAdminSession(req)) {
    next();
    return;
  }

  try {
    const required = modulesRequiredForApi(path, req.method);
    if (!required) {
      next();
      return;
    }

    if (!companyId) {
      res.status(403).json({ error: "Active company context required" });
      return;
    }

    const assigned = await loadAssignedModules(req.session.userId, companyId);
    const allowed = required.some((moduleName) => assigned.includes(moduleName));
    if (!allowed) {
      res.status(403).json({ error: "Permission denied" });
      return;
    }
    next();
  } catch (err) {
    next(err);
  }
}
