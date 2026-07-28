import express from "express";
import cors from "cors";

import authRoute from "../../modules/auth/auth.route";
import productRoute from "../../modules/product/product.route";
import cartRoute from "../../modules/cart/cart.route";
import {errorMiddleware} from "../../middlewares/error.middleware";
import bannerPublicRoute from "../../modules/banner/banner-public.route";
import orderRoute from "../../modules/order/order.route";
import userAddressRoute from "../../modules/user-address/user-address.route";
import voucherRoute from "../../modules/voucher/voucher.route";
import reviewRoute from "../../modules/review/review.route";
import favoriteRoute from "../../modules/favorite/favorite.route";
import shipmentCustomerRoute from "../../modules/shipment/shipment-customer.route";
import paymentTransactionCustomerRoute from "../../modules/payment-transaction/payment-transaction-customer.route";
import payOSPaymentRoute from "../../modules/payment-transaction/payos-payment.route";
import userRoute from "../../modules/user/user.route";
const customerApp = express();

// Cho phép Customer FE gọi API
customerApp.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
  })
);

// Cho phép BE đọc JSON body từ request
customerApp.use(express.json());

// Route kiểm tra nhanh Customer API có chạy không
customerApp.get("/api/health", (_req, res) => {
  res.json({
    success: true,
    message: "Customer API is running",
  });
});

// Review
customerApp.use("/api", reviewRoute);

// Customer API: xác thực khách hàng
customerApp.use("/api/auth", authRoute);

// Customer API: lấy banner cho FE
customerApp.use("/api/banners", bannerPublicRoute);

// Customer API: sản phẩm public
customerApp.use("/api/products", productRoute);

// Customer API: giỏ hàng khách hàng
customerApp.use("/api/cart", cartRoute);

// Customer API: Order
customerApp.use("/api/orders", orderRoute);


// User Address 
customerApp.use("/api/user/addresses", userAddressRoute);

// User Profile
customerApp.use("/api/users", userRoute);

// Voucher
customerApp.use("/api/vouchers", voucherRoute);


// Favorite
customerApp.use("/api/favorites", favoriteRoute);

// Shipment
customerApp.use("/api/shipments", shipmentCustomerRoute);

// PayOS Payment
// Route này có webhook public, nên phải đặt trước route /api/payment-transactions tổng
customerApp.use("/api/payment-transactions/payos", payOSPaymentRoute);

// Payment Transaction Customer
customerApp.use("/api/payment-transactions", paymentTransactionCustomerRoute);
// Middleware xử lý lỗi cuối cùng
customerApp.use(errorMiddleware);

export default customerApp;