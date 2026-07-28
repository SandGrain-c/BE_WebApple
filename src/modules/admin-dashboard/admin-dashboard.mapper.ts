import {
    LowStockVariantDto,
    RecentOrderDto,
  } from "./admin-dashboard.dto";
  
  /**
   * Chuyển Decimal của Prisma sang number.
   */
  export const toNumber = (value: unknown): number => {
    if (value === null || value === undefined) return 0;
    return Number(value);
  };
  
  /**
   * Chuyển Date sang ISO string.
   */
  export const toISOString = (value: any): string => {
    return value?.toISOString?.() ?? String(value);
  };
  
  /**
   * Lấy ảnh đại diện sản phẩm.
   */
  export const getProductImage = (product: any): string | null => {
    const images = product?.product_images ?? [];
  
    const thumbnail = images.find((image: any) => image.is_thumbnail);
  
    return thumbnail?.image_url ?? images[0]?.image_url ?? null;
  };
  
  /**
   * Map variant tồn kho thấp.
   */
  export const mapLowStockVariantToDto = (
    variant: any
  ): LowStockVariantDto => {
    return {
      variantId: variant.variant_id,
      productId: variant.product_id,
      productName: variant.products?.name ?? "",
      productSlug: variant.products?.slug ?? "",
  
      sku: variant.sku,
      variantName: variant.variant_name,
      color: variant.color,
      capacity: variant.capacity,
      ram: variant.ram,
  
      stockQuantity: variant.stock_quantity,
    };
  };
  
  /**
   * Map đơn hàng gần đây.
   */
  export const mapRecentOrderToDto = (order: any): RecentOrderDto => {
    const totalItems = (order.order_details ?? []).reduce(
      (sum: number, item: any) => sum + item.quantity,
      0
    );
  
    return {
      orderId: order.order_id,
      orderCode: order.order_code,
  
      customerName: order.customer_name,
      customerPhone: order.customer_phone,
  
      orderStatus: order.order_status,
      totalAmount: toNumber(order.total_amount),
      totalItems,
  
      createdAt: toISOString(order.created_at),
    };
  };