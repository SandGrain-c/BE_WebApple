// src/modules/cart/cart.service.ts

import  prisma  from "../../utils/prisma";
import type {
  AddCartItemPayload,
  CartResponseDto,
  SelectAllCartItemsPayload,
  UpdateCartItemPayload,
  UpdateCartItemSelectedPayload,
} from "./cart.dto";
import { mapCartResponse } from "./cart.mapper";

export class CartServiceError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

const cartInclude = {
  cart_items: {
    orderBy: {
      cart_item_id: "asc" as const,
    },
    include: {
      product_variants: {
        include: {
          product_images: {
            where: {
              is_active: true,
            },
            orderBy: [
              {
                sort_order: "asc" as const,
              },
              {
                image_id: "asc" as const,
              },
            ],
          },
          products: {
            include: {
              categories: true,
              product_images: {
                where: {
                  is_active: true,
                },
                orderBy: [
                  {
                    is_thumbnail: "desc" as const,
                  },
                  {
                    sort_order: "asc" as const,
                  },
                  {
                    image_id: "asc" as const,
                  },
                ],
              },
            },
          },
        },
      },
    },
  },
};

const normalizeQuantity = (quantity?: number): number => {
  if (quantity === undefined || quantity === null) return 1;

  const numberValue = Number(quantity);

  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    throw new CartServiceError("Số lượng sản phẩm không hợp lệ", 400);
  }

  return numberValue;
};

export const getOrCreateCart = async (userId: number) => {
  return prisma.carts.upsert({
    where: {
      user_id: userId,
    },
    update: {},
    create: {
      user_id: userId,
    },
  });
};

export const getCartService = async (
  userId: number,
): Promise<CartResponseDto> => {
  const cart = await prisma.carts.findUnique({
    where: {
      user_id: userId,
    },
    include: cartInclude,
  });

  if (!cart) {
    return mapCartResponse([]);
  }

  return mapCartResponse(cart.cart_items);
};

export const addCartItemService = async (
  userId: number,
  payload: AddCartItemPayload,
): Promise<CartResponseDto> => {
  const quantity = normalizeQuantity(payload.quantity);

  const productId = Number(payload.productId);
  const variantId = Number(payload.variantId);

  if (!Number.isInteger(productId) || productId <= 0) {
    throw new CartServiceError("productId không hợp lệ", 400);
  }

  if (!Number.isInteger(variantId) || variantId <= 0) {
    throw new CartServiceError("variantId không hợp lệ", 400);
  }

  const variant = await prisma.product_variants.findUnique({
    where: {
      variant_id: variantId,
    },
    include: {
      products: true,
    },
  });

  if (!variant) {
    throw new CartServiceError("Không tìm thấy phiên bản sản phẩm", 404);
  }

  if (variant.product_id !== productId) {
    throw new CartServiceError(
      "Phiên bản sản phẩm không thuộc sản phẩm này",
      400,
    );
  }

  if (!variant.products.is_active) {
    throw new CartServiceError("Sản phẩm hiện không còn hoạt động", 400);
  }

  if (variant.stock_quantity <= 0) {
    throw new CartServiceError("Sản phẩm hiện đã hết hàng", 400);
  }

  if (quantity > variant.stock_quantity) {
    throw new CartServiceError(
      `Chỉ còn ${variant.stock_quantity} sản phẩm trong kho`,
      400,
    );
  }

  const cart = await getOrCreateCart(userId);

  const existingItem = await prisma.cart_items.findUnique({
    where: {
      cart_id_variant_id: {
        cart_id: cart.cart_id,
        variant_id: variantId,
      },
    },
  });

  if (existingItem) {
    const nextQuantity = existingItem.quantity + quantity;

    if (nextQuantity > variant.stock_quantity) {
      throw new CartServiceError(
        `Chỉ còn ${variant.stock_quantity} sản phẩm trong kho`,
        400,
      );
    }

    await prisma.cart_items.update({
      where: {
        cart_item_id: existingItem.cart_item_id,
      },
      data: {
        quantity: nextQuantity,
        selected: true,
      },
    });
  } else {
    await prisma.cart_items.create({
      data: {
        cart_id: cart.cart_id,
        variant_id: variantId,
        quantity,
      },
    });
  }

  return getCartService(userId);
};

export const updateCartItemQuantityService = async (
  userId: number,
  cartItemId: number,
  payload: UpdateCartItemPayload,
): Promise<CartResponseDto> => {
  const quantity = normalizeQuantity(payload.quantity);

  const cartItem = await prisma.cart_items.findFirst({
    where: {
      cart_item_id: cartItemId,
      carts: {
        is: {
          user_id: userId,
        },
      },
    },
    include: {
      product_variants: true,
    },
  });

  if (!cartItem) {
    throw new CartServiceError("Không tìm thấy sản phẩm trong giỏ hàng", 404);
  }

  if (quantity > cartItem.product_variants.stock_quantity) {
    throw new CartServiceError(
      `Chỉ còn ${cartItem.product_variants.stock_quantity} sản phẩm trong kho`,
      400,
    );
  }

  await prisma.cart_items.update({
    where: {
      cart_item_id: cartItemId,
    },
    data: {
      quantity,
    },
  });

  return getCartService(userId);
};

export const removeCartItemService = async (
  userId: number,
  cartItemId: number,
): Promise<CartResponseDto> => {
  const cartItem = await prisma.cart_items.findFirst({
    where: {
      cart_item_id: cartItemId,
      carts: {
        is: {
          user_id: userId,
        },
      },
    },
  });

  if (!cartItem) {
    throw new CartServiceError("Không tìm thấy sản phẩm trong giỏ hàng", 404);
  }

  await prisma.cart_items.delete({
    where: {
      cart_item_id: cartItemId,
    },
  });

  return getCartService(userId);
};

export const clearCartService = async (
  userId: number,
): Promise<CartResponseDto> => {
  const cart = await prisma.carts.findUnique({
    where: {
      user_id: userId,
    },
  });

  if (!cart) {
    return mapCartResponse([]);
  }

  await prisma.cart_items.deleteMany({
    where: {
      cart_id: cart.cart_id,
    },
  });

  return mapCartResponse([]);
};

export const updateCartItemSelectedService = async (
  userId: number,
  cartItemId: number,
  payload: UpdateCartItemSelectedPayload
): Promise<CartResponseDto> => {
  const selected = payload.selected;

  if (typeof selected !== "boolean") {
    throw new CartServiceError("Trạng thái chọn sản phẩm không hợp lệ", 400);
  }

  const cartItem = await prisma.cart_items.findFirst({
    where: {
      cart_item_id: cartItemId,
      carts: {
        is: {
          user_id: userId,
        },
      },
    },
  });

  if (!cartItem) {
    throw new CartServiceError("Không tìm thấy sản phẩm trong giỏ hàng", 404);
  }

  await prisma.cart_items.update({
    where: {
      cart_item_id: cartItemId,
    },
    data: {
      selected,
    },
  });

  return getCartService(userId);
};

export const selectAllCartItemsService = async (
  userId: number,
  payload: SelectAllCartItemsPayload
): Promise<CartResponseDto> => {
  const selected = payload.selected;

  if (typeof selected !== "boolean") {
    throw new CartServiceError("Trạng thái chọn tất cả không hợp lệ", 400);
  }

  const cart = await prisma.carts.findUnique({
    where: {
      user_id: userId,
    },
  });

  if (!cart) {
    return mapCartResponse([]);
  }

  await prisma.cart_items.updateMany({
    where: {
      cart_id: cart.cart_id,
    },
    data: {
      selected,
    },
  });

  return getCartService(userId);
};