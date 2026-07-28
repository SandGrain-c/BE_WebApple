import { FavoriteProductDto } from "./favorite.dto";

/**
 * Chuyển Decimal của Prisma sang number.
 */
const toNumber = (value: unknown): number => {
  if (value === null || value === undefined) return 0;
  return Number(value);
};

/**
 * Lấy variant rẻ nhất hoặc variant đầu tiên để hiển thị nhanh ở danh sách yêu thích.
 */
const getDisplayVariant = (product: any) => {
  const variants = product.product_variants ?? [];

  if (variants.length === 0) return null;

  return variants[0];
};

/**
 * Lấy ảnh thumbnail của sản phẩm.
 */
const getDisplayImage = (product: any): string | null => {
  const images = product.product_images ?? [];

  const thumbnail = images.find((image: any) => image.is_thumbnail);

  return thumbnail?.image_url ?? images[0]?.image_url ?? null;
};

/**
 * mapFavoriteToDto:
 * Chuyển dữ liệu favorite_products sang DTO cho FE.
 */
export const mapFavoriteToDto = (favorite: any): FavoriteProductDto => {
  const product = favorite.products;
  const variant = getDisplayVariant(product);
  const image = getDisplayImage(product);

  const stockQuantity = variant?.stock_quantity ?? 0;

  return {
    favoriteId: favorite.favorite_id,
    productId: product.product_id,
    name: product.name,
    slug: product.slug,

    categoryId: product.category_id,
    categoryName: product.categories?.category_name ?? "",
    categorySlug: product.categories?.slug ?? "",

    image,

    price: variant ? toNumber(variant.price) : null,
    oldPrice:
      variant?.old_price === null || variant?.old_price === undefined
        ? null
        : toNumber(variant.old_price),
    discountLabel: variant?.discount_label ?? null,
    installment: variant?.installment ?? null,

    stockQuantity,
    stockStatus: stockQuantity > 0 ? "in-stock" : "out-of-stock",

    createdAt:
      favorite.created_at?.toISOString?.() ?? String(favorite.created_at),
  };
};