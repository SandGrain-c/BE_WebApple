import type { Prisma } from "../../generated/prisma/client";

const PRODUCT_ITEM_STATUS = {
  InStock: 1,
  Reserved: 2,
} as const;

/**
 * Hoàn counter, serial đã reserve và reservation của một order trong cùng
 * transaction do caller quản lý. Counter chỉ được hoàn từ order detail; serial
 * release không cộng counter lần thứ hai.
 */
export const restoreOrderInventory = async (
  tx: Prisma.TransactionClient,
  orderId: number
) => {
  const orderDetails = await tx.order_details.findMany({
    where: {
      order_id: orderId,
    },
    select: {
      order_detail_id: true,
      variant_id: true,
      quantity: true,
    },
  });

  for (const detail of orderDetails) {
    await tx.product_variants.update({
      where: {
        variant_id: detail.variant_id,
      },
      data: {
        stock_quantity: {
          increment: detail.quantity,
        },
      },
    });
  }

  const orderDetailIds = orderDetails.map(
    (detail) => detail.order_detail_id
  );

  if (orderDetailIds.length > 0) {
    await tx.product_items.updateMany({
      where: {
        order_detail_id: {
          in: orderDetailIds,
        },
        status: PRODUCT_ITEM_STATUS.Reserved,
      },
      data: {
        status: PRODUCT_ITEM_STATUS.InStock,
        order_detail_id: null,
      },
    });
  }

  await tx.stock_reservations.updateMany({
    where: {
      order_id: orderId,
      status: "Active",
    },
    data: {
      status: "Released",
    },
  });
};
