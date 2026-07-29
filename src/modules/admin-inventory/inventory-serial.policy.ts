type SerializedVariantCandidate = {
  stock_quantity: number;
  products: {
    categories: {
      category_name: string;
      slug: string;
    };
  };
  product_items: Array<{
    status: number;
  }>;
};

const SERIALIZED_CATEGORY_PREFIXES = [
  "iphone",
  "ipad",
  "macbook",
  "apple-watch",
  "airpods",
] as const;

const normalizeCategoryKey = (value: string) =>
  value.trim().toLowerCase().replace(/\s+/g, "-");

const categoryRequiresSerial = (categoryName: string, categorySlug: string) => {
  const categoryKeys = [
    normalizeCategoryKey(categoryName),
    normalizeCategoryKey(categorySlug),
  ];

  return SERIALIZED_CATEGORY_PREFIXES.some((prefix) =>
    categoryKeys.some(
      (key) => key === prefix || key.startsWith(`${prefix}-`)
    )
  );
};

/**
 * Schema hiện chưa có cờ requires_serial.
 *
 * Vì vậy chỉ coi variant thuộc nhóm thiết bị là đang quản lý serialized khi
 * counter hiện tại đã được theo dõi đầy đủ bằng các item InStock. Điều này giữ
 * tương thích với các variant counter-only lịch sử trong cùng category, đồng
 * thời ngăn mutation mới làm hỏng một invariant đang hợp lệ.
 */
export const usesSerializedInventory = (
  variant: SerializedVariantCandidate
) => {
  if (
    !categoryRequiresSerial(
      variant.products.categories.category_name,
      variant.products.categories.slug
    )
  ) {
    return false;
  }

  const inStockItemCount = variant.product_items.filter(
    (item) => item.status === 1
  ).length;

  return variant.stock_quantity === inStockItemCount;
};
