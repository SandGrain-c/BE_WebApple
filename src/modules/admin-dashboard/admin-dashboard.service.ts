import prisma from "../../utils/prisma";
import {
  DashboardDateRangeQuery,
  DashboardLowStockQuery,
  DashboardOverviewDto,
  DashboardRecentOrdersQuery,
  DashboardRevenueQuery,
  DashboardSummaryDto,
  DashboardTopProductsQuery,
  LowStockVariantDto,
  RecentOrderDto,
  RevenuePointDto,
  TopProductDto,
} from "./admin-dashboard.dto";
import {
  getProductImage,
  mapLowStockVariantToDto,
  mapRecentOrderToDto,
  toNumber,
} from "./admin-dashboard.mapper";

export class AdminDashboardServiceError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

const COMPLETED_STATUS = "Completed";

const PENDING_STATUSES = [
  "PendingPayment",
  "PendingConfirmation",
  "Confirmed",
  "Processing",
  "Shipping",
];

/**
 * Format ngày dạng YYYY-MM-DD để vẽ biểu đồ.
 */
const formatDateKey = (date: Date) => {
  return date.toISOString().slice(0, 10);
};

/**
 * Lấy khoảng ngày mặc định.
 * Nếu không truyền dateFrom/dateTo thì mặc định lấy 30 ngày gần nhất.
 */
const getDateRange = (
  query: DashboardDateRangeQuery & { days?: string }
): {
  dateFrom: Date;
  dateTo: Date;
} => {
  const now = new Date();

  let dateTo = query.dateTo ? new Date(query.dateTo) : now;

  if (Number.isNaN(dateTo.getTime())) {
    throw new AdminDashboardServiceError("dateTo không hợp lệ", 400);
  }

  /**
   * Nếu dateTo chỉ là ngày, set về cuối ngày để không bị thiếu dữ liệu.
   */
  if (query.dateTo && query.dateTo.length <= 10) {
    dateTo.setHours(23, 59, 59, 999);
  }

  const days = query.days ? Number(query.days) : 30;

  if (query.days && (!Number.isInteger(days) || days <= 0)) {
    throw new AdminDashboardServiceError("days không hợp lệ", 400);
  }

  let dateFrom = query.dateFrom
    ? new Date(query.dateFrom)
    : new Date(dateTo.getTime() - (days - 1) * 24 * 60 * 60 * 1000);

  if (Number.isNaN(dateFrom.getTime())) {
    throw new AdminDashboardServiceError("dateFrom không hợp lệ", 400);
  }

  if (query.dateFrom && query.dateFrom.length <= 10) {
    dateFrom.setHours(0, 0, 0, 0);
  }

  if (dateFrom > dateTo) {
    throw new AdminDashboardServiceError(
      "dateFrom không được lớn hơn dateTo",
      400
    );
  }

  return {
    dateFrom,
    dateTo,
  };
};

/**
 * Tạo mảng ngày liên tục từ dateFrom đến dateTo.
 */
const buildDateKeys = (dateFrom: Date, dateTo: Date) => {
  const keys: string[] = [];

  const current = new Date(dateFrom);
  current.setHours(0, 0, 0, 0);

  const end = new Date(dateTo);
  end.setHours(0, 0, 0, 0);

  while (current <= end) {
    keys.push(formatDateKey(current));
    current.setDate(current.getDate() + 1);
  }

  return keys;
};

/**
 * GET /api/admin/dashboard/summary
 * Hàm nội bộ lấy thống kê tổng quan.
 */
