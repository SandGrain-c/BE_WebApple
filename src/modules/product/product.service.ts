// src/modules/product/product.service.ts

import prisma from "../../utils/prisma";
import type { ProductDetailResponseDto, ProductSearchSuggestQuery,
  ProductSearchSuggestResponseDto } from "./product.dto";
import { mapProductCardItem, mapProductDetail, mapProductSearchSuggestToDto  } from "./product.mapper";

type GetProductsQuery = {
  category?: string;
  color?: string;
  capacity?: string;
  ram?: string;
  minPrice?: string;
  maxPrice?: string;
  sort?: string;
  page?: string;
  limit?: string;
};

const toNumber = (value: unknown, defaultValue: number) => {
  const numberValue = Number(value);
  return Number.isNaN(numberValue) || numberValue <= 0 ? defaultValue : numberValue;
};

const decimalToNumber = (value: unknown) => {
  if (value === null || value === undefined) return 0;
  return Number(value);
};

const unique = <T>(arr: T[]) => {
  return Array.from(new Set(arr.filter(Boolean)));
};

const getSortOrder = (sort?: string) => {
  switch (sort) {
    case "name_asc":
      return { name: "asc" as const };

    case "name_desc":
      return { name: "desc" as const };

    case "oldest":
      return { created_at: "asc" as const };

    case "newest":
    default:
      return { created_at: "desc" as const };
  }
};

export const getProductsService = async (query: GetProductsQuery) => {
  const page = toNumber(query.page, 1);
  const limit = toNumber(query.limit, 12);
  const skip = (page - 1) * limit;

  const minPrice = query.minPrice ? Number(query.minPrice) : undefined;
  const maxPrice = query.maxPrice ? Number(query.maxPrice) : undefined;
  const shouldSortByBestSelling = query.sort === "best_selling";
  const variantWhere: any = {};

  if (query.color) {
    variantWhere.color = {
      equals: query.color,
      mode: "insensitive",
    };
  }

  if (query.capacity) {
    variantWhere.capacity = {
      equals: query.capacity,
      mode: "insensitive",
    };
  }

  if (query.ram) {
    variantWhere.ram = {
      equals: query.ram,
      mode: "insensitive",
    };
  }

  if (minPrice !== undefined || maxPrice !== undefined) {
    variantWhere.price = {};

    if (minPrice !== undefined && !Number.isNaN(minPrice)) {
      variantWhere.price.gte = minPrice;
    }

    if (maxPrice !== undefined && !Number.isNaN(maxPrice)) {
      variantWhere.price.lte = maxPrice;
    }
  }

  const productWhere: any = {
    is_active: true,
  };

  if (query.category) {
    productWhere.categories = {
      slug: {
        equals: query.category,
        mode: "insensitive",
      },
    };
  }

  if (Object.keys(variantWhere).length > 0) {
    productWhere.product_variants = {
      some: variantWhere,
    };
  }

  const [products, totalItems] = await Promise.all([
    prisma.products.findMany({
      where: productWhere,
      skip: shouldSortByBestSelling ? undefined : skip,
take: shouldSortByBestSelling ? undefined : limit,
orderBy: shouldSortByBestSelling
  ? { created_at: "desc" }
  : getSortOrder(query.sort),
      include: {
        categories: true,
      
        product_images: {
          where: {
            is_active: true,
          },
          orderBy: [
            { is_thumbnail: "desc" },
            { sort_order: "asc" },
            { image_id: "asc" },
          ],
        },
      
        product_promotions: {
          where: {
            is_active: true,
          },
          orderBy: [
            { sort_order: "asc" },
            { promotion_id: "asc" },
          ],
        },
      
        product_variants: {
          orderBy: [
            { price: "asc" },
            { variant_id: "asc" },
          ],
          include: {
            product_images: {
              where: {
                is_active: true,
              },
              orderBy: [
                { sort_order: "asc" },
                { image_id: "asc" },
              ],
            },
          },
        },
      },
    }),

    prisma.products.count({
      where: productWhere,
    }),
  ]);
  const soldRows = await prisma.$queryRaw<
  {
    productId: number;
    sold: number;
  }[]
>`
  SELECT 
    pv.product_id AS "productId",
    COALESCE(SUM(od.quantity), 0)::int AS "sold"
  FROM order_details od
  JOIN orders o
    ON o.order_id = od.order_id
  JOIN product_variants pv
    ON pv.variant_id = od.variant_id
  WHERE o.order_status IN ('Confirmed', 'Processing', 'Shipping', 'Completed')
  GROUP BY pv.product_id
`;

const soldMap = new Map(
  soldRows.map((row) => [Number(row.productId), Number(row.sold)])
);

let formattedItems = products.map((product) => ({
  ...mapProductCardItem(product),
  sold: soldMap.get(product.product_id) ?? 0,
}));

  const filterVariants = await prisma.product_variants.findMany({
    where: {
      products: {
        is_active: true,
        ...(query.category
          ? {
              categories: {
                slug: {
                  equals: query.category,
                  mode: "insensitive",
                },
              },
            }
          : {}),
      },
    },
    select: {
      color: true,
      capacity: true,
      ram: true,
      price: true,
    },
  });

  const prices = filterVariants.map((variant) => decimalToNumber(variant.price));

  return {
    items: formattedItems,
    pagination: {
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    },
    filters: {
      colors: unique(filterVariants.map((variant) => variant.color)),
      capacities: unique(filterVariants.map((variant) => variant.capacity)),
      ramOptions: unique(filterVariants.map((variant) => variant.ram)),
      priceRange: {
        min: prices.length > 0 ? Math.min(...prices) : 0,
        max: prices.length > 0 ? Math.max(...prices) : 0,
      },
    },
  };
};

