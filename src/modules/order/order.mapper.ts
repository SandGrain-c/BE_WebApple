// srr/modules/order/order.mapper.ts

import { CustomerOrderDto, CustomerOrderItemDto } from "./order.dto";

/**
 * Chuyển Decimal của Prisma sang number.
 */
const toNumber = (value: unknown): number => {
  if (value === null || value === undefined) return 0;
  return Number(value);
};

/**
 * mapOrderItemToDto:
 * Chuyển order_details từ DB sang DTO cho FE.
 */
const mapOrderItemToDto = (item: any): CustomerOrderItemDto => {
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
 * mapOrderToDto:
 * Chuyển orders từ DB sang DTO cho FE.
 */
export const mapOrderToDto = (order: any): CustomerOrderDto => {
  return {
    orderId: order.order_id,
    orderCode: order.order_code,
    orderStatus: order.order_status,

    customerName: order.customer_name,
    customerPhone: order.customer_phone,
    shippingAddress: order.shipping_address,

    subTotal: toNumber(order.sub_total),
    shippingFee: toNumber(order.shipping_fee),
    discountAmount: toNumber(order.discount_amount),
    totalAmount: toNumber(order.total_amount),

    createdAt: order.created_at?.toISOString?.() ?? String(order.created_at),
    updatedAt: order.updated_at?.toISOString?.() ?? String(order.updated_at),

    items: (order.order_details ?? []).map(mapOrderItemToDto),
  };
};