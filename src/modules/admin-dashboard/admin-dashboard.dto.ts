export type DashboardSummaryDto = {
    totalRevenue: number;
  
    totalOrders: number;
    completedOrders: number;
    pendingOrders: number;
    cancelledOrders: number;
  
    totalCustomers: number;
    totalProducts: number;
    totalReviews: number;
  
    lowStockVariants: number;
  };
  
  export type RevenuePointDto = {
    date: string;
    revenue: number;
    orders: number;
  };
  
  export type TopProductDto = {
    productId: number;
    productName: string;
    productSlug: string;
    categoryName: string | null;
    categorySlug: string | null;
    image: string | null;
  
    totalSold: number;
    totalRevenue: number;
  };
  
  export type LowStockVariantDto = {
    variantId: number;
    productId: number;
    productName: string;
    productSlug: string;
  
    sku: string;
    variantName: string | null;
    color: string | null;
    capacity: string | null;
    ram: string | null;
  
    stockQuantity: number;
  };
  
  export type RecentOrderDto = {
    orderId: number;
    orderCode: string;
  
    customerName: string | null;
    customerPhone: string | null;
  
    orderStatus: string;
    totalAmount: number;
    totalItems: number;
  
    createdAt: string;
  };
  
  export type DashboardOverviewDto = {
    summary: DashboardSummaryDto;
    revenueSeries: RevenuePointDto[];
    topProducts: TopProductDto[];
    lowStockVariants: LowStockVariantDto[];
    recentOrders: RecentOrderDto[];
  };
  
  export type DashboardDateRangeQuery = {
    dateFrom?: string;
    dateTo?: string;
  };
  
  export type DashboardRevenueQuery = DashboardDateRangeQuery & {
    days?: string;
  };
  
  export type DashboardTopProductsQuery = DashboardDateRangeQuery & {
    limit?: string;
  };
  
  export type DashboardLowStockQuery = {
    threshold?: string;
    limit?: string;
  };
  
  export type DashboardRecentOrdersQuery = {
    limit?: string;
  };