export const getProductDetailService = async (
  categorySlug: string,
  productSlug: string,
): Promise<ProductDetailResponseDto | null> => {
  const product = await prisma.products.findFirst({
    where: {
      slug: {
        equals: productSlug,
        mode: "insensitive",
      },
      is_active: true,
      categories: {
        slug: {
          equals: categorySlug,
          mode: "insensitive",
        },
      },
    },
    include: {
      categories: true,
    
      product_images: {
        where: {
          is_active: true,
        },
        orderBy: [
          { is_thumbnail: "desc" },
          { sort_order: "asc" },
          { image_id: "asc" },
        ],
      },
    
      product_promotions: {
        where: {
          is_active: true,
        },
        orderBy: [
          { sort_order: "asc" },
          { promotion_id: "asc" },
        ],
      },
    
      product_spec_groups: {
        where: {
          is_active: true,
        },
        orderBy: [
          { sort_order: "asc" },
          { spec_group_id: "asc" },
        ],
        include: {
          product_specs: {
            where: {
              is_active: true,
            },
            orderBy: [
              { sort_order: "asc" },
              { spec_id: "asc" },
            ],
          },
        },
      },
    
      product_specs: {
        where: {
          is_active: true,
        },
        orderBy: [
          { sort_order: "asc" },
          { spec_id: "asc" },
        ],
      },
    
      product_variants: {
        orderBy: [
          { price: "asc" },
          { variant_id: "asc" },
        ],
        include: {
          product_images: {
            where: {
              is_active: true,
            },
            orderBy: [
              { sort_order: "asc" },
              { image_id: "asc" },
            ],
          },
        },
      },
    },
  });

  if (!product) {
    return null;
  }

  const [reviewStats, relatedProducts] = await Promise.all([
    prisma.reviews.aggregate({
      where: {
        product_id: product.product_id,
      },
      _avg: {
        rating: true,
      },
      _count: {
        review_id: true,
      },
    }),

    prisma.products.findMany({
      where: {
        is_active: true,
        category_id: product.category_id,
        product_id: {
          not: product.product_id,
        },
      },
      take: 12,
      orderBy: {
        created_at: "desc",
      },
      include: {
        categories: true,
      
        product_images: {
          where: {
            is_active: true,
          },
          orderBy: [
            { is_thumbnail: "desc" },
            { sort_order: "asc" },
            { image_id: "asc" },
          ],
        },
      
        product_promotions: {
          where: {
            is_active: true,
          },
          orderBy: [
            { sort_order: "asc" },
            { promotion_id: "asc" },
          ],
        },
      
        product_variants: {
          orderBy: [
            { price: "asc" },
            { variant_id: "asc" },
          ],
          include: {
            product_images: {
              where: {
                is_active: true,
              },
              orderBy: [
                { sort_order: "asc" },
                { image_id: "asc" },
              ],
            },
          },
        },
      },
    }),
  ]);

  const ratingAverageRaw = reviewStats._avg.rating ?? 0;

  const ratingAverage = Number(Number(ratingAverageRaw).toFixed(1));
  const reviewCount = reviewStats._count.review_id ?? 0;

  const relatedProductItems = relatedProducts
    .map(mapProductCardItem)
    .sort((a, b) => {
      const aInStock = a.stockQuantity > 0 ? 1 : 0;
      const bInStock = b.stockQuantity > 0 ? 1 : 0;

      return bInStock - aInStock;
    })
    .slice(0, 8);

  return {
    product: mapProductDetail(product, ratingAverage, reviewCount),
    relatedProducts: relatedProductItems,
  };
};
/**
 * Chuẩn hóa từ khóa tìm kiếm.
 */
