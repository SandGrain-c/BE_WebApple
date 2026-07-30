export type AdminAuditLogDto = {
    logId: number;
  
    userId: number | null;
    userName: string | null;
    fullName: string | null;
    roleName: string | null;
  
    action: string;
    entityType: string | null;
    entityId: number | null;
  
    oldValue: unknown;
    newValue: unknown;
  
    createdAt: string;
  };
  
  export type AdminAuditLogListResponseDto = {
    items: AdminAuditLogDto[];
    pagination: {
      page: number;
      limit: number;
      totalItems: number;
      totalPages: number;
    };
  };
  
  export type GetAdminAuditLogsQuery = {
    search?: string;
    userId?: string;
    action?: string;
    entityType?: string;
    entityId?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: string;
    limit?: string;
    sort?: string;
  };
  
  export type AdminAuditLogMetaDto = {
    actions: string[];
    entityTypes: string[];
  };