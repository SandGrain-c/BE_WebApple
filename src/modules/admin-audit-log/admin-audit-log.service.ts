import prisma from "../../utils/prisma";
import {
  AdminAuditLogDto,
  AdminAuditLogListResponseDto,
  AdminAuditLogMetaDto,
  GetAdminAuditLogsQuery,
} from "./admin-audit-log.dto";
import { mapAuditLogToDto } from "./admin-audit-log.mapper";

export class AdminAuditLogServiceError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

const auditLogInclude = {
  users: {
    select: {
      user_id: true,
      user_name: true,
      full_name: true,
      roles: {
        select: {
          role_id: true,
          role_name: true,
        },
      },
    },
  },
};

/**
 * Chuẩn hóa text: bỏ khoảng trắng thừa.
 */
const normalizeText = (value?: string | null) => {
  const text = value?.trim();
  return text ? text : null;
};

/**
 * Parse ngày an toàn.
 */
const parseDate = (value: string, fieldName: string) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new AdminAuditLogServiceError(`${fieldName} không hợp lệ`, 400);
  }

  /**
   * Nếu FE gửi dạng YYYY-MM-DD thì set đầu/cuối ngày ở service gọi.
   */
  return date;
};

/**
 * GET /api/admin/audit-logs
 * Lấy danh sách audit logs.
 */
export const getAdminAuditLogsService = async (
  query: GetAdminAuditLogsQuery
): Promise<AdminAuditLogListResponseDto> => {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  const skip = (page - 1) * limit;

  const search = normalizeText(query.search);
  const action = normalizeText(query.action);
  const entityType = normalizeText(query.entityType);

  const userId =
    query.userId !== undefined && query.userId !== ""
      ? Number(query.userId)
      : undefined;

  const entityId =
    query.entityId !== undefined && query.entityId !== ""
      ? Number(query.entityId)
      : undefined;

  const where: any = {};

  if (search) {
    where.OR = [
      {
        action: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        entity_type: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        old_value: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        new_value: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        users: {
          full_name: {
            contains: search,
            mode: "insensitive",
          },
        },
      },
      {
        users: {
          user_name: {
            contains: search,
            mode: "insensitive",
          },
        },
      },
    ];
  }

  if (userId !== undefined) {
    if (Number.isNaN(userId)) {
      throw new AdminAuditLogServiceError("userId không hợp lệ", 400);
    }

    where.user_id = userId;
  }

  if (action) {
    where.action = action;
  }

  if (entityType) {
    where.entity_type = entityType;
  }

  if (entityId !== undefined) {
    if (Number.isNaN(entityId)) {
      throw new AdminAuditLogServiceError("entityId không hợp lệ", 400);
    }

    where.entity_id = entityId;
  }

  if (query.dateFrom || query.dateTo) {
    where.created_at = {};

    if (query.dateFrom) {
      const dateFrom = parseDate(query.dateFrom, "dateFrom");

      if (query.dateFrom.length <= 10) {
        dateFrom.setHours(0, 0, 0, 0);
      }

      where.created_at.gte = dateFrom;
    }

    if (query.dateTo) {
      const dateTo = parseDate(query.dateTo, "dateTo");

      if (query.dateTo.length <= 10) {
        dateTo.setHours(23, 59, 59, 999);
      }

      where.created_at.lte = dateTo;
    }
  }

  let orderBy: any = {
    created_at: "desc",
  };

  switch (query.sort) {
    case "oldest":
      orderBy = { created_at: "asc" };
      break;
    case "newest":
    default:
      orderBy = { created_at: "desc" };
      break;
  }

  const [logs, totalItems] = await Promise.all([
    prisma.audit_logs.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: auditLogInclude,
    }),

    prisma.audit_logs.count({
      where,
    }),
  ]);

  return {
    items: logs.map(mapAuditLogToDto),
    pagination: {
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    },
  };
};

/**
 * GET /api/admin/audit-logs/:logId
 * Lấy chi tiết audit log.
 */
export const getAdminAuditLogDetailService = async (
  logId: number
): Promise<AdminAuditLogDto> => {
  if (!logId || Number.isNaN(logId)) {
    throw new AdminAuditLogServiceError("logId không hợp lệ", 400);
  }

  const log = await prisma.audit_logs.findUnique({
    where: {
      log_id: logId,
    },
    include: auditLogInclude,
  });

  if (!log) {
    throw new AdminAuditLogServiceError("Không tìm thấy audit log", 404);
  }

  return mapAuditLogToDto(log);
};

/**
 * GET /api/admin/audit-logs/meta
 * Lấy metadata để FE làm filter.
 */
export const getAdminAuditLogMetaService =
  async (): Promise<AdminAuditLogMetaDto> => {
    const [actionRows, entityTypeRows] = await Promise.all([
      prisma.audit_logs.findMany({
        distinct: ["action"],
        select: {
          action: true,
        },
        orderBy: {
          action: "asc",
        },
      }),

      prisma.audit_logs.findMany({
        distinct: ["entity_type"],
        select: {
          entity_type: true,
        },
        orderBy: {
          entity_type: "asc",
        },
      }),
    ]);

    return {
      actions: actionRows.map((item) => item.action).filter(Boolean),
      entityTypes: entityTypeRows
        .map((item) => item.entity_type)
        .filter((item): item is string => !!item),
    };
  };