import express from "express";
import cors from "cors";

import adminAuthRoute from "../../modules/auth/admin-auth.route";
import bannerAdminRoute from "../../modules/banner/banner-admin.route";
import productImageAdminRoute from "../../modules/product-image/product-image-admin.route";
import adminProductRoute from "../../modules/admin-product/admin-product.route";
import adminVariantRoute from "../../modules/admin-variant/admin-variant.route";
import adminCategoryRoute from "../../modules/admin-category/admin-category.route";
import adminOrderRoute from "../../modules/admin-order/admin-order.route";
import adminVoucherRoute from "../../modules/admin-voucher/admin-voucher.route";
import adminReviewRoute from "../../modules/admin-review/admin-review.route";
import adminUserRoute from "../../modules/admin-user/admin-user.route";
import adminInventoryRoute from "../../modules/admin-inventory/admin-inventory.route";
import adminDashboardRoute from "../../modules/admin-dashboard/admin-dashboard.route";
import adminAuditLogRoute from "../../modules/admin-audit-log/admin-audit-log.route";
import adminSupplierRoute from "../../modules/admin-supplier/admin-supplier.route";
import shipmentAdminRoute from "../../modules/shipment/shipment-admin.route";
import paymentTransactionAdminRoute from "../../modules/payment-transaction/payment-transaction-admin.route";
import adminNotificationRoute from "../../modules/admin-notification/admin-notification.route";
import adminProductItemRoute from "../../modules/admin-product-item/admin-product-item.route";
import adminStaffRoute from "../../modules/admin-staff/admin-staff.route";
import { errorMiddleware } from "../../middlewares/error.middleware";
const checkRoute = (name: string, route: any) => {
  console.log(name, "=", typeof route);

  if (!route) {
    throw new Error(`${name} đang bị undefined. Kiểm tra export/import route.`);
  }
};
const adminApp = express();


adminApp.use(
  cors({
    origin: process.env.ADMIN_CLIENT_URL || "http://localhost:3000",
    credentials: true,
  })
);

adminApp.use(express.json());
checkRoute("adminAuthRoute", adminAuthRoute);
checkRoute("adminStaffRoute", adminStaffRoute);
checkRoute("bannerAdminRoute", bannerAdminRoute);
checkRoute("productImageAdminRoute", productImageAdminRoute);
checkRoute("adminProductRoute", adminProductRoute);
checkRoute("adminVariantRoute", adminVariantRoute);
checkRoute("adminCategoryRoute", adminCategoryRoute);
checkRoute("adminOrderRoute", adminOrderRoute);
checkRoute("adminVoucherRoute", adminVoucherRoute);
checkRoute("adminReviewRoute", adminReviewRoute);
checkRoute("adminUserRoute", adminUserRoute);
checkRoute("adminInventoryRoute", adminInventoryRoute);
checkRoute("adminDashboardRoute", adminDashboardRoute);
checkRoute("adminAuditLogRoute", adminAuditLogRoute);
checkRoute("adminSupplierRoute", adminSupplierRoute);
checkRoute("shipmentAdminRoute", shipmentAdminRoute);
checkRoute("paymentTransactionAdminRoute", paymentTransactionAdminRoute);
checkRoute("adminNotificationRoute", adminNotificationRoute);
checkRoute("adminProductItemRoute", adminProductItemRoute);
adminApp.get("/api/admin/health", (_req, res) => {
  res.json({
    success: true,
    message: "Admin API is running",
  });
});

// Admin Auth
adminApp.use("/api/admin/auth", adminAuthRoute);
// staff
adminApp.use("/api/admin/staff", adminStaffRoute);
// Admin Banner API
adminApp.use("/api/admin/banners", bannerAdminRoute);

// Admin Product Image API
adminApp.use("/api/admin", productImageAdminRoute);

// Admin Product CRUD
adminApp.use("/api/admin/products", adminProductRoute);
adminApp.use("/api/admin/product-items", adminProductItemRoute);
// Admin Variant CRUD 
adminApp.use("/api/admin", adminVariantRoute);

// Admin Category 
adminApp.use("/api/admin/categories", adminCategoryRoute);

// Admin Order
adminApp.use("/api/admin/orders", adminOrderRoute);

// Admin Voucher
adminApp.use("/api/admin/vouchers", adminVoucherRoute);

// Admin Review
adminApp.use("/api/admin/reviews", adminReviewRoute);

// Admin user
adminApp.use("/api/admin", adminUserRoute);

// Admin Inventory
adminApp.use("/api/admin/inventory", adminInventoryRoute);

// Admin Supplier
adminApp.use("/api/admin/suppliers", adminSupplierRoute);

// Dashboard 
adminApp.use("/api/admin/dashboard", adminDashboardRoute);

// Audit log
adminApp.use("/api/admin/audit-logs", adminAuditLogRoute);

// Shipment
adminApp.use("/api/admin/shipments", shipmentAdminRoute);

// Payment
adminApp.use("/api/admin/payment-transactions", paymentTransactionAdminRoute);

// Admin Notification
adminApp.use("/api/admin/notifications", adminNotificationRoute);

adminApp.use(errorMiddleware);

export default adminApp;