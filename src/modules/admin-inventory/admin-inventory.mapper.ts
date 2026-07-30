import {
    InventoryReceiptDto,
    InventoryReceiptItemDto,
    InventoryReceiptListItemDto,
    InventoryVariantDto,
  } from "./admin-inventory.dto";
  
  const toNumber = (value: unknown): number => {
    if (value === null || value === undefined) return 0;
    return Number(value);
  };
  
  const toISOString = (value: any): string => {
    return value?.toISOString?.() ?? String(value);
  };
  
  const getStockStatus = (
    stockQuantity: number,
    lowStockThreshold = 5
  ): "in-stock" | "low-stock" | "out-of-stock" => {
    if (stockQuantity <= 0) return "out-of-stock";
    if (stockQuantity <= lowStockThreshold) return "low-stock";
    return "in-stock";
  };
  
  /**
   * mapInventoryVariantToDto:
   * Map variant sang dữ liệu tồn kho cho Admin.
   */
  export const mapInventoryVariantToDto = (
    variant: any,
    lowStockThreshold = 5
  ): InventoryVariantDto => {
    const stockQuantity = variant.stock_quantity ?? 0;
  
    const inStockItems =
      variant.product_items?.filter((item: any) => item.status === 1).length ?? 0;
  
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
      country: variant.country,
  
      price: toNumber(variant.price),
      stockQuantity,
      stockStatus: getStockStatus(stockQuantity, lowStockThreshold),
  
      totalProductItems: variant._count?.product_items ?? 0,
      inStockItems,
    };
  };
  
  /**
   * Map một dòng trong phiếu nhập kho.
   */
  const mapInventoryReceiptItemToDto = (
    item: any
  ): InventoryReceiptItemDto => {
    const variant = item.product_variants;
    const product = variant?.products;
  
    const costPrice = toNumber(item.cost_price);
    const quantity = item.quantity;
  
    return {
      receiptDetailId: item.receipt_detail_id,
      variantId: item.variant_id,
      productId: variant?.product_id ?? 0,
      productName: product?.name ?? "",
      productSlug: product?.slug ?? "",
  
      sku: variant?.sku ?? "",
      color: variant?.color ?? null,
      capacity: variant?.capacity ?? null,
      ram: variant?.ram ?? null,
  
      quantity,
      costPrice,
      lineTotal: quantity * costPrice,
  
      serialNumbers: (item.product_items ?? []).map(
        (productItem: any) => productItem.serial_number
      ),
    };
  };
  
  /**
   * mapInventoryReceiptToDto:
   * Map chi tiết phiếu nhập kho.
   */
  export const mapInventoryReceiptToDto = (
    receipt: any
  ): InventoryReceiptDto => {
    return {
      receiptId: receipt.receipt_id,
      warehouseStaffId: receipt.warehouse_staff_id,
      warehouseStaffName: receipt.users?.full_name ?? null,
      supplierId: receipt.supplier_id,
      supplierName:
        receipt.supplier_name ?? receipt.suppliers?.supplier_name ?? null,
      totalAmount: toNumber(receipt.total_amount),
      createdAt: toISOString(receipt.created_at),
      items: (receipt.inventory_receipt_details ?? []).map(
        mapInventoryReceiptItemToDto
      ),
    };
  };
  
  /**
   * mapInventoryReceiptListItemToDto:
   * Map phiếu nhập cho bảng danh sách.
   */
  export const mapInventoryReceiptListItemToDto = (
    receipt: any
  ): InventoryReceiptListItemDto => {
    const totalQuantity = (receipt.inventory_receipt_details ?? []).reduce(
      (sum: number, item: any) => sum + item.quantity,
      0
    );
  
    return {
      receiptId: receipt.receipt_id,
      warehouseStaffId: receipt.warehouse_staff_id,
      warehouseStaffName: receipt.users?.full_name ?? null,
      supplierId: receipt.supplier_id,
      supplierName:
        receipt.supplier_name ?? receipt.suppliers?.supplier_name ?? null,
      totalAmount: toNumber(receipt.total_amount),
      totalQuantity,
      createdAt: toISOString(receipt.created_at),
    };
  };