export const FIXTURE_VERSION = "backend-auth-v2";

export type AccountFixture = {
  userId: number;
  roleName: "Customer" | "Admin" | "Staff" | "WarehouseStaff";
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
