// src/constants/role.constant.ts

/**
 * Role = vai trò tài khoản trong hệ thống.
 *
 * Lưu ý:
 * - Customer chỉ dùng cho web khách hàng.
 * - Các role còn lại dùng cho Admin API.
 */
export const ROLE = {
    CUSTOMER: "Customer",
    ADMIN: "Admin",
    STAFF: "Staff",
    WAREHOUSE_STAFF: "WarehouseStaff",
  } as const;
  
  export type RoleName = (typeof ROLE)[keyof typeof ROLE];
  
  export const ADMIN_LOGIN_ROLES = [
    ROLE.ADMIN,
    ROLE.STAFF,
    ROLE.WAREHOUSE_STAFF,
  ] as const;
  
  export const STAFF_MANAGEMENT_ROLES = [ROLE.ADMIN] as const;
  
  export const PRODUCT_MANAGEMENT_ROLES = [
    ROLE.ADMIN,
    ROLE.STAFF,
  ] as const;
  
  export const ORDER_MANAGEMENT_ROLES = [
    ROLE.ADMIN,
    ROLE.STAFF,
  ] as const;
  
  export const WAREHOUSE_MANAGEMENT_ROLES = [
    ROLE.ADMIN,
    ROLE.WAREHOUSE_STAFF,
  ] as const;
  
  export const DASHBOARD_ROLES = [
    ROLE.ADMIN,
    ROLE.STAFF,
    ROLE.WAREHOUSE_STAFF,
  ] as const;
  
  export const AUDIT_LOG_ROLES = [ROLE.ADMIN] as const;
  
  /**
   * Danh sách role mà Admin được phép gán cho tài khoản nhân viên.
   * Không cho tạo Customer ở API quản lý nhân viên.
   */
  export const MANAGEABLE_STAFF_ROLES = [
    ROLE.ADMIN,
    ROLE.STAFF,
    ROLE.WAREHOUSE_STAFF,
  ] as const;
  
  /**
   * Ma trận quyền để FE Admin có thể hiển thị menu theo role.
   */
  export const ROLE_PERMISSION_MATRIX = {
    [ROLE.ADMIN]: [
      "dashboard:view",
      "staff:manage",
      "user:manage",
      "category:manage",
      "product:manage",
      "variant:manage",
      "product-image:manage",
      "banner:manage",
      "order:manage",
      "shipment:manage",
      "payment:manage",
      "voucher:manage",
      "review:manage",
      "inventory:manage",
      "supplier:manage",
      "product-item:manage",
      "audit-log:view",
    ],
    [ROLE.STAFF]: [
      "dashboard:view",
      "product:view",
      "product:manage",
      "variant:manage",
      "product-image:manage",
      "banner:manage",
      "order:manage",
      "shipment:manage",
      "payment:manage",
      "voucher:manage",
      "review:manage",
    ],
    [ROLE.WAREHOUSE_STAFF]: [
      "dashboard:view",
      "inventory:manage",
      "supplier:manage",
      "product-item:manage",
      "shipment:manage",
      "product:view",
      "variant:view",
    ],
    [ROLE.CUSTOMER]: [
      "customer:shop",
    ],
  } as const;
  