export const getDashboardSummaryService = async (
  query: DashboardDateRangeQuery & { lowStockThreshold?: string }
): Promise<DashboardSummaryDto> => {
  const { dateFrom, dateTo } = getDateRange(query);

  const lowStockThreshold =
    query.lowStockThreshold !== undefined && query.lowStockThreshold !== ""
      ? Number(query.lowStockThreshold)
      : 5;

  if (
    Number.isNaN(lowStockThreshold) ||
    !Number.isInteger(lowStockThreshold) ||
    lowStockThreshold < 0
  ) {
    throw new AdminDashboardServiceError(
      "lowStockThreshold không hợp lệ",
      400
    );
  }

  const orderDateWhere = {
    created_at: {
      gte: dateFrom,
      lte: dateTo,
    },
  };

  const [
    revenueAggregate,
    totalOrders,
    completedOrders,
    pendingOrders,
    cancelledOrders,
    totalCustomers,
    totalProducts,
    totalReviews,
    lowStockVariants,
  ] = await Promise.all([
    prisma.orders.aggregate({
      where: {
        order_status: COMPLETED_STATUS,
        ...orderDateWhere,
      },
      _sum: {
        total_amount: true,
      },
    }),

    prisma.orders.count({
      where: orderDateWhere,
    }),

    prisma.orders.count({
      where: {
        order_status: COMPLETED_STATUS,
        ...orderDateWhere,
      },
    }),

    prisma.orders.count({
      where: {
        order_status: {
          in: PENDING_STATUSES,
        },
        ...orderDateWhere,
      },
    }),

    prisma.orders.count({
      where: {
        order_status: "Cancelled",
        ...orderDateWhere,
      },
    }),

    prisma.users.count({
      where: {
        roles: {
          role_name: "Customer",
        },
      },
    }),

    prisma.products.count({
      where: {
        is_active: true,
      },
    }),

    prisma.reviews.count(),

    prisma.product_variants.count({
      where: {
        stock_quantity: {
          lte: lowStockThreshold,
        },
      },
    }),
  ]);

  return {
    totalRevenue: toNumber(revenueAggregate._sum.total_amount),

    totalOrders,
    completedOrders,
    pendingOrders,
    cancelledOrders,

    totalCustomers,
    totalProducts,
    totalReviews,

    lowStockVariants,
  };
};

/**
 * GET /api/admin/dashboard/revenue
 * Lấy dữ liệu biểu đồ doanh thu theo ngày.
 */
export const getDashboardRevenueService = async (
  query: DashboardRevenueQuery
): Promise<RevenuePointDto[]> => {
  const { dateFrom, dateTo } = getDateRange(query);

  const orders = await prisma.orders.findMany({
    where: {
      order_status: COMPLETED_STATUS,
      created_at: {
        gte: dateFrom,
        lte: dateTo,
      },
    },
    select: {
      created_at: true,
      total_amount: true,
    },
    orderBy: {
      created_at: "asc",
    },
  });

  const dateKeys = buildDateKeys(dateFrom, dateTo);

  const revenueMap = new Map<
    string,
    {
      revenue: number;
      orders: number;
    }
  >();

  for (const key of dateKeys) {
    revenueMap.set(key, {
      revenue: 0,
      orders: 0,
    });
  }

  for (const order of orders) {
    const key = formatDateKey(order.created_at);

    const current = revenueMap.get(key) ?? {
      revenue: 0,
      orders: 0,
    };

    current.revenue += toNumber(order.total_amount);
    current.orders += 1;

    revenueMap.set(key, current);
  }

  return dateKeys.map((date) => {
    const value = revenueMap.get(date) ?? {
      revenue: 0,
      orders: 0,
    };

    return {
      date,
      revenue: value.revenue,
      orders: value.orders,
    };
  });
};

/**
 * GET /api/admin/dashboard/top-products
 * Lấy sản phẩm bán chạy.
 */
