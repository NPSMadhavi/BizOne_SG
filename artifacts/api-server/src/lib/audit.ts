import { db, auditLogsTable } from "@workspace/db";

export interface AuditOptions {
  req: any;
  action: string;
  entityType: string;
  entityId?: string | number;
  entityLabel?: string;
  details?: any;
}

export function logAudit(opts: AuditOptions): void {
  db.insert(auditLogsTable).values({
    companyId: opts.req.session?.companyId ?? null,
    userId: opts.req.session?.userId ?? null,
    username: opts.req.session?.username ?? null,
    action: opts.action,
    entityType: opts.entityType,
    entityId: opts.entityId != null ? String(opts.entityId) : null,
    entityLabel: opts.entityLabel ?? null,
    details: opts.details ?? null,
    ipAddress: (opts.req.headers?.["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? opts.req.ip ?? null,
  }).catch(() => {});
}
