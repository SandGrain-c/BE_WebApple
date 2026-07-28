export const FIXTURE_VERSION = "backend-rbac-idor-v3";

export type AccountFixture = {
  userId: number;
  roleName:
    | "Customer"
    | "Admin"
    | "Staff"
    | "WarehouseStaff"
    | "UnknownTestRole";
  status: number;
  userName: string;
  email: string;
  phone: string;
};

export type FixtureManifest = {
  fixtureVersion: typeof FIXTURE_VERSION;
  accounts: {
    customer_active: AccountFixture;
    customer_locked: AccountFixture;
    customer_b: AccountFixture;
    admin_active: AccountFixture;
    admin_locked: AccountFixture;
    staff_active: AccountFixture;
    warehouse_active: AccountFixture;
    unknown_role_active: AccountFixture;
  };
  catalog: {
    category_active: {
      categoryId: number;
      slug: string;
    };
    product_active: {
      productId: number;
      slug: string;
    };
    variant_stock_10: {
      variantId: number;
      sku: string;
      stockQuantity: number;
    };
  };
  ownership: {
    address_a: {
      addressId: number;
    };
    address_b: {
      addressId: number;
      receiverName: string;
      receiverPhone: string;
      detailedAddress: string;
      isDefault: boolean;
    };
    cart_item_a: {
      cartItemId: number;
    };
    cart_item_b: {
      cartItemId: number;
      quantity: number;
      selected: boolean;
    };
    order_a: {
      orderId: number;
    };
    order_b: {
      orderId: number;
      status: string;
      orderCode: string;
    };
    payment_b: {
      transactionId: number;
      status: string;
      transactionRef: string;
    };
    shipment_b: {
      shipmentId: number;
      status: string;
      trackingCode: string;
    };
    review_b: {
      reviewId: number;
      rating: number;
      comment: string;
      isActive: boolean;
    };
    favorite_b: {
      favoriteId: number;
      productId: number;
    };
    voucher_b: {
      voucherId: number;
      usedCount: number;
    };
    order_history_b: {
      historyId: number;
    };
  };
  adminDomain: {
    banner: {
      bannerId: number;
    };
    productImage: {
      imageId: number;
    };
    supplier: {
      supplierId: number;
    };
    productItem: {
      itemId: number;
    };
  };
};

declare module "vitest" {
  export interface ProvidedContext {
    fixtureManifest: FixtureManifest;
    testDatabaseMetadata: {
      source: "external" | "testcontainer";
      databaseName: string;
      containerId: string | null;
      postgresVersion: string;
    };
  }
}