export const getDashboardTopProductsService = async (
  query: DashboardTopProductsQuery
): Promise<TopProductDto[]> => {
  const { dateFrom, dateTo } = getDateRange(query);

  const limit = query.limit ? Number(query.limit) : 5;

  if (!Number.isInteger(limit) || limit <= 0 || limit > 50) {
    throw new AdminDashboardServiceError("limit không hợp lệ", 400);
  }

  /**
   * Lấy order_details thuộc đơn Completed rồi gom nhóm bằng code.
   * Cách này dễ đọc, phù hợp giai đoạn đồ án.
   */
  const orderDetails = await prisma.order_details.findMany({
    where: {
      orders: {
        order_status: COMPLETED_STATUS,
        created_at: {
          gte: dateFrom,
          lte: dateTo,
        },
      },
    },
    include: {
      product_variants: {
        include: {
          products: {
            include: {
              categories: {
                select: {
                  category_id: true,
                  category_name: true,
                  slug: true,
                },
              },
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
                select: {
                  image_id: true,
                  image_url: true,
                  is_thumbnail: true,
                  sort_order: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const productMap = new Map<number, TopProductDto>();

  for (const item of orderDetails) {
    const variant = item.product_variants;
    const product = variant.products;

    if (!product) continue;

    const productId = product.product_id;
    const unitPrice = toNumber(item.unit_price);
    const lineTotal = unitPrice * item.quantity;

    const current = productMap.get(productId);

    if (!current) {
      productMap.set(productId, {
        productId,
        productName: product.name,
        productSlug: product.slug,
        categoryName: product.categories?.category_name ?? null,
        categorySlug: product.categories?.slug ?? null,
        image: getProductImage(product),

        totalSold: item.quantity,
        totalRevenue: lineTotal,
      });

      continue;
    }

    current.totalSold += item.quantity;
    current.totalRevenue += lineTotal;

    productMap.set(productId, current);
  }

  return Array.from(productMap.values())
    .sort((a, b) => b.totalSold - a.totalSold)
    .slice(0, limit);
};

/**
 * GET /api/admin/dashboard/low-stock
 * Lấy danh sách variant tồn kho thấp.
 */
export const getDashboardLowStockService = async (
  query: DashboardLowStockQuery
): Promise<LowStockVariantDto[]> => {
  const threshold = query.threshold ? Number(query.threshold) : 5;
  const limit = query.limit ? Number(query.limit) : 10;

  if (
    !Number.isInteger(threshold) ||
    threshold < 0 ||
    !Number.isInteger(limit) ||
    limit <= 0 ||
    limit > 100
  ) {
    throw new AdminDashboardServiceError(
      "threshold hoặc limit không hợp lệ",
      400
    );
  }

  const variants = await prisma.product_variants.findMany({
    where: {
      stock_quantity: {
        lte: threshold,
      },
      products: {
        is_active: true,
      },
    },
    orderBy: {
      stock_quantity: "asc",
    },
    take: limit,
    include: {
      products: {
        select: {
          product_id: true,
          name: true,
          slug: true,
        },
      },
    },
  });

  return variants.map(mapLowStockVariantToDto);
};

/**
 * GET /api/admin/dashboard/recent-orders
 * Lấy đơn hàng gần đây.
 */
export const getDashboardRecentOrdersService = async (
  query: DashboardRecentOrdersQuery
): Promise<RecentOrderDto[]> => {
  const limit = query.limit ? Number(query.limit) : 10;

  if (!Number.isInteger(limit) || limit <= 0 || limit > 50) {
    throw new AdminDashboardServiceError("limit không hợp lệ", 400);
  }

  const orders = await prisma.orders.findMany({
    orderBy: {
      created_at: "desc",
    },
    take: limit,
    include: {
      order_details: {
        select: {
          quantity: true,
        },
      },
    },
  });

  return orders.map(mapRecentOrderToDto);
};

/**
 * GET /api/admin/dashboard/overview
 * Lấy toàn bộ dữ liệu dashboard trong một API.
 */
export const getDashboardOverviewService = async (
  query: DashboardRevenueQuery & {
    lowStockThreshold?: string;
  }
): Promise<DashboardOverviewDto> => {
  const [
    summary,
    revenueSeries,
    topProducts,
    lowStockVariants,
    recentOrders,
  ] = await Promise.all([
    getDashboardSummaryService(query),
    getDashboardRevenueService(query),
    getDashboardTopProductsService({
      ...query,
      limit: "5",
    }),
    getDashboardLowStockService({
      threshold: query.lowStockThreshold ?? "5",
      limit: "10",
    }),
    getDashboardRecentOrdersService({
      limit: "10",
    }),
  ]);

  return {
    summary,
    revenueSeries,
    topProducts,
    lowStockVariants,
    recentOrders,
  };
};