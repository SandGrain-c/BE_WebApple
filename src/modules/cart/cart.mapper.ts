// src/modules/cart/cart.mapper.ts

import type { CartItemDto, CartResponseDto } from "./cart.dto";

const getProductImage = (item: any) => {
  const variantImage = item.product_variants?.product_images?.[0]?.image_url;
  const productImage =
    item.product_variants?.products?.product_images?.[0]?.image_url;

  return variantImage || productImage || "";
};

export const mapCartItemToDto = (item: any): CartItemDto => {
  const variant = item.product_variants;
  const product = variant.products;

  return {
    cartItemId: item.cart_item_id,

    productId: product.product_id,
    variantId: variant.variant_id,

    name: product.name,
    slug: product.slug,
    categorySlug: product.categories?.slug ?? "",

    image: getProductImage(item),
    color: variant.color,
    capacity: variant.capacity,
    ram: variant.ram,
    sku: variant.sku,

    price: Number(variant.price),
    oldPrice: variant.old_price ? Number(variant.old_price) : null,

    quantity: item.quantity,
    stockQuantity: variant.stock_quantity,

    selected: item.selected ?? true,
  };
};

export const mapCartResponse = (items: any[]): CartResponseDto => {
  const mappedItems = items.map(mapCartItemToDto);

  const totalQuantity = mappedItems.reduce(
    (sum, item) => sum + item.quantity,
    0
  );

  const totalPrice = mappedItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  const selectedItems = mappedItems.filter((item) => item.selected);

  const selectedQuantity = selectedItems.reduce(
    (sum, item) => sum + item.quantity,
    0
  );

  const selectedTotalPrice = selectedItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  return {
    items: mappedItems,
    totalQuantity,
    totalPrice,
    selectedQuantity,
    selectedTotalPrice,
  };
};