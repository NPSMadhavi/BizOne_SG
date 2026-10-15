import type { Request, Response, NextFunction } from "express";
import { loadAssignedModules } from "./assigned-modules.js";
import { modulesRequiredForApi, normalizeApiPath } from "./module-access.js";

function isAdminSession(req: Request): boolean {
  return Boolean(req.session?.isAdmin || req.session?.userRole === "admin");
}

/**
 * Assigned company modules are the source of truth for non-admin API access.
 * Hiding a sidebar item is not enough: the same module list is checked here.
 */
export async function enforceAssignedModules(req: Request, res: Response, next: NextFunction): Promise<void> {
  const path = normalizeApiPath(req.originalUrl || req.url || req.path);
  if (path.startsWith("/auth") || path.startsWith("/health")) {
    next();
    return;
  }
  if (!req.session?.userId) {
    next();
    return;
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

    const companyId = req.session.companyId;
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
