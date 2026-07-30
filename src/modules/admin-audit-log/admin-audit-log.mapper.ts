import { AdminAuditLogDto } from "./admin-audit-log.dto";

/**
 * Chuyển Date sang ISO string.
 */
const toISOString = (value: any): string => {
  return value?.toISOString?.() ?? String(value);
};

/**
 * parseAuditValue:
 * old_value/new_value có thể là string JSON hoặc Json object.
 * Hàm này giúp FE nhận dữ liệu dễ đọc hơn.
 */
const parseAuditValue = (value: unknown) => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

/**
 * mapAuditLogToDto:
 * Chuyển audit_logs từ DB sang DTO cho FE Admin.
 */
export const mapAuditLogToDto = (log: any): AdminAuditLogDto => {
  return {
    logId: log.log_id,

    userId: log.user_id,
    userName: log.users?.user_name ?? null,
    fullName: log.users?.full_name ?? null,
    roleName: log.users?.roles?.role_name ?? null,

    action: log.action,
    entityType: log.entity_type,
    entityId: log.entity_id,

    oldValue: parseAuditValue(log.old_value),
    newValue: parseAuditValue(log.new_value),

    createdAt: toISOString(log.created_at),
  };
};