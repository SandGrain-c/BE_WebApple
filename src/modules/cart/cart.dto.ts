// src/modules/cart/cart.dto.ts

export type CartItemDto = {
  cartItemId: number;

  productId: number;
  variantId: number;

  name: string;
  slug: string;
  categorySlug: string;

  image: string;
  color: string;
  capacity: string;
  ram: string;
  sku: string;

  price: number;
  oldPrice: number | null;

  quantity: number;
  stockQuantity: number;

  selected: boolean;
};

export type CartResponseDto = {
  items: CartItemDto[];
  totalQuantity: number;
  totalPrice: number;
  selectedQuantity: number;
  selectedTotalPrice: number;
};

export type AddCartItemPayload = {
  productId: number;
  variantId: number;
  quantity?: number;
};

export type UpdateCartItemPayload = {
  quantity: number;
};

export type UpdateCartItemSelectedPayload = {
  selected: boolean;
};

export type SelectAllCartItemsPayload = {
  selected: boolean;
};