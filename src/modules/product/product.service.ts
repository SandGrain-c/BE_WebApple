// src/modules/product/product.service.ts

import prisma from "../../utils/prisma";
import { Prisma } from "../../generated/prisma/client";
import type { ProductDetailResponseDto, ProductSearchSuggestQuery,
  ProductSearchSuggestResponseDto } from "./product.dto";
import { mapProductCardItem, mapProductDetail, mapProductSearchSuggestToDto  } from "./product.mapper";
import type {
  CatalogSort,
  ParsedCatalogQuery,
} from "./product-catalog.query";

const decimalToNumber = (value: unknown) => {
  if (value === null || value === undefined) return 0;
  return Number(value);
};

const unique = <T>(arr: T[]) => {
  return Array.from(new Set(arr.filter(Boolean)));
};

type CatalogPageRow = {
  productId: number;
  sold: number;
};

type CatalogCountRow = {
  totalItems: number;
};

const COMPLETED_ORDER_STATUS = "Completed";

const getCatalogOrderBy = (sort: CatalogSort): Prisma.Sql => {
  switch (sort) {
    case "name_asc":
      return Prisma.sql`catalog_rows.name ASC, catalog_rows.product_id ASC`;

    case "name_desc":
      return Prisma.sql`catalog_rows.name DESC, catalog_rows.product_id ASC`;

    case "oldest":
      return Prisma.sql`catalog_rows.created_at ASC, catalog_rows.product_id ASC`;

    case "price_asc":
      return Prisma.sql`catalog_rows.representative_price ASC, catalog_rows.product_id ASC`;

    case "price_desc":
      return Prisma.sql`catalog_rows.representative_price DESC, catalog_rows.product_id ASC`;

    case "best_selling":
      return Prisma.sql`catalog_rows.sold DESC, catalog_rows.product_id ASC`;

    case "newest":
    default:
      return Prisma.sql`catalog_rows.created_at DESC, catalog_rows.product_id ASC`;
  }
};

const buildCatalogRows = (query: ParsedCatalogQuery): Prisma.Sql => {
  const productConditions: Prisma.Sql[] = [
    Prisma.sql`p.is_active = true`,
  ];

  if (query.categorySlug) {
    productConditions.push(
      Prisma.sql`LOWER(c.slug) = LOWER(${query.categorySlug})`,
    );
  }

  if (query.search) {
    productConditions.push(
      Prisma.sql`p.name ILIKE ${`%${query.search}%`}`,
    );
  }

  if (query.minPrice !== undefined) {
    productConditions.push(
      Prisma.sql`rp.representative_price >= ${query.minPrice}`,
    );
  }

  if (query.maxPrice !== undefined) {
    productConditions.push(
      Prisma.sql`rp.representative_price <= ${query.maxPrice}`,
    );
  }

  const variantConditions: Prisma.Sql[] = [
    Prisma.sql`filter_variant.product_id = p.product_id`,
  ];

  if (query.color) {
    variantConditions.push(
      Prisma.sql`LOWER(filter_variant.color) = LOWER(${query.color})`,
    );
  }

  if (query.capacity) {
    variantConditions.push(
      Prisma.sql`LOWER(filter_variant.capacity) = LOWER(${query.capacity})`,
    );
  }

  if (query.ram) {
    variantConditions.push(
      Prisma.sql`LOWER(filter_variant.ram) = LOWER(${query.ram})`,
    );
  }

  if (variantConditions.length > 1) {
    productConditions.push(
      Prisma.sql`
        EXISTS (
          SELECT 1
          FROM product_variants AS filter_variant
          WHERE ${Prisma.join(variantConditions, " AND ")}
        )
      `,
    );
  }

  return Prisma.sql`
    SELECT
      p.product_id,
      p.name,
      p.created_at,
      rp.representative_price,
      COALESCE(completed_sales.sold, 0)::int AS sold
    FROM products AS p
    JOIN categories AS c
      ON c.category_id = p.category_id
    JOIN (
      SELECT
        product_id,
        MIN(price) AS representative_price
      FROM product_variants
      GROUP BY product_id
    ) AS rp
      ON rp.product_id = p.product_id
    LEFT JOIN (
      SELECT
        sold_variant.product_id,
        SUM(completed_detail.quantity) AS sold
      FROM order_details AS completed_detail
      JOIN orders AS completed_order
        ON completed_order.order_id = completed_detail.order_id
       AND completed_order.order_status = ${COMPLETED_ORDER_STATUS}
      JOIN product_variants AS sold_variant
        ON sold_variant.variant_id = completed_detail.variant_id
      GROUP BY sold_variant.product_id
    ) AS completed_sales
      ON completed_sales.product_id = p.product_id
    WHERE ${Prisma.join(productConditions, " AND ")}
  `;
};

export const getProductsService = async (query: ParsedCatalogQuery) => {
  const skip = (query.page - 1) * query.limit;
  const catalogRows = buildCatalogRows(query);
  const orderBy = getCatalogOrderBy(query.sort);

  const [pageRows, countRows] = await Promise.all([
    prisma.$queryRaw<CatalogPageRow[]>(Prisma.sql`
      WITH catalog_rows AS (${catalogRows})
      SELECT
        catalog_rows.product_id AS "productId",
        catalog_rows.sold
      FROM catalog_rows
      ORDER BY ${orderBy}
      OFFSET ${skip}
      LIMIT ${query.limit}
    `),
    prisma.$queryRaw<CatalogCountRow[]>(Prisma.sql`
      WITH catalog_rows AS (${catalogRows})
      SELECT COUNT(*)::int AS "totalItems"
      FROM catalog_rows
    `),
  ]);

  const pageProductIds = pageRows.map((row) => row.productId);
  const products =
    pageProductIds.length === 0
      ? []
      : await prisma.products.findMany({
          where: {
            product_id: {
              in: pageProductIds,
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

  const productById = new Map(
    products.map((product) => [product.product_id, product]),
  );
  const soldById = new Map(
    pageRows.map((row) => [row.productId, Number(row.sold)]),
  );
  const formattedItems = pageProductIds.flatMap((productId) => {
    const product = productById.get(productId);

    if (!product) {
      return [];
    }

    return [
      {
        ...mapProductCardItem(product),
        sold: soldById.get(productId) ?? 0,
      },
    ];
  });

  const filterVariants = await prisma.product_variants.findMany({
    where: {
      products: {
        is_active: true,
        ...(query.categorySlug
          ? {
              categories: {
                slug: {
                  equals: query.categorySlug,
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
  const totalItems = countRows[0]?.totalItems ?? 0;

  return {
    items: formattedItems,
    pagination: {
      page: query.page,
      limit: query.limit,
      totalItems,
      totalPages: Math.ceil(totalItems / query.limit),
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


