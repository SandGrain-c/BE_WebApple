import { execFileSync } from "node:child_process";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { PrismaClient } from "../../../src/generated/prisma/client";
import { calculateVoucherDiscount, validateVoucherForCheckout } from "../../../src/modules/voucher/voucher.service";
import { seedDemoCommerce } from "../../../prisma/demo-commerce-seed";
import {
  demoCategories,
  demoProducts,
  demoReceipts,
  demoSuppliers,
  demoVouchers,
  desiredStockForCategory,
  serializedCategorySlugs,
} from "../../../prisma/demo-commerce-data";

const POSTGRES_IMAGE = "postgres:16-alpine";
const TEST_PASSWORD = "isolated-seed-test-only";

type Snapshot = {
  categories: number;
  products: number;
  variants: number;
  suppliers: number;
  receipts: number;
  receiptDetails: number;
  serials: number;
  vouchers: number;
  specifications: number;
  promotions: number;
  productImages: number;
  stockBySku: Array<{ sku: string; stock: number }>;
};

describe.sequential("Comprehensive demo commerce seed", () => {
  let container: StartedPostgreSqlContainer;
  let isolatedPrisma: PrismaClient;
  let firstSnapshot: Snapshot;
  let secondSnapshot: Snapshot;
  let originalPassword: string | undefined;
  let nonDemoBefore: unknown;
  let missingOperatorFailure: unknown;

  const productSlugs = demoProducts.map((product) => product.slug);
  const skus = demoProducts.flatMap((product) =>
    product.variants.map((variant) => variant.sku),
  );
  const categorySlugs = demoCategories.map(([, slug]) => slug);
  const supplierNames = demoSuppliers.map((supplier) => supplier.name);
  const voucherCodes = demoVouchers.map((voucher) => voucher.code);
  const receiptDates = demoReceipts.map((receipt) => receipt.createdAt);

  function runFullSeed(databaseUrl: string) {
    execFileSync("npm", ["run", "seed:demo"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: "test",
        DATABASE_URL: databaseUrl,
        DEMO_ACCOUNT_PASSWORD: TEST_PASSWORD,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
  }

  async function snapshot(): Promise<Snapshot> {
    const variants = await isolatedPrisma.product_variants.findMany({
      where: { sku: { in: skus } },
      select: { sku: true, stock_quantity: true },
      orderBy: { sku: "asc" },
    });
    const receipts = await isolatedPrisma.inventory_receipts.findMany({
      where: { created_at: { in: receiptDates } },
      select: { receipt_id: true },
    });
    const receiptIds = receipts.map((receipt) => receipt.receipt_id);

    return {
      categories: await isolatedPrisma.categories.count({
        where: { slug: { in: categorySlugs } },
      }),
      products: await isolatedPrisma.products.count({
        where: { slug: { in: productSlugs } },
      }),
      variants: variants.length,
      suppliers: await isolatedPrisma.suppliers.count({
        where: { supplier_name: { in: supplierNames } },
      }),
      receipts: receipts.length,
      receiptDetails: await isolatedPrisma.inventory_receipt_details.count({
        where: { receipt_id: { in: receiptIds } },
      }),
      serials: await isolatedPrisma.product_items.count({
        where: { serial_number: { startsWith: "DEMO-SERIAL-" } },
      }),
      vouchers: await isolatedPrisma.vouchers.count({
        where: { code: { in: voucherCodes } },
      }),
      specifications: await isolatedPrisma.product_specs.count({
        where: { products: { slug: { in: productSlugs } } },
      }),
      promotions: await isolatedPrisma.product_promotions.count({
        where: { products: { slug: { in: productSlugs } } },
      }),
      productImages: await isolatedPrisma.product_images.count({
        where: { products: { slug: { in: productSlugs } } },
      }),
      stockBySku: variants.map((variant) => ({
        sku: variant.sku,
        stock: variant.stock_quantity,
      })),
    };
  }

  beforeAll(async () => {
    container = await new PostgreSqlContainer(POSTGRES_IMAGE)
      .withDatabase("webapple_seed_test")
      .withUsername("webapple_seed_runner")
      .withPassword("container-only-seed-password")
      .withStartupTimeout(120_000)
      .start();
    const databaseUrl = container.getConnectionUri();
    const prismaExecutable = path.resolve(process.cwd(), "node_modules", ".bin", "prisma");

    execFileSync(prismaExecutable, ["migrate", "deploy"], {
      cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: "test", DATABASE_URL: databaseUrl },
      stdio: ["ignore", "pipe", "pipe"],
    });

    isolatedPrisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl }),
    });
    originalPassword = process.env.DEMO_ACCOUNT_PASSWORD;
    process.env.DEMO_ACCOUNT_PASSWORD = TEST_PASSWORD;
    try {
      await seedDemoCommerce(isolatedPrisma);
    } catch (error) {
      missingOperatorFailure = error;
    }
    runFullSeed(databaseUrl);
    firstSnapshot = await snapshot();

    const nonDemoCategory = await isolatedPrisma.categories.create({
      data: {
        category_name: "Owner Data",
        slug: "owner-data",
        description: "Must remain unchanged by the demo seed",
        display_order: 99,
        is_active: true,
      },
    });
    const nonDemoProduct = await isolatedPrisma.products.create({
      data: {
        category_id: nonDemoCategory.category_id,
        name: "Owner Product",
        slug: "owner-product",
        description: "Non-demo sentinel",
        is_active: true,
      },
    });
    await isolatedPrisma.product_variants.create({
      data: {
        product_id: nonDemoProduct.product_id,
        variant_name: "Owner Variant",
        sku: "OWNER-SKU-001",
        color: "Owner Color",
        capacity: "Owner Capacity",
        price: 123_456,
        stock_quantity: 7,
      },
    });
    nonDemoBefore = await isolatedPrisma.products.findUnique({
      where: { slug: "owner-product" },
      include: { product_variants: true, categories: true },
    });
  }, 180_000);

  afterAll(async () => {
    if (originalPassword === undefined) delete process.env.DEMO_ACCOUNT_PASSWORD;
    else process.env.DEMO_ACCOUNT_PASSWORD = originalPassword;
    await isolatedPrisma?.$disconnect();
    await container?.stop();
  });

  test("SEED-001 succeeds on a fresh migrated PostgreSQL database", () => {
    expect(missingOperatorFailure).toBeInstanceOf(Error);
    expect((missingOperatorFailure as Error).message).toMatch(
      /Run the demo account seed first/,
    );
    expect(firstSnapshot).toMatchObject({
      categories: 8,
      products: 34,
      variants: 84,
      specifications: 160,
      promotions: 11,
      suppliers: 3,
      receipts: 4,
      receiptDetails: 84,
      serials: 300,
      vouchers: 8,
      productImages: 0,
    });
  });

  test("SEED-002 succeeds a second time on the same database", async () => {
    runFullSeed(container.getConnectionUri());
    secondSnapshot = await snapshot();
    expect(secondSnapshot).toEqual(firstSnapshot);
  }, 180_000);

  test("SEED-003 counts do not increase after the second run", () => {
    expect(secondSnapshot).toEqual(firstSnapshot);
  });

  test("SEED-004 stock does not increase after the second run", () => {
    expect(secondSnapshot.stockBySku).toEqual(firstSnapshot.stockBySku);
    expect(secondSnapshot.stockBySku.reduce((sum, row) => sum + row.stock, 0)).toBe(588);
  });

  test("SEED-005 every managed SKU is unique and every public product has variants", async () => {
    const variants = await isolatedPrisma.product_variants.findMany({
      where: { sku: { in: skus } },
      select: { sku: true, price: true, products: { select: { is_active: true } } },
    });
    const products = await isolatedPrisma.products.findMany({
      where: { slug: { in: productSlugs } },
      include: { _count: { select: { product_variants: true } } },
    });

    expect(new Set(variants.map((variant) => variant.sku)).size).toBe(84);
    expect(variants.every((variant) => Number(variant.price) > 0)).toBe(true);
    expect(products.every((product) => product.is_active && product._count.product_variants > 0)).toBe(true);
  });

  test("SEED-006 voucher codes remain unique and seeded voucher rules calculate correctly", async () => {
    const vouchers = await isolatedPrisma.vouchers.findMany({
      where: { code: { in: voucherCodes } },
    });
    expect(vouchers).toHaveLength(8);
    expect(new Set(vouchers.map((voucher) => voucher.code)).size).toBe(8);
    expect(calculateVoucherDiscount(vouchers.find((voucher) => voucher.code === "DEMO10"), 10_000_000)).toBe(1_000_000);
    expect(calculateVoucherDiscount(vouchers.find((voucher) => voucher.code === "DEMO100K"), 10_000_000)).toBe(100_000);

    const customer = await isolatedPrisma.users.findUniqueOrThrow({
      where: { user_name: "demo_customer_1" },
    });
    await expect(
      isolatedPrisma.$transaction((tx) =>
        validateVoucherForCheckout(tx, {
          userId: customer.user_id,
          code: "DEMO10",
          subTotal: 999_999,
        }),
      ),
    ).rejects.toThrow(/tối thiểu/);
    const valid = await isolatedPrisma.$transaction((tx) =>
      validateVoucherForCheckout(tx, {
        userId: customer.user_id,
        code: "DEMO10",
        subTotal: 10_000_000,
      }),
    );
    expect(valid.discountAmount).toBe(1_000_000);
    expect(await isolatedPrisma.voucher_usages.count()).toBe(0);
  });

  test("SEED-007 serials remain unique and serialized stock equals InStock item count", async () => {
    const variants = await isolatedPrisma.product_variants.findMany({
      where: { sku: { in: skus } },
      include: {
        products: { include: { categories: true } },
        product_items: true,
        inventory_receipt_details: true,
      },
    });
    const allSerials = variants.flatMap((variant) => variant.product_items.map((item) => item.serial_number));
    expect(new Set(allSerials).size).toBe(300);

    for (const variant of variants) {
      const categorySlug = variant.products.categories.slug;
      const expectedStock = desiredStockForCategory(categorySlug);
      expect(variant.stock_quantity).toBe(expectedStock);
      expect(variant.inventory_receipt_details).toHaveLength(1);
      expect(variant.inventory_receipt_details[0].quantity).toBe(expectedStock);

      if (serializedCategorySlugs.has(categorySlug)) {
        expect(variant.product_items.filter((item) => item.status === 1)).toHaveLength(expectedStock);
        expect(variant.product_items.every((item) => item.import_receipt_detail_id !== null)).toBe(true);
      } else {
        expect(variant.product_items).toHaveLength(0);
      }
    }
  });

  test("SEED-008 a pre-existing non-demo product is not deleted or changed", async () => {
    const nonDemoAfter = await isolatedPrisma.products.findUnique({
      where: { slug: "owner-product" },
      include: { product_variants: true, categories: true },
    });
    expect(nonDemoAfter).toEqual(nonDemoBefore);
  });

  test("SEED-009 Customer catalog and voucher APIs expose the seeded data", async () => {
    vi.resetModules();
    vi.doMock("../../../src/utils/prisma", () => ({ default: isolatedPrisma }));

    try {
      const { default: customerApp } = await import(
        "../../../src/apps/customer/customer.app"
      );

      for (const [, categorySlug] of demoCategories) {
        const response = await request(customerApp)
          .get("/api/products")
          .query({ category: categorySlug, limit: 100 });
        const expectedCount = demoProducts.filter(
          (product) => product.category === categorySlug,
        ).length;

        expect(response.status).toBe(200);
        expect(response.body.data.items).toHaveLength(expectedCount);
        expect(
          response.body.data.items.every(
            (product: { categorySlug: string; image: string }) =>
              product.categorySlug === categorySlug && product.image === "",
          ),
        ).toBe(true);
      }

      const detail = await request(customerApp).get(
        "/api/products/iphone/demo-iphone-16-pro-max",
      );

      expect(detail.status).toBe(200);
      expect(detail.body.data.product.images).toEqual([]);
      expect(detail.body.data.product.specifications.length).toBeGreaterThan(0);
      expect(detail.body.data.product.promotions.length).toBeGreaterThan(0);

      const customer = await isolatedPrisma.users.findUniqueOrThrow({
        where: { user_name: "demo_customer_1" },
      });
      const token = jwt.sign(
        { userId: customer.user_id, role: "Customer" },
        process.env.JWT_SECRET!,
        { expiresIn: "15m" },
      );
      const available = await request(customerApp)
        .get("/api/vouchers/available")
        .query({ subTotal: 10_000_000 })
        .set("Authorization", `Bearer ${token}`);
      const valid = await request(customerApp)
        .post("/api/vouchers/validate")
        .set("Authorization", `Bearer ${token}`)
        .send({ code: "DEMO10", subTotal: 10_000_000 });
      const belowMinimum = await request(customerApp)
        .post("/api/vouchers/validate")
        .set("Authorization", `Bearer ${token}`)
        .send({ code: "DEMO10", subTotal: 999_999 });
      const invalid = await request(customerApp)
        .post("/api/vouchers/validate")
        .set("Authorization", `Bearer ${token}`)
        .send({ code: "NOT-A-DEMO-VOUCHER", subTotal: 10_000_000 });

      expect(available.status).toBe(200);
      expect(
        available.body.data.some(
          (voucher: { code: string }) => voucher.code === "DEMO10",
        ),
      ).toBe(true);
      expect(valid.status).toBe(200);
      expect(valid.body.data).toMatchObject({
        discountAmount: 1_000_000,
        totalAfterDiscount: 9_000_000,
      });
      expect(belowMinimum.status).toBe(400);
      expect(invalid.status).toBe(404);
    } finally {
      vi.doUnmock("../../../src/utils/prisma");
      vi.resetModules();
    }
  });
});
