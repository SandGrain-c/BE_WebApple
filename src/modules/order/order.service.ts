// src/modules/order/order.service.ts

import prisma from "../../utils/prisma";
import {
  CheckoutBody,
  CustomerOrderDto,
  CustomerOrderListResponseDto,
} from "./order.dto";
import { mapOrderToDto } from "./order.mapper";
import { validateVoucherForCheckout } from "../voucher/voucher.service";
import { createPayOSPaymentLinkForOrder } from "../payment-transaction/payos-payment.service";

export class OrderServiceError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * Include chuẩn để lấy order kèm sản phẩm/variant.
 */
const orderInclude = {
  order_details: {
    orderBy: {
      order_detail_id: "asc" as const,
    },
    include: {
      product_variants: {
        include: {
          products: true,
        },
      },
    },
  },
};

/**
 * Chuẩn hóa text, bỏ khoảng trắng thừa.
 */
const normalizeText = (value?: string | null) => {
  const text = value?.trim();
  return text ? text : null;
};

/**
 * Tạo mã đơn hàng.
 * Ví dụ: ORD-1782460599000-4821
 */
const generateOrderCode = () => {
  const timestamp = Date.now();
  const random = Math.floor(1000 + Math.random() * 9000);

  return `ORD-${timestamp}-${random}`;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const parseCheckoutBody = (value: unknown): CheckoutBody => {
  if (!isRecord(value)) {
    throw new OrderServiceError("Dữ liệu đặt hàng không hợp lệ", 400);
  }

  const addressId = value.addressId;

  if (
    typeof addressId !== "number" ||
    !Number.isFinite(addressId) ||
    !Number.isInteger(addressId) ||
    addressId <= 0
  ) {
    throw new OrderServiceError("Vui lòng chọn địa chỉ nhận hàng", 400);
  }

  const paymentMethod = value.paymentMethod;

  if (
    paymentMethod !== undefined &&
    paymentMethod !== "COD" &&
    paymentMethod !== "OnlineBanking"
  ) {
    throw new OrderServiceError("Phương thức thanh toán không hợp lệ", 400);
  }

  const voucherCode = value.voucherCode;

  if (
    voucherCode !== undefined &&
    (typeof voucherCode !== "string" || voucherCode.trim().length === 0)
  ) {
    throw new OrderServiceError("Mã giảm giá không hợp lệ", 400);
  }

  return {
    addressId,
    voucherCode,
    paymentMethod,
  };
};

/**
 * Lấy userId từ authMiddleware.
 */
const validateUserId = (userId: number) => {
  if (!userId || Number.isNaN(userId)) {
    throw new OrderServiceError("Bạn chưa đăng nhập", 401);
  }
};

/**
 * POST /api/orders/checkout
 * Tạo đơn hàng từ giỏ hàng hiện tại.
 */
export const checkoutService = async (
  userId: number,
  requestBody: unknown
): Promise<{
  order: CustomerOrderDto;
  payment: any | null;
}> => {
  validateUserId(userId);
  const body = parseCheckoutBody(requestBody);

  /**
   * paymentMethod:
   * - COD: thanh toán khi nhận hàng
   * - OnlineBanking: thanh toán online qua PayOS/VietQR
   */
  const paymentMethod = body.paymentMethod ?? "COD";
  const addressId = body.addressId;
  const shippingFee = 0;

  /**
   * COD:
   * - Không cần chờ thanh toán online.
   * - Đơn chuyển thẳng sang PendingConfirmation.
   *
   * OnlineBanking:
   * - Cần chờ khách quét QR thanh toán.
   * - Đơn ở trạng thái PendingPayment.
   */
  const initialOrderStatus =
    paymentMethod === "OnlineBanking"
      ? "PendingPayment"
      : "PendingConfirmation";

  /**
   * Transaction:
   * Gom nhiều thao tác DB thành một khối.
   * Nếu một bước lỗi, toàn bộ thay đổi sẽ rollback.
   */
  const createdOrder = await prisma.$transaction(async (tx) => {
    /**
     * Lấy địa chỉ nhận hàng từ DB.
     *
     * Snapshot = chụp lại dữ liệu tại thời điểm đặt hàng.
     * Sau này user sửa địa chỉ trong sổ địa chỉ thì đơn cũ vẫn giữ đúng địa chỉ lúc đặt.
     */
    const address = await tx.user_addresses.findFirst({
      where: {
        address_id: addressId,
        user_id: userId,
      },
      select: {
        address_id: true,
        receiver_name: true,
        receiver_phone: true,
        detailed_address: true,
        ward: true,
        city: true,
      },
    });
  
    if (!address) {
      throw new OrderServiceError("Địa chỉ nhận hàng không hợp lệ", 404);
    }
  
    const customerName = address.receiver_name;
    const customerPhone = address.receiver_phone;
    const shippingAddress = [
      address.detailed_address,
      address.ward,
      address.city,
    ]
      .filter(Boolean)
      .join(", ");
  
      const cart = await tx.carts.findUnique({
        where: {
          user_id: userId,
        },
        include: {
          cart_items: {
            where: {
              selected: true,
            },
            include: {
              product_variants: {
                include: {
                  products: true,
                },
              },
            },
          },
        },
      });

      if (!cart || cart.cart_items.length === 0) {
        throw new OrderServiceError("Vui lòng chọn sản phẩm để thanh toán", 400);
      }

    /**
     * Kiểm tra tồn kho và tính tổng tiền.
     */
    let subTotal = 0;

    for (const item of cart.cart_items) {
      const variant = item.product_variants;
      const product = variant.products;

      if (!product || !product.is_active) {
        throw new OrderServiceError(
          `Sản phẩm ${product?.name ?? ""} hiện không còn bán`,
          400
        );
      }

      if (item.quantity <= 0) {
        throw new OrderServiceError("Số lượng sản phẩm không hợp lệ", 400);
      }

      if (variant.stock_quantity < item.quantity) {
        throw new OrderServiceError(
          `Sản phẩm ${product.name} không đủ tồn kho`,
          400
        );
      }

      subTotal += Number(variant.price) * item.quantity;
    }

    let voucherId: number | null = null;
    let discountAmount = 0;

    if (body.voucherCode) {
      const voucherResult = await validateVoucherForCheckout(tx, {
        userId,
        code: body.voucherCode,
        subTotal,
      });

      voucherId = voucherResult.voucher.voucher_id;
      discountAmount = voucherResult.discountAmount;
    }

    const totalAmount = subTotal + shippingFee - discountAmount;

    if (totalAmount <= 0) {
      throw new OrderServiceError("Tổng tiền đơn hàng không hợp lệ", 400);
    }

    const order = await tx.orders.create({
      data: {
        user_id: userId,
        order_code: generateOrderCode(),
        voucher_id: voucherId,

        sub_total: subTotal,
        shipping_fee: shippingFee,
        discount_amount: discountAmount,
        total_amount: totalAmount,

        order_status: initialOrderStatus,

        customer_name: customerName,
        customer_phone: customerPhone,
        shipping_address: shippingAddress,
        address_id: address.address_id,

        updated_at: new Date(),
      },
    });

    /**
     * Tạo order_details và trừ tồn kho từng variant.
     *
     * Dùng updateMany + stock_quantity >= quantity để chống oversell.
     * Oversell = bán vượt quá tồn kho khi nhiều khách checkout cùng lúc.
     */
    for (const item of cart.cart_items) {
      const variant = item.product_variants;
      const product = variant.products;

      await tx.order_details.create({
        data: {
          order_id: order.order_id,
          variant_id: item.variant_id,
          quantity: item.quantity,
          unit_price: variant.price,
        },
      });

      const updateStockResult = await tx.product_variants.updateMany({
        where: {
          variant_id: item.variant_id,
          stock_quantity: {
            gte: item.quantity,
          },
        },
        data: {
          stock_quantity: {
            decrement: item.quantity,
          },
        },
      });

      if (updateStockResult.count === 0) {
        throw new OrderServiceError(
          `Sản phẩm ${product.name} không đủ tồn kho`,
          400
        );
      }
    }

    /**
     * Nếu dùng voucher:
     * - Ghi nhận voucher_usages.
     * - Tăng used_count.
     */
    if (voucherId !== null) {
      await tx.voucher_usages.create({
        data: {
          voucher_id: voucherId,
          user_id: userId,
          order_id: order.order_id,
        },
      });

      await tx.vouchers.update({
        where: {
          voucher_id: voucherId,
        },
        data: {
          used_count: {
            increment: 1,
          },
        },
      });
    }

    /**
     * Tạo payment transaction:
     * - COD: chờ khách thanh toán khi nhận hàng.
     * - OnlineBanking: chờ PayOS webhook xác nhận.
     */
    await tx.payment_transactions.create({
      data: {
        order_id: order.order_id,
        gateway: paymentMethod === "OnlineBanking" ? "payOS" : "COD",
        transaction_ref: null,
        amount: totalAmount,
        payment_type: "Payment",
        status: "Pending",
        gateway_response: null,
        paid_at: null,
        updated_at: new Date(),
      },
    });

    /**
     * Ghi lịch sử trạng thái đơn.
     */
    await tx.order_status_history.create({
      data: {
        order_id: order.order_id,
        old_status: null,
        new_status: initialOrderStatus,
        changed_by: userId,
        note:
          paymentMethod === "OnlineBanking"
            ? "Khách hàng tạo đơn hàng và chờ thanh toán PayOS"
            : "Khách hàng tạo đơn hàng COD",
      },
    });

    /**
     * Xóa item trong giỏ sau khi checkout thành công.
     *
     * Hiện tại xóa toàn bộ giỏ hàng.
     * Nếu FE sau này có checkbox selected item, cần đổi sang xóa selected=true.
     */
    await tx.cart_items.deleteMany({
      where: {
        cart_id: cart.cart_id,
        selected: true,
      },
    });

    return tx.orders.findUnique({
      where: {
        order_id: order.order_id,
      },
      include: orderInclude,
    });
  });

  if (!createdOrder) {
    throw new OrderServiceError("Tạo đơn hàng thất bại", 500);
  }

  /**
   * Quan trọng:
   * Không gọi PayOS bên trong prisma.$transaction.
   * Vì gọi API bên ngoài trong transaction sẽ làm transaction kéo dài,
   * dễ gây lỗi hoặc khóa DB lâu.
   */
  let payment: any | null = null;

  if (paymentMethod === "OnlineBanking") {
    payment = await createPayOSPaymentLinkForOrder(
      createdOrder.order_id,
      userId
    );
  }

  return {
    order: mapOrderToDto(createdOrder),
    payment,
  };
};

/**
 * GET /api/orders
 * Lấy lịch sử đơn hàng của user hiện tại.
 */
export const getMyOrdersService = async (
  userId: number
): Promise<CustomerOrderListResponseDto> => {
  validateUserId(userId);

  const orders = await prisma.orders.findMany({
    where: {
      user_id: userId,
    },
    orderBy: {
      created_at: "desc",
    },
    include: orderInclude,
  });

  return {
    items: orders.map(mapOrderToDto),
  };
};

/**
 * GET /api/orders/:orderId
 * Lấy chi tiết đơn hàng của user hiện tại.
 */
export const getMyOrderDetailService = async (
  userId: number,
  orderId: number
): Promise<CustomerOrderDto> => {
  validateUserId(userId);

  if (!orderId || Number.isNaN(orderId)) {
    throw new OrderServiceError("orderId không hợp lệ", 400);
  }

  const order = await prisma.orders.findFirst({
    where: {
      order_id: orderId,
      user_id: userId,
    },
    include: orderInclude,
  });

  if (!order) {
    throw new OrderServiceError("Không tìm thấy đơn hàng", 404);
  }

  return mapOrderToDto(order);
};

/**
 * PATCH /api/orders/:orderId/cancel
 * Khách hàng hủy đơn nếu đơn chưa xử lý sâu.
 */
export const cancelMyOrderService = async (
  userId: number,
  orderId: number
): Promise<CustomerOrderDto> => {
  validateUserId(userId);

  if (!orderId || Number.isNaN(orderId)) {
    throw new OrderServiceError("orderId không hợp lệ", 400);
  }

  /**
   * Customer chỉ được tự hủy khi đơn chưa xử lý sâu.
   */
  const cancellableStatuses = ["PendingPayment", "PendingConfirmation"];

  const cancelledOrder = await prisma.$transaction(async (tx) => {
    const order = await tx.orders.findFirst({
      where: {
        order_id: orderId,
        user_id: userId,
      },
      include: {
        order_details: true,
      },
    });

    if (!order) {
      throw new OrderServiceError("Không tìm thấy đơn hàng", 404);
    }

    if (!cancellableStatuses.includes(order.order_status)) {
      throw new OrderServiceError("Đơn hàng hiện không thể hủy", 400);
    }

    /**
     * Hoàn lại tồn kho cho các variant trong đơn.
     */
    for (const item of order.order_details) {
      await tx.product_variants.update({
        where: {
          variant_id: item.variant_id,
        },
        data: {
          stock_quantity: {
            increment: item.quantity,
          },
        },
      });
    }

    /**
     * Nếu đơn có dùng voucher:
     * - Xóa voucher usage để user có thể dùng lại nếu cần.
     * - Giảm used_count.
     */
    if (order.voucher_id) {
      await tx.voucher_usages.deleteMany({
        where: {
          order_id: order.order_id,
        },
      });

      await tx.vouchers.updateMany({
        where: {
          voucher_id: order.voucher_id,
          used_count: {
            gt: 0,
          },
        },
        data: {
          used_count: {
            decrement: 1,
          },
        },
      });
    }

    await tx.order_status_history.create({
      data: {
        order_id: order.order_id,
        old_status: order.order_status,
        new_status: "Cancelled",
        changed_by: userId,
        note: "Khách hàng hủy đơn hàng",
      },
    });

    await tx.orders.update({
      where: {
        order_id: order.order_id,
      },
      data: {
        order_status: "Cancelled",
        updated_at: new Date(),
      },
    });

    return tx.orders.findUnique({
      where: {
        order_id: order.order_id,
      },
      include: orderInclude,
    });
  });

  if (!cancelledOrder) {
    throw new OrderServiceError("Hủy đơn hàng thất bại", 500);
  }

  return mapOrderToDto(cancelledOrder);
};
