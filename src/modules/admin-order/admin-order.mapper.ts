// src/modules/admin-order/admin-order.mapper.ts
import {
    AdminOrderDto,
    AdminOrderItemDto,
    AdminOrderListItemDto,
    AdminOrderStatusHistoryDto,
  } from "./admin-order.dto";
  
  /**
   * Chuyển Decimal của Prisma sang number cho FE dễ xử lý.
   */
  const toNumber = (value: unknown): number => {
    if (value === null || value === undefined) return 0;
    return Number(value);
  };
  
  /**
   * Chuyển Date sang ISO string.
   */
  const toISOString = (value: any): string => {
    return value?.toISOString?.() ?? String(value);
  };
  
  /**
   * Map một dòng sản phẩm trong đơn hàng.
   */
  const mapAdminOrderItemToDto = (item: any): AdminOrderItemDto => {
    const variant = item.product_variants;
    const product = variant?.products;
  
    const unitPrice = toNumber(item.unit_price);
    const quantity = item.quantity;
  
    return {
      orderDetailId: item.order_detail_id,
      variantId: item.variant_id,
      productId: variant?.product_id ?? 0,
      productName: product?.name ?? "",
      productSlug: product?.slug ?? "",
      sku: variant?.sku ?? "",
      color: variant?.color ?? null,
      capacity: variant?.capacity ?? null,
      ram: variant?.ram ?? null,
      quantity,
      unitPrice,
      lineTotal: unitPrice * quantity,
    };
  };
  
  /**
   * Map lịch sử trạng thái đơn hàng.
   */
  const mapAdminOrderStatusHistoryToDto = (
    item: any
  ): AdminOrderStatusHistoryDto => {
    return {
      historyId: item.history_id,
      oldStatus: item.old_status,
      newStatus: item.new_status,
      changedBy: item.changed_by,
      changedByName: item.users?.full_name ?? null,
      note: item.note,
      createdAt: toISOString(item.created_at),
    };
  };
  
  /**
   * Map order detail cho trang chi tiết Admin.
   */
  export const mapAdminOrderToDto = (order: any): AdminOrderDto => {
    return {
      orderId: order.order_id,
      orderCode: order.order_code,
  
      userId: order.user_id,
      customerName: order.customer_name,
      customerPhone: order.customer_phone,
      shippingAddress: order.shipping_address,
  
      subTotal: toNumber(order.sub_total),
      shippingFee: toNumber(order.shipping_fee),
      discountAmount: toNumber(order.discount_amount),
      totalAmount: toNumber(order.total_amount),
  
      orderStatus: order.order_status,
      createdAt: toISOString(order.created_at),
      updatedAt: toISOString(order.updated_at),
  
      items: (order.order_details ?? []).map(mapAdminOrderItemToDto),
      statusHistory: (order.order_status_history ?? []).map(
        mapAdminOrderStatusHistoryToDto
      ),
    };
  };
  
  /**
   * Map order list cho bảng danh sách Admin.
   */
  export const mapAdminOrderListItemToDto = (
    order: any
  ): AdminOrderListItemDto => {
    const totalItems = (order.order_details ?? []).reduce(
      (sum: number, item: any) => sum + item.quantity,
      0
    );
  
    return {
      orderId: order.order_id,
      orderCode: order.order_code,
  
      userId: order.user_id,
      customerName: order.customer_name,
      customerPhone: order.customer_phone,
      shippingAddress: order.shipping_address,
  
      subTotal: toNumber(order.sub_total),
      shippingFee: toNumber(order.shipping_fee),
      discountAmount: toNumber(order.discount_amount),
      totalAmount: toNumber(order.total_amount),
  
      orderStatus: order.order_status,
      totalItems,
  
      createdAt: toISOString(order.created_at),
      updatedAt: toISOString(order.updated_at),
    };
  };