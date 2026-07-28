import type { Express } from "express";
import request from "supertest";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  inject,
  test,
} from "vitest";
import prisma from "../../../src/utils/prisma";
import { assertCurrentProcessUsesSafeTestDatabase } from "../../setup/database-safety";

type CatalogItem = {
  id: number;
  name: string;
  slug: string;
  image: string;
  price: number;
  categorySlug: string;
  categoryName: string;
  colors: string[];
  capacities: string[];
  ramOptions: string[];
  stockQuantity: number;
  stockStatus: "in-stock" | "out-of-stock";
  sold: number;
  createdAt: string;
  variants: Array<{
    variantId: number;
    price: number;
    stockQuantity: number;
  }>;
};

type CatalogResponse = {
  success: boolean;
  data: {
    items: CatalogItem[];
    pagination: {
      page: number;
      limit: number;
      totalItems: number;
      totalPages: number;
    };
  };
};

const CARD_KEYS = [
  "capacities",
  "categoryName",
  "categorySlug",
  "colors",
  "createdAt",
  "discountLabel",
  "id",
  "image",
  "installment",
  "name",
  "oldPrice",
  "price",
  "promotions",
  "ramOptions",
  "slug",
  "sold",
  "stockQuantity",
  "stockStatus",
  "variants",
].sort();

const ids = (items: CatalogItem[]) => items.map((item) => item.id);

function sortWithIdTie(
  products: Array<{
    productId: number;
    name: string;
    representativePrice: number;
    createdAt: string;
    sold: number;
  }>,
  sort:
    | "newest"
    | "oldest"
    | "price_asc"
    | "price_desc"
    | "name_asc"
    | "name_desc"
    | "best_selling",
) {
  return [...products]
    .sort((left, right) => {
      let comparison = 0;

      if (sort === "newest" || sort === "oldest") {
        comparison =
          new Date(left.createdAt).getTime() -
          new Date(right.createdAt).getTime();
        if (sort === "newest") comparison *= -1;
      } else if (sort === "price_asc" || sort === "price_desc") {
        comparison =
          left.representativePrice - right.representativePrice;
        if (sort === "price_desc") comparison *= -1;
      } else if (sort === "name_asc" || sort === "name_desc") {
        comparison = left.name.localeCompare(right.name, "en");
        if (sort === "name_desc") comparison *= -1;
      } else {
        comparison = right.sold - left.sold;
      }

      return comparison || left.productId - right.productId;
    })
    .map((product) => product.productId);
}

async function databaseSnapshot() {
  const [products, variants, orders, orderDetails] = await Promise.all([
    prisma.products.findMany({
      orderBy: { product_id: "asc" },
      select: {
        product_id: true,
        category_id: true,
        name: true,
        slug: true,
        is_active: true,
        created_at: true,
      },
    }),
    prisma.product_variants.findMany({
      orderBy: { variant_id: "asc" },
      select: {
        variant_id: true,
        product_id: true,
        sku: true,
        color: true,
        capacity: true,
        ram: true,
        price: true,
        stock_quantity: true,
      },
    }),
    prisma.orders.findMany({
      orderBy: { order_id: "asc" },
      select: {
        order_id: true,
        order_code: true,
        order_status: true,
        total_amount: true,
      },
    }),
    prisma.order_details.findMany({
      orderBy: { order_detail_id: "asc" },
      select: {
        order_detail_id: true,
        order_id: true,
        variant_id: true,
        quantity: true,
        unit_price: true,
      },
    }),
  ]);

  return JSON.stringify({ products, variants, orders, orderDetails });
}

describe.sequential("Product catalog contract integration", () => {
  const manifest = inject("fixtureManifest");
  const fixture = manifest.catalog.product_catalog;
  const iphoneProducts = fixture.products.filter(
    (product) => product.categorySlug === fixture.categories.iphone.slug,
  );
  let customerApp: Express;
  let beforeSnapshot: string;

  beforeAll(async () => {
    assertCurrentProcessUsesSafeTestDatabase();
    ({ default: customerApp } = await import(
      "../../../src/apps/customer/customer.app"
    ));
    beforeSnapshot = await databaseSnapshot();
  });

  afterAll(async () => {
    expect(
      await databaseSnapshot(),
      "GET /api/products must not mutate products, variants, stock, prices, orders or order details",
    ).toBe(beforeSnapshot);
  });

  test("CAT-API-001 returns only active products in the canonical card envelope", async () => {
    const [response, defaultPage] = await Promise.all([
      request(customerApp).get("/api/products?limit=100&sort=name_asc"),
      request(customerApp).get("/api/products"),
    ]);
    const body = response.body as CatalogResponse;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.pagination).toEqual({
      page: 1,
      limit: 100,
      totalItems: body.data.items.length,
      totalPages: 1,
    });
    expect(ids(body.data.items)).not.toContain(fixture.inactiveProductId);
    expect(ids(body.data.items)).toEqual(
      expect.arrayContaining(
        fixture.products.map((product) => product.productId),
      ),
    );
    expect(defaultPage.status).toBe(200);
    expect(defaultPage.body.data.pagination).toMatchObject({
      page: 1,
      limit: 12,
      totalItems: body.data.items.length,
      totalPages: Math.ceil(body.data.items.length / 12),
    });
    expect(defaultPage.body.data.items).toHaveLength(12);

    const outOfStock = body.data.items.find(
      (item) => item.id === fixture.products.find(
        (product) => product.key === "november",
      )!.productId,
    );
    expect(outOfStock).toMatchObject({
      stockQuantity: 0,
      stockStatus: "out-of-stock",
    });

    for (const item of body.data.items) {
      expect(Object.keys(item).sort()).toEqual(CARD_KEYS);
      expect(item).toMatchObject({
        id: expect.any(Number),
        name: expect.any(String),
        slug: expect.any(String),
        categorySlug: expect.any(String),
        categoryName: expect.any(String),
        image: expect.any(String),
        price: expect.any(Number),
        colors: expect.any(Array),
        capacities: expect.any(Array),
        ramOptions: expect.any(Array),
        stockQuantity: expect.any(Number),
        stockStatus: expect.stringMatching(/^(in-stock|out-of-stock)$/),
      });
      expect(JSON.stringify(item)).not.toMatch(
        /"(product_id|category_id|variant_id|stock_quantity|created_at|is_active)"/,
      );
      const variantPrices = item.variants.map((variant) => variant.price);
      expect(item.price).toBe(
        variantPrices.length > 0 ? Math.min(...variantPrices) : 0,
      );
    }
  });

  test("CAT-API-002 category and categorySlug are aliases; unknown category is empty", async () => {
    const slug = fixture.categories.iphone.slug;
    const [category, alias, unknown] = await Promise.all([
      request(customerApp).get("/api/products").query({
        category: slug,
        sort: "name_asc",
        limit: 100,
      }),
      request(customerApp).get("/api/products").query({
        categorySlug: slug,
        sort: "name_asc",
        limit: 100,
      }),
      request(customerApp).get("/api/products").query({
        category: "category-that-does-not-exist",
      }),
    ]);
    const expected = sortWithIdTie(iphoneProducts, "name_asc");

    expect(category.status).toBe(200);
    expect(alias.status).toBe(200);
    expect(ids(category.body.data.items)).toEqual(expected);
    expect(ids(alias.body.data.items)).toEqual(expected);
    expect(alias.body.data.pagination).toEqual(
      category.body.data.pagination,
    );
    expect(unknown.status).toBe(200);
    expect(unknown.body.data.items).toEqual([]);
    expect(unknown.body.data.pagination).toEqual({
      page: 1,
      limit: 12,
      totalItems: 0,
      totalPages: 0,
    });
  });

  test("CAT-API-003 search is trimmed, case-insensitive, name-based and composes with category", async () => {
    const alpha = fixture.products.find((product) => product.key === "alpha")!;
    const scenarios = [
      { search: "Alpha iPhone", expected: [alpha.productId] },
      { search: "aLpHa IpHoNe", expected: [alpha.productId] },
      { search: "  Alpha iPhone  ", expected: [alpha.productId] },
      { search: "no matching catalog product", expected: [] },
    ];

    for (const scenario of scenarios) {
      const response = await request(customerApp)
        .get("/api/products")
        .query({ search: scenario.search, sort: "name_asc", limit: 100 });
      expect.soft(response.status, scenario.search).toBe(200);
      expect.soft(ids(response.body.data.items), scenario.search).toEqual(
        scenario.expected,
      );
    }

    const crossCategory = await request(customerApp)
      .get("/api/products")
      .query({
        search: "Catalog Alpha",
        category: fixture.categories.ipad.slug,
      });
    expect(crossCategory.status).toBe(200);
    expect(crossCategory.body.data.items).toEqual([]);
  });

  test("CAT-API-004 color, capacity and RAM filters apply independently and to one matching variant", async () => {
    const byKey = Object.fromEntries(
      fixture.products.map((product) => [product.key, product.productId]),
    );
    const slug = fixture.categories.iphone.slug;
    const scenarios = [
      {
        query: { category: slug, color: "Catalog Black" },
        expected: ["alpha", "bravo", "delta", "foxtrot"],
      },
      {
        query: { category: slug, capacity: "128GB" },
        expected: ["alpha", "bravo", "echo", "foxtrot"],
      },
      {
        query: { category: slug, ram: "12GB" },
        expected: ["charlie"],
      },
      {
        query: {
          category: slug,
          color: fixture.filterValues.color,
          capacity: fixture.filterValues.capacity,
        },
        expected: ["alpha", "bravo", "foxtrot"],
      },
      {
        query: {
          category: slug,
          color: fixture.filterValues.color,
          capacity: fixture.filterValues.capacity,
          ram: fixture.filterValues.ram,
        },
        expected: ["alpha", "bravo", "foxtrot"],
      },
    ];

    for (const scenario of scenarios) {
      const response = await request(customerApp)
        .get("/api/products")
        .query({ ...scenario.query, sort: "name_asc", limit: 100 });
      expect.soft(response.status, JSON.stringify(scenario.query)).toBe(200);
      expect
        .soft(ids(response.body.data.items), JSON.stringify(scenario.query))
        .toEqual(scenario.expected.map((key) => byKey[key]));
    }
  });

  test("CAT-API-005 price filters use the minimum variant price, including exact boundaries", async () => {
    const byKey = Object.fromEntries(
      fixture.products.map((product) => [product.key, product.productId]),
    );
    const category = fixture.categories.iphone.slug;
    const scenarios = [
      {
        query: { minPrice: 800 },
        expected: ["bravo", "charlie", "delta", "echo"],
      },
      { query: { maxPrice: 700 }, expected: ["foxtrot", "alpha"] },
      {
        query: { minPrice: 700, maxPrice: 1_200 },
        expected: ["alpha", "bravo", "charlie"],
      },
      {
        query: { minPrice: 1_200, maxPrice: 1_200 },
        expected: ["bravo", "charlie"],
      },
      { query: { maxPrice: 99 }, expected: [] },
    ];

    for (const scenario of scenarios) {
      const response = await request(customerApp)
        .get("/api/products")
        .query({
          category,
          ...scenario.query,
          sort: "name_asc",
          limit: 100,
        });
      expect.soft(response.status, JSON.stringify(scenario.query)).toBe(200);
      expect
        .soft(ids(response.body.data.items), JSON.stringify(scenario.query))
        .toEqual(
          scenario.expected
            .map((key) => fixture.products.find((product) => product.key === key)!)
            .sort((left, right) => left.name.localeCompare(right.name, "en"))
            .map((product) => byKey[product.key]),
        );
    }
  });

  test.each([
    "newest",
    "oldest",
    "price_asc",
    "price_desc",
    "name_asc",
    "name_desc",
  ] as const)("CAT-API-006 sort=%s returns exact deterministic order", async (sort) => {
    const response = await request(customerApp)
      .get("/api/products")
      .query({
        category: fixture.categories.iphone.slug,
        sort,
        limit: 100,
      });

    expect(response.status).toBe(200);
    expect(ids(response.body.data.items)).toEqual(
      sortWithIdTie(iphoneProducts, sort),
    );
  });

  test("CAT-API-007 best_selling uses only Completed quantity and product_id tie-breaks", async () => {
    const response = await request(customerApp)
      .get("/api/products")
      .query({
        category: fixture.categories.iphone.slug,
        sort: "best_selling",
        limit: 100,
      });
    const expectedIds = sortWithIdTie(iphoneProducts, "best_selling");
    const expectedSold = Object.fromEntries(
      iphoneProducts.map((product) => [product.productId, product.sold]),
    );

    expect(response.status).toBe(200);
    expect.soft(ids(response.body.data.items), "best-selling order").toEqual(
      expectedIds,
    );
    expect.soft(
      Object.fromEntries(
        response.body.data.items.map((item: CatalogItem) => [
          item.id,
          item.sold,
        ]),
      ),
      "sold must include Completed orders only",
    ).toEqual(expectedSold);
  });

  test("CAT-API-007-PAGE best_selling retains limit, disjoint pages and totalItems", async () => {
    const query = {
      category: fixture.categories.iphone.slug,
      sort: "best_selling",
      limit: 2,
    };
    const [page1, page2] = await Promise.all([
      request(customerApp).get("/api/products").query({ ...query, page: 1 }),
      request(customerApp).get("/api/products").query({ ...query, page: 2 }),
    ]);
    const expected = sortWithIdTie(iphoneProducts, "best_selling");

    expect(page1.status).toBe(200);
    expect(page2.status).toBe(200);
    expect.soft(ids(page1.body.data.items), "best-selling page 1").toEqual(
      expected.slice(0, 2),
    );
    expect.soft(ids(page2.body.data.items), "best-selling page 2").toEqual(
      expected.slice(2, 4),
    );
    expect.soft(
      ids(page1.body.data.items).filter((id) =>
        ids(page2.body.data.items).includes(id),
      ),
      "best-selling pages must be disjoint",
    ).toEqual([]);
    expect.soft(page1.body.data.pagination).toEqual({
      page: 1,
      limit: 2,
      totalItems: iphoneProducts.length,
      totalPages: Math.ceil(iphoneProducts.length / 2),
    });
    expect.soft(page2.body.data.pagination.totalItems).toBe(
      page1.body.data.pagination.totalItems,
    );
  });

  test("CAT-API-008 combined query applies every predicate before sort and pagination", async () => {
    const byKey = Object.fromEntries(
      fixture.products.map((product) => [product.key, product.productId]),
    );
    const response = await request(customerApp)
      .get("/api/products")
      .query({
        categorySlug: fixture.categories.iphone.slug,
        color: fixture.filterValues.color,
        capacity: fixture.filterValues.capacity,
        ram: fixture.filterValues.ram,
        minPrice: 500,
        maxPrice: 1_200,
        sort: "price_asc",
        page: 1,
        limit: 2,
      });

    expect(response.status).toBe(200);
    expect(ids(response.body.data.items)).toEqual([
      byKey.foxtrot,
      byKey.alpha,
    ]);
    expect(response.body.data.pagination).toEqual({
      page: 1,
      limit: 2,
      totalItems: 3,
      totalPages: 2,
    });
  });

  test("CAT-API-009 pagination is stable, disjoint and bounded for newest and price sorts", async () => {
    for (const sort of ["newest", "price_asc"] as const) {
      const query = { sort, page: 1, limit: 7 };
      const [first, repeated, second] = await Promise.all([
        request(customerApp).get("/api/products").query(query),
        request(customerApp).get("/api/products").query(query),
        request(customerApp)
          .get("/api/products")
          .query({ ...query, page: 2 }),
      ]);
      const firstIds = ids(first.body.data.items);
      const secondIds = ids(second.body.data.items);

      expect.soft(first.status, sort).toBe(200);
      expect.soft(repeated.status, sort).toBe(200);
      expect.soft(second.status, sort).toBe(200);
      expect.soft(firstIds, `${sort} repeated order`).toEqual(
        ids(repeated.body.data.items),
      );
      expect.soft(firstIds.length, `${sort} page 1 bound`).toBeLessThanOrEqual(
        7,
      );
      expect.soft(secondIds.length, `${sort} page 2 bound`).toBeLessThanOrEqual(
        7,
      );
      expect.soft(
        firstIds.filter((id) => secondIds.includes(id)),
        `${sort} disjoint`,
      ).toEqual([]);
      expect.soft(first.body.data.pagination.totalPages, sort).toBe(
        Math.ceil(first.body.data.pagination.totalItems / 7),
      );
    }
  });

  test.each([
    ["page=0", { page: "0" }],
    ["page=-1", { page: "-1" }],
    ["page=abc", { page: "abc" }],
    ["limit=0", { limit: "0" }],
    ["limit=-1", { limit: "-1" }],
    ["limit=abc", { limit: "abc" }],
    ["limit=101", { limit: "101" }],
    ["minPrice=-1", { minPrice: "-1" }],
    ["maxPrice=-1", { maxPrice: "-1" }],
    ["minPrice=abc", { minPrice: "abc" }],
    ["maxPrice=abc", { maxPrice: "abc" }],
    ["minPrice > maxPrice", { minPrice: "2000", maxPrice: "1000" }],
    ["sort=random", { sort: "random" }],
    ["color repeated as array", { color: ["Catalog Black", "Catalog Blue"] }],
  ])("CAT-API-010 rejects invalid query %s without mutation", async (_label, query) => {
    const snapshot = await databaseSnapshot();
    const response = await request(customerApp)
      .get("/api/products")
      .query(query);

    expect.soft(response.status).toBe(400);
    expect.soft(response.body).toMatchObject({ success: false });
    expect(await databaseSnapshot()).toBe(snapshot);
  });
});
