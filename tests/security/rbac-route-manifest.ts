import type { FixtureManifest } from "../fixtures/fixture-manifest";

export const canonicalAdminRoles = [
  "Admin",
  "Staff",
  "WarehouseStaff",
] as const;

export type CanonicalAdminRole = (typeof canonicalAdminRoles)[number];
export type SecurityHttpMethod = "get" | "post" | "patch" | "delete";

export type RbacRouteManifestEntry = {
  id: string;
  module: string;
  kind: "read" | "mutation";
  method: SecurityHttpMethod;
  path: (manifest: FixtureManifest) => string;
  allowedRoles: readonly CanonicalAdminRole[];
  disallowedRoles: readonly CanonicalAdminRole[];
  invalidBody?: Record<string, unknown>;
  contractSource: "TEST_DECISIONS" | "as-built notification contract";
};

function entry(
  definition: Omit<RbacRouteManifestEntry, "disallowedRoles">,
): RbacRouteManifestEntry {
  return {
    ...definition,
    disallowedRoles: canonicalAdminRoles.filter(
      (role) => !definition.allowedRoles.includes(role),
    ),
  };
}

const staticPath = (path: string) => () => path;

export const rbacRouteManifest: readonly RbacRouteManifestEntry[] = [
  entry({
    id: "RBAC-DASHBOARD-READ",
    module: "Dashboard",
    kind: "read",
    method: "get",
    path: staticPath("/api/admin/dashboard/overview"),
    allowedRoles: canonicalAdminRoles,
    contractSource: "TEST_DECISIONS",
  }),
  entry({
    id: "RBAC-STAFF-READ",
    module: "Staff management",
    kind: "read",
    method: "get",
    path: staticPath("/api/admin/staff"),
    allowedRoles: ["Admin"],
    contractSource: "TEST_DECISIONS",
  }),
  entry({
    id: "RBAC-STAFF-CREATE",
    module: "Staff management",
    kind: "mutation",
    method: "post",
    path: staticPath("/api/admin/staff"),
    allowedRoles: ["Admin"],
    invalidBody: {},
    contractSource: "TEST_DECISIONS",
  }),
  entry({
    id: "RBAC-CATEGORY-READ",
    module: "Category",
    kind: "read",
    method: "get",
    path: staticPath("/api/admin/categories"),
    allowedRoles: ["Admin"],
    contractSource: "TEST_DECISIONS",
  }),
  entry({
    id: "RBAC-CATEGORY-CREATE",
    module: "Category",
    kind: "mutation",
    method: "post",
    path: staticPath("/api/admin/categories"),
    allowedRoles: ["Admin"],
    invalidBody: {},
    contractSource: "TEST_DECISIONS",
  }),
  entry({
    id: "RBAC-PRODUCT-READ",
    module: "Product",
    kind: "read",
    method: "get",
    path: staticPath("/api/admin/products"),
    allowedRoles: canonicalAdminRoles,
    contractSource: "TEST_DECISIONS",
  }),
  entry({
    id: "RBAC-PRODUCT-CREATE",
    module: "Product",
    kind: "mutation",
    method: "post",
    path: staticPath("/api/admin/products"),
    allowedRoles: ["Admin", "Staff"],
    invalidBody: {},
    contractSource: "TEST_DECISIONS",
  }),
  entry({
    id: "RBAC-VARIANT-READ",
    module: "Variant",
    kind: "read",
    method: "get",
    path: (manifest) =>
      `/api/admin/products/${manifest.catalog.product_active.productId}/variants`,
    allowedRoles: canonicalAdminRoles,
    contractSource: "TEST_DECISIONS",
  }),
  entry({
    id: "RBAC-VARIANT-CREATE",
    module: "Variant",
    kind: "mutation",
    method: "post",
    path: (manifest) =>
      `/api/admin/products/${manifest.catalog.product_active.productId}/variants`,
    allowedRoles: ["Admin", "Staff"],
    invalidBody: {},
    contractSource: "TEST_DECISIONS",
  }),
  entry({
    id: "RBAC-PRODUCT-IMAGE-READ",
    module: "Product image",
    kind: "read",
    method: "get",
    path: (manifest) =>
      `/api/admin/products/${manifest.catalog.product_active.productId}/images`,
    allowedRoles: ["Admin", "Staff"],
    contractSource: "TEST_DECISIONS",
  }),
  entry({
    id: "RBAC-PRODUCT-IMAGE-THUMBNAIL",
    module: "Product image",
    kind: "mutation",
    method: "patch",
    path: (manifest) =>
      `/api/admin/product-images/${manifest.adminDomain.productImage.imageId}/thumbnail`,
    allowedRoles: ["Admin", "Staff"],
    invalidBody: {},
    contractSource: "TEST_DECISIONS",
  }),
  entry({
    id: "RBAC-BANNER-READ",
    module: "Banner",
    kind: "read",
    method: "get",
    path: staticPath("/api/admin/banners"),
    allowedRoles: ["Admin", "Staff"],
    contractSource: "TEST_DECISIONS",
  }),
  entry({
    id: "RBAC-BANNER-CREATE",
    module: "Banner",
    kind: "mutation",
    method: "post",
    path: staticPath("/api/admin/banners"),
    allowedRoles: ["Admin", "Staff"],
    invalidBody: {},
    contractSource: "TEST_DECISIONS",
  }),
  entry({
    id: "RBAC-ORDER-READ",
    module: "Order",
    kind: "read",
    method: "get",
    path: staticPath("/api/admin/orders"),
    allowedRoles: ["Admin", "Staff"],
    contractSource: "TEST_DECISIONS",
  }),
  entry({
    id: "RBAC-ORDER-STATUS",
    module: "Order",
    kind: "mutation",
    method: "patch",
    path: (manifest) =>
      `/api/admin/orders/${manifest.ownership.order_b.orderId}/status`,
    allowedRoles: ["Admin", "Staff"],
    invalidBody: {},
    contractSource: "TEST_DECISIONS",
  }),
  entry({
    id: "RBAC-PAYMENT-READ",
    module: "Payment",
    kind: "read",
    method: "get",
    path: staticPath("/api/admin/payment-transactions"),
    allowedRoles: ["Admin", "Staff"],
    contractSource: "TEST_DECISIONS",
  }),
  entry({
    id: "RBAC-PAYMENT-STATUS",
    module: "Payment",
    kind: "mutation",
    method: "patch",
    path: (manifest) =>
      `/api/admin/payment-transactions/${manifest.ownership.payment_b.transactionId}/status`,
    allowedRoles: ["Admin", "Staff"],
    invalidBody: {},
    contractSource: "TEST_DECISIONS",
  }),
  entry({
    id: "RBAC-SHIPMENT-READ",
    module: "Shipment",
    kind: "read",
    method: "get",
    path: staticPath("/api/admin/shipments"),
    allowedRoles: canonicalAdminRoles,
    contractSource: "TEST_DECISIONS",
  }),
  entry({
    id: "RBAC-SHIPMENT-CREATE",
    module: "Shipment",
    kind: "mutation",
    method: "post",
    path: staticPath("/api/admin/shipments"),
    allowedRoles: canonicalAdminRoles,
    invalidBody: {},
    contractSource: "TEST_DECISIONS",
  }),
  entry({
    id: "RBAC-VOUCHER-READ",
    module: "Voucher",
    kind: "read",
    method: "get",
    path: staticPath("/api/admin/vouchers"),
    allowedRoles: ["Admin", "Staff"],
    contractSource: "TEST_DECISIONS",
  }),
  entry({
    id: "RBAC-VOUCHER-CREATE",
    module: "Voucher",
    kind: "mutation",
    method: "post",
    path: staticPath("/api/admin/vouchers"),
    allowedRoles: ["Admin", "Staff"],
    invalidBody: {},
    contractSource: "TEST_DECISIONS",
  }),
  entry({
    id: "RBAC-REVIEW-READ",
    module: "Review moderation",
    kind: "read",
    method: "get",
    path: staticPath("/api/admin/reviews"),
    allowedRoles: ["Admin", "Staff"],
    contractSource: "TEST_DECISIONS",
  }),
  entry({
    id: "RBAC-REVIEW-VISIBILITY",
    module: "Review moderation",
    kind: "mutation",
    method: "patch",
    path: (manifest) =>
      `/api/admin/reviews/${manifest.ownership.review_b.reviewId}/visibility`,
    allowedRoles: ["Admin", "Staff"],
    invalidBody: {},
    contractSource: "TEST_DECISIONS",
  }),
  entry({
    id: "RBAC-SUPPLIER-READ",
    module: "Supplier",
    kind: "read",
    method: "get",
    path: staticPath("/api/admin/suppliers"),
    allowedRoles: ["Admin", "WarehouseStaff"],
    contractSource: "TEST_DECISIONS",
  }),
  entry({
    id: "RBAC-SUPPLIER-CREATE",
    module: "Supplier",
    kind: "mutation",
    method: "post",
    path: staticPath("/api/admin/suppliers"),
    allowedRoles: ["Admin", "WarehouseStaff"],
    invalidBody: {},
    contractSource: "TEST_DECISIONS",
  }),
  entry({
    id: "RBAC-INVENTORY-READ",
    module: "Inventory",
    kind: "read",
    method: "get",
    path: staticPath("/api/admin/inventory/variants"),
    allowedRoles: ["Admin", "WarehouseStaff"],
    contractSource: "TEST_DECISIONS",
  }),
  entry({
    id: "RBAC-INVENTORY-ADJUST",
    module: "Inventory",
    kind: "mutation",
    method: "patch",
    path: (manifest) =>
      `/api/admin/inventory/variants/${manifest.catalog.variant_stock_10.variantId}/stock`,
    allowedRoles: ["Admin", "WarehouseStaff"],
    invalidBody: {},
    contractSource: "TEST_DECISIONS",
  }),
  entry({
    id: "RBAC-PRODUCT-ITEM-READ",
    module: "Product item/serial",
    kind: "read",
    method: "get",
    path: staticPath("/api/admin/product-items"),
    allowedRoles: ["Admin", "WarehouseStaff"],
    contractSource: "TEST_DECISIONS",
  }),
  entry({
    id: "RBAC-PRODUCT-ITEM-CREATE",
    module: "Product item/serial",
    kind: "mutation",
    method: "post",
    path: staticPath("/api/admin/product-items"),
    allowedRoles: ["Admin", "WarehouseStaff"],
    invalidBody: {},
    contractSource: "TEST_DECISIONS",
  }),
  entry({
    id: "RBAC-AUDIT-READ",
    module: "Audit log",
    kind: "read",
    method: "get",
    path: staticPath("/api/admin/audit-logs"),
    allowedRoles: ["Admin"],
    contractSource: "TEST_DECISIONS",
  }),
  entry({
    id: "RBAC-USER-READ",
    module: "User management",
    kind: "read",
    method: "get",
    path: staticPath("/api/admin/users"),
    allowedRoles: ["Admin"],
    contractSource: "TEST_DECISIONS",
  }),
  entry({
    id: "RBAC-USER-CREATE",
    module: "User management",
    kind: "mutation",
    method: "post",
    path: staticPath("/api/admin/users"),
    allowedRoles: ["Admin"],
    invalidBody: {},
    contractSource: "TEST_DECISIONS",
  }),
  entry({
    id: "RBAC-NOTIFICATION-READ",
    module: "Notification summary",
    kind: "read",
    method: "get",
    path: staticPath("/api/admin/notifications/summary"),
    allowedRoles: canonicalAdminRoles,
    contractSource: "as-built notification contract",
  }),
] as const;