const normalizeSearchKeyword = (value?: string | null) => {
  const text = value?.trim();

  return text ? text : "";
};

/**
 * Parse limit cho search suggest.
 */
const parseSuggestLimit = (value?: string | number) => {
  const limit = Number(value) || 5;

  return Math.min(Math.max(limit, 1), 10);
};

/**
 * GET /api/products/search-suggest?q=iphone&limit=5
 *
 * API gợi ý tìm kiếm sản phẩm cho Header.
 * Chỉ trả dữ liệu nhẹ: id, name, slug, categorySlug, image, price.
 */
export const getProductSearchSuggestService = async (
  query: ProductSearchSuggestQuery
): Promise<ProductSearchSuggestResponseDto> => {
  const keyword = normalizeSearchKeyword(query.q);
  const limit = parseSuggestLimit(query.limit);

  /**
   * Nếu từ khóa quá ngắn thì không tìm.
   * Tránh việc user mới gõ 1 ký tự đã query DB nhiều.
   */
  if (keyword.length < 2) {
    return {
      items: [],
    };
  }

  const products = await prisma.products.findMany({
    where: {
      is_active: true,
      OR: [
        {
          name: {
            contains: keyword,
            mode: "insensitive",
          },
        },
        {
          slug: {
            contains: keyword,
            mode: "insensitive",
          },
        },
        {
          description: {
            contains: keyword,
            mode: "insensitive",
          },
        },
        {
          categories: {
            category_name: {
              contains: keyword,
              mode: "insensitive",
            },
          },
        },
        {
          product_variants: {
            some: {
              sku: {
                contains: keyword,
                mode: "insensitive",
              },
            },
          },
        },
      ],
    },
    take: limit,
    orderBy: {
      product_id: "desc",
    },
    include: {
      categories: true,
      product_images: {
        where: {
          is_active: true,
        },
        orderBy: [
          {
            is_thumbnail: "desc",
          },
          {
            sort_order: "asc",
          },
          {
            image_id: "asc",
          },
        ],
        take: 1,
      },
      product_variants: {
        orderBy: {
          price: "asc",
        },
        take: 1,
        include: {
          product_images: {
            where: {
              is_active: true,
            },
            orderBy: [
              {
                sort_order: "asc",
              },
              {
                image_id: "asc",
              },
            ],
            take: 1,
          },
        },
      },
    },
  });

  return {
    items: products.map(mapProductSearchSuggestToDto),
  };
};



