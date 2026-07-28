// src/modules/product/product.mapper.ts

import type {
    ProductCardItemDto,
    ProductDetailDto,
    ProductDetailImageDto,
    ProductSpecificationGroupDto,
    ProductVariantDto,
    ProductVariantImageDto,
    StockStatusDto,
  } from "./product.dto";
  
  const toNumber = (value: unknown): number => {
    if (value === null || value === undefined) {
      return 0;
    }
  
    return Number(value);
  };
  
  const unique = (values: Array<string | null | undefined>): string[] => {
    return Array.from(
      new Set(
        values
          .map((value) => value?.trim())
          .filter((value): value is string => Boolean(value)),
      ),
    );
  };
  
  const getStockStatus = (stockQuantity: number): StockStatusDto => {
    return stockQuantity > 0 ? "in-stock" : "out-of-stock";
  };
  
  const sortVariantsByPrice = (variants: any[]) => {
    return [...variants].sort((a, b) => {
      const priceA = toNumber(a.price);
      const priceB = toNumber(b.price);
  
      if (priceA !== priceB) {
        return priceA - priceB;
      }
  
      return Number(a.variant_id) - Number(b.variant_id);
    });
  };
  
  const getDefaultVariant = (product: any) => {
    const variants = product.product_variants ?? [];
  
    if (!variants.length) {
      return null;
    }
  
    return sortVariantsByPrice(variants)[0];
  };
  
  const getMinVariantPrice = (product: any): number => {
    const defaultVariant = getDefaultVariant(product);
  
    return defaultVariant ? toNumber(defaultVariant.price) : 0;
  };
  
  const getTotalStockQuantity = (product: any): number => {
    const variants = product.product_variants ?? [];
  
    return variants.reduce((total: number, variant: any) => {
      return total + Number(variant.stock_quantity ?? 0);
    }, 0);
  };
  
  const getProductPromotions = (product: any, variantId?: number | null): string[] => {
    const promotions = product.product_promotions ?? [];
  
    return promotions
      .filter((promotion: any) => {
        if (!promotion.is_active) {
          return false;
        }
  
        if (!promotion.variant_id) {
          return true;
        }
  
        if (!variantId) {
          return true;
        }
  
        return Number(promotion.variant_id) === Number(variantId);
      })
      .sort((a: any, b: any) => {
        return Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0);
      })
      .map((promotion: any) => promotion.promotion_text)
      .filter(Boolean);
  };
  
  const mapVariantImage = (image: any): ProductVariantImageDto => {
    return {
      imageId: image.image_id,
      imageUrl: image.image_url,
      altText: image.alt_text,
      isThumbnail: image.is_thumbnail,
      sortOrder: image.sort_order,
    };
  };
  
  const mapDetailImage = (image: any): ProductDetailImageDto => {
    return {
      imageId: image.image_id,
      productId: image.product_id,
      variantId: image.variant_id,
      color: image.color,
      imageUrl: image.image_url,
      altText: image.alt_text,
      isThumbnail: image.is_thumbnail,
      sortOrder: image.sort_order,
    };
  };
  
  const removeDuplicateImages = <T extends { imageId: number }>(images: T[]): T[] => {
    const imageMap = new Map<number, T>();
  
    images.forEach((image) => {
      imageMap.set(image.imageId, image);
    });
  
    return Array.from(imageMap.values());
  };
  
  const getFallbackImagesByColor = (
    allProductImages: any[],
    color?: string | null,
  ): ProductVariantImageDto[] => {
    if (!color) {
      return [];
    }
  
    return allProductImages
      .filter((image) => {
        return image.color?.toLowerCase() === color.toLowerCase();
      })
      .map(mapVariantImage);
  };
  
  export const mapProductVariant = (
    variant: any,
    allProductImages: any[] = [],
  ): ProductVariantDto => {
    const variantImages = variant.product_images ?? [];
  
    const images =
      variantImages.length > 0
        ? variantImages.map(mapVariantImage)
        : getFallbackImagesByColor(allProductImages, variant.color);
  
    const stockQuantity = Number(variant.stock_quantity ?? 0);
  
    return {
      variantId: variant.variant_id,
      sku: variant.sku,
      color: variant.color ?? "",
      capacity: variant.capacity ?? "",
      ram: variant.ram ?? "",
      country: variant.country,
      price: toNumber(variant.price),
      stockQuantity,
      stockStatus: getStockStatus(stockQuantity),
      images: removeDuplicateImages(images),
    };
  };
  
  const getThumbnailUrl = (product: any): string => {
    const images = product.product_images ?? [];
  
    const thumbnail = images.find((image: any) => image.is_thumbnail);
  
    if (thumbnail) {
      return thumbnail.image_url;
    }
  
    return images[0]?.image_url ?? "";
  };
  
  const getVariantPriceInfo = (product: any) => {
    const defaultVariant = getDefaultVariant(product);
  
    return {
      price: defaultVariant ? toNumber(defaultVariant.price) : 0,
      oldPrice: defaultVariant?.old_price ? toNumber(defaultVariant.old_price) : null,
      installment: defaultVariant?.installment ?? null,
      discountLabel: defaultVariant?.discount_label ?? null,
      defaultVariantId: defaultVariant?.variant_id ?? null,
    };
  };
  
  export const mapProductCardItem = (product: any): ProductCardItemDto => {
    const variants = product.product_variants ?? [];
    const sortedVariants = sortVariantsByPrice(variants);
    const totalStockQuantity = getTotalStockQuantity(product);
    const priceInfo = getVariantPriceInfo(product);
  
    return {
      id: product.product_id,
      name: product.name,
      slug: product.slug,
      image: getThumbnailUrl(product),
      price: priceInfo.price,
      oldPrice: priceInfo.oldPrice,
      discountLabel: priceInfo.discountLabel,
      installment: priceInfo.installment,
      promotions: getProductPromotions(product, priceInfo.defaultVariantId),
      categorySlug: product.categories?.slug ?? "",
      categoryName: product.categories?.category_name ?? "",
      colors: unique(sortedVariants.map((variant: any) => variant.color)),
      capacities: unique(sortedVariants.map((variant: any) => variant.capacity)),
      ramOptions: unique(sortedVariants.map((variant: any) => variant.ram)),
      stockQuantity: totalStockQuantity,
      stockStatus: getStockStatus(totalStockQuantity),
      sold: 0,
      createdAt: product.created_at?.toISOString?.() ?? String(product.created_at),
      variants: sortedVariants.map((variant: any) =>
        mapProductVariant(variant, product.product_images ?? []),
      ),
    };
  };
  
  const mapSpecifications = (product: any): ProductSpecificationGroupDto[] => {
    const groups = product.product_spec_groups ?? [];
  
    const groupedSpecifications = groups
      .filter((group: any) => group.is_active)
      .sort((a: any, b: any) => {
        return Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0);
      })
      .map((group: any) => {
        const items = (group.product_specs ?? [])
          .filter((spec: any) => spec.is_active)
          .sort((a: any, b: any) => {
            return Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0);
          })
          .map((spec: any) => {
            const value = spec.unit
              ? `${spec.spec_value} ${spec.unit}`
              : spec.spec_value;
  
            return {
              label: spec.spec_label,
              value,
            };
          });
  
        return {
          groupName: group.group_name,
          items,
        };
      })
      .filter((group: ProductSpecificationGroupDto) => group.items.length > 0);
  
    const groupedSpecIds = new Set<number>();
  
    groups.forEach((group: any) => {
      (group.product_specs ?? []).forEach((spec: any) => {
        groupedSpecIds.add(spec.spec_id);
      });
    });
  
    const ungroupedSpecs = (product.product_specs ?? [])
      .filter((spec: any) => {
        return spec.is_active && !groupedSpecIds.has(spec.spec_id);
      })
      .sort((a: any, b: any) => {
        return Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0);
      })
      .map((spec: any) => {
        const value = spec.unit ? `${spec.spec_value} ${spec.unit}` : spec.spec_value;
  
        return {
          label: spec.spec_label,
          value,
        };
      });
  
    if (ungroupedSpecs.length > 0) {
      groupedSpecifications.push({
        groupName: "Thông số kỹ thuật",
        items: ungroupedSpecs,
      });
    }
  
    return groupedSpecifications;
  };
  
  export const mapProductDetail = (
    product: any,
    ratingAverage: number,
    reviewCount: number,
  ): ProductDetailDto => {
    const sortedVariants = sortVariantsByPrice(product.product_variants ?? []);
    const totalStockQuantity = getTotalStockQuantity(product);
    const priceInfo = getVariantPriceInfo(product);
  
    const detailImages = (product.product_images ?? []).map(mapDetailImage);
  
    return {
      id: product.product_id,
      name: product.name,
      slug: product.slug,
      description: product.description,
      shortDescription: product.description?.slice(0, 180) ?? "",
      categoryId: product.category_id,
      categorySlug: product.categories?.slug ?? "",
      categoryName: product.categories?.category_name ?? "",
      price: priceInfo.price,
      oldPrice: priceInfo.oldPrice,
      discountLabel: priceInfo.discountLabel,
      installment: priceInfo.installment,
      promotions: getProductPromotions(product, priceInfo.defaultVariantId),
      images: detailImages,
      variants: sortedVariants.map((variant: any) =>
        mapProductVariant(variant, product.product_images ?? []),
      ),
      specifications: mapSpecifications(product),
      colors: unique(sortedVariants.map((variant: any) => variant.color)),
      capacities: unique(sortedVariants.map((variant: any) => variant.capacity)),
      ramOptions: unique(sortedVariants.map((variant: any) => variant.ram)),
      stockQuantity: totalStockQuantity,
      stockStatus: getStockStatus(totalStockQuantity),
      sold: 0,
      ratingAverage,
      reviewCount,
      isActive: product.is_active,
      createdAt: product.created_at?.toISOString?.() ?? String(product.created_at),
    };
  };

  import type { ProductSearchSuggestItemDto } from "./product.dto";

/**
 * Lấy ảnh đại diện cho sản phẩm gợi ý.
 * Ưu tiên:
 * 1. Ảnh sản phẩm
 * 2. Ảnh variant
 * 3. Chuỗi rỗng
 */
const getSuggestProductImage = (product: any): string => {
  const productImage = product.product_images?.[0]?.image_url;

  if (productImage) {
    return productImage;
  }

  const variantWithImage = product.product_variants?.find(
    (variant: any) => variant.product_images?.length > 0
  );

  return variantWithImage?.product_images?.[0]?.image_url ?? "";
};

/**
 * Lấy giá thấp nhất/giá đại diện từ variant đầu tiên.
 */
const getSuggestProductPrice = (product: any): number => {
  const firstVariant = product.product_variants?.[0];

  return firstVariant?.price ? Number(firstVariant.price) : 0;
};

/**
 * Mapper cho API search suggest.
 */
export const mapProductSearchSuggestToDto = (
  product: any
): ProductSearchSuggestItemDto => {
  return {
    id: product.product_id,
    name: product.name,
    slug: product.slug,
    categorySlug: product.categories?.slug ?? "",
    image: getSuggestProductImage(product),
    price: getSuggestProductPrice(product),
  };
};