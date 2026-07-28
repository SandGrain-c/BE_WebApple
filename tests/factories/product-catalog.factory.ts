import type { PrismaClient } from "../../src/generated/prisma/client";

const CATALOG_CREATED_AT = {
  alpha: new Date("2026-01-01T00:00:00.000Z"),
  bravo: new Date("2026-01-02T00:00:00.000Z"),
  charlie: new Date("2026-01-03T00:00:00.000Z"),
  delta: new Date("2026-01-03T00:00:00.000Z"),
  echo: new Date("2026-01-05T00:00:00.000Z"),
  foxtrot: new Date("2026-01-06T00:00:00.000Z"),
  golf: new Date("2026-01-07T00:00:00.000Z"),
  hotel: new Date("2026-01-08T00:00:00.000Z"),
  india: new Date("2026-01-09T00:00:00.000Z"),
  juliett: new Date("2026-01-10T00:00:00.000Z"),
  kilo: new Date("2026-01-11T00:00:00.000Z"),
  lima: new Date("2026-01-12T00:00:00.000Z"),
  mike: new Date("2026-01-13T00:00:00.000Z"),
  november: new Date("2026-01-14T00:00:00.000Z"),
  oscar: new Date("2026-01-15T00:00:00.000Z"),
} as const;

type ProductDefinition = {
  key: keyof typeof CATALOG_CREATED_AT;
  categoryKey: "iphone" | "ipad" | "accessory";
  name: string;
  price: number;
  color: string;
  capacity: string;
  ram: string;
  stockQuantity: number;
};

const PRODUCT_DEFINITIONS: ProductDefinition[] = [
  {
    key: "alpha",
    categoryKey: "iphone",
    name: "Catalog Alpha iPhone",
    price: 900,
    color: "Catalog Black",
    capacity: "128GB",
    ram: "8GB",
    stockQuantity: 10,
  },
  {
    key: "bravo",
    categoryKey: "iphone",
    name: "Catalog Bravo iPhone",
    price: 1_200,
    color: "Catalog Black",
    capacity: "128GB",
    ram: "8GB",
    stockQuantity: 6,
  },
  {
    key: "charlie",
    categoryKey: "iphone",
    name: "Catalog Charlie iPhone",
    price: 1_200,
    color: "Catalog White",
    capacity: "256GB",
    ram: "12GB",
    stockQuantity: 5,
  },
  {
    key: "delta",
    categoryKey: "iphone",
    name: "Catalog Delta iPhone",
    price: 2_000,
    color: "Catalog Black",
    capacity: "512GB",
    ram: "16GB",
    stockQuantity: 4,
  },
  {
    key: "echo",
    categoryKey: "iphone",
    name: "Catalog Echo iPhone",
    price: 3_000,
    color: "Catalog Gold",
    capacity: "128GB",
    ram: "8GB",
    stockQuantity: 3,
  },
  {
    key: "foxtrot",
    categoryKey: "iphone",
    name: "Catalog Foxtrot iPhone",
    price: 500,
    color: "Catalog Black",
    capacity: "128GB",
    ram: "8GB",
    stockQuantity: 2,
  },
  {
    key: "golf",
    categoryKey: "ipad",
    name: "Catalog Golf iPad",
    price: 800,
    color: "Catalog Space Gray",
    capacity: "128GB",
    ram: "8GB",
    stockQuantity: 7,
  },
  {
    key: "hotel",
    categoryKey: "ipad",
    name: "Catalog Hotel iPad",
    price: 1_500,
    color: "Catalog Silver",
    capacity: "256GB",
    ram: "16GB",
    stockQuantity: 6,
  },
  {
    key: "india",
    categoryKey: "ipad",
    name: "Catalog India iPad",
    price: 2_500,
    color: "Catalog Blue",
    capacity: "512GB",
    ram: "16GB",
    stockQuantity: 5,
  },
  {
    key: "juliett",
    categoryKey: "ipad",
    name: "Catalog Juliett iPad",
    price: 4_000,
    color: "Catalog Black",
    capacity: "1TB",
    ram: "16GB",
    stockQuantity: 4,
  },
  {
    key: "kilo",
    categoryKey: "accessory",
    name: "Catalog Kilo Accessory",
    price: 100,
    color: "Catalog Black",
    capacity: "Standard",
    ram: "N/A",
    stockQuantity: 12,
  },
  {
    key: "lima",
    categoryKey: "accessory",
    name: "Catalog Lima Accessory",
    price: 200,
    color: "Catalog White",
    capacity: "Standard",
    ram: "N/A",
    stockQuantity: 11,
  },
  {
    key: "mike",
    categoryKey: "accessory",
    name: "Catalog Mike Accessory",
    price: 300,
    color: "Catalog Red",
    capacity: "Standard",
    ram: "N/A",
    stockQuantity: 9,
  },
  {
    key: "november",
    categoryKey: "accessory",
    name: "Catalog November Accessory",
    price: 400,
    color: "Catalog Green",
    capacity: "Standard",
    ram: "N/A",
    stockQuantity: 0,
  },
  {
    key: "oscar",
    categoryKey: "accessory",
    name: "Catalog Oscar Accessory",
    price: 600,
    color: "Catalog Black",
    capacity: "Standard",
    ram: "N/A",
    stockQuantity: 8,
  },
];

export async function createProductCatalogFixture(
  prisma: PrismaClient,
  input: { customerId: number },
) {
  const categoryDefinitions = {
    iphone: {
      category_name: "Catalog iPhone",
      slug: "iphone",
      description: "Catalog integration fixture",
      display_order: 10,
      is_active: true,
    },
    ipad: {
      category_name: "Catalog iPad",
      slug: "ipad",
      description: "Catalog integration fixture",
      display_order: 20,
      is_active: true,
    },
    accessory: {
      category_name: "Catalog Accessories",
      slug: "catalog-accessories",
      description: "Catalog integration fixture",
      display_order: 30,
      is_active: true,
    },
  } as const;

  const categoryEntries = await Promise.all(
    Object.entries(categoryDefinitions).map(async ([key, data]) => {
      const category = await prisma.categories.upsert({
        where: { slug: data.slug },
        update: data,
        create: data,
      });

      return [key, category] as const;
    }),
  );
  const categories = Object.fromEntries(categoryEntries) as Record<
    keyof typeof categoryDefinitions,
    (typeof categoryEntries)[number][1]
  >;

  const products = [];
  const variants = [];

  for (const definition of PRODUCT_DEFINITIONS) {
    const slug = `catalog-${definition.key}`;
    const product = await prisma.products.upsert({
      where: { slug },
      update: {
        category_id: categories[definition.categoryKey].category_id,
        name: definition.name,
        description: `Deterministic ${definition.name} fixture`,
        is_active: true,
        created_at: CATALOG_CREATED_AT[definition.key],
      },
      create: {
        category_id: categories[definition.categoryKey].category_id,
        name: definition.name,
        slug,
        description: `Deterministic ${definition.name} fixture`,
        is_active: true,
        created_at: CATALOG_CREATED_AT[definition.key],
      },
    });
    const sku = `CAT-${definition.key.toUpperCase()}-BASE`;
    const variant = await prisma.product_variants.upsert({
      where: { sku },
      update: {
        product_id: product.product_id,
        variant_name: `${definition.name} base`,
        color: definition.color,
        capacity: definition.capacity,
        ram: definition.ram,
        country: "VN",
        price: definition.price,
        old_price: null,
        stock_quantity: definition.stockQuantity,
      },
      create: {
        product_id: product.product_id,
        variant_name: `${definition.name} base`,
        sku,
        color: definition.color,
        capacity: definition.capacity,
        ram: definition.ram,
        country: "VN",
        price: definition.price,
        old_price: null,
        stock_quantity: definition.stockQuantity,
      },
    });

    products.push(product);
    variants.push(variant);
  }

  const alpha = products[0];
  const alphaLowerPriceVariant = await prisma.product_variants.upsert({
    where: { sku: "CAT-ALPHA-LOW" },
    update: {
      product_id: alpha.product_id,
      variant_name: "Catalog Alpha lower representative price",
      color: "Catalog Blue",
      capacity: "256GB",
      ram: "8GB",
      country: "VN",
      price: 700,
      old_price: null,
      stock_quantity: 0,
    },
    create: {
      product_id: alpha.product_id,
      variant_name: "Catalog Alpha lower representative price",
      sku: "CAT-ALPHA-LOW",
      color: "Catalog Blue",
      capacity: "256GB",
      ram: "8GB",
      country: "VN",
      price: 700,
      old_price: null,
      stock_quantity: 0,
    },
  });

  const inactiveProduct = await prisma.products.upsert({
    where: { slug: "catalog-inactive" },
    update: {
      category_id: categories.iphone.category_id,
      name: "Catalog Inactive Product",
      description: "Must never appear in public catalog",
      is_active: false,
      created_at: new Date("2026-01-20T00:00:00.000Z"),
    },
    create: {
      category_id: categories.iphone.category_id,
      name: "Catalog Inactive Product",
      slug: "catalog-inactive",
      description: "Must never appear in public catalog",
      is_active: false,
      created_at: new Date("2026-01-20T00:00:00.000Z"),
    },
  });
  await prisma.product_variants.upsert({
    where: { sku: "CAT-INACTIVE-BASE" },
    update: {
      product_id: inactiveProduct.product_id,
      variant_name: "Inactive catalog variant",
      color: "Catalog Black",
      capacity: "128GB",
      ram: "8GB",
      country: "VN",
      price: 50,
      old_price: null,
      stock_quantity: 99,
    },
    create: {
      product_id: inactiveProduct.product_id,
      variant_name: "Inactive catalog variant",
      sku: "CAT-INACTIVE-BASE",
      color: "Catalog Black",
      capacity: "128GB",
      ram: "8GB",
      country: "VN",
      price: 50,
      old_price: null,
      stock_quantity: 99,
    },
  });

  const orderDefinitions = [
    {
      code: "CAT-COMPLETED-ALPHA",
      status: "Completed",
      variantId: variants[0].variant_id,
      quantity: 8,
    },
    {
      code: "CAT-COMPLETED-BRAVO",
      status: "Completed",
      variantId: variants[1].variant_id,
      quantity: 3,
    },
    {
      code: "CAT-COMPLETED-CHARLIE",
      status: "Completed",
      variantId: variants[2].variant_id,
      quantity: 3,
    },
    {
      code: "CAT-CANCELLED-DELTA",
      status: "Cancelled",
      variantId: variants[3].variant_id,
      quantity: 100,
    },
    {
      code: "CAT-PROCESSING-DELTA",
      status: "Processing",
      variantId: variants[3].variant_id,
      quantity: 50,
    },
  ] as const;

  for (const definition of orderDefinitions) {
    const order = await prisma.orders.upsert({
      where: { order_code: definition.code },
      update: {
        user_id: input.customerId,
        sub_total: 1_000,
        shipping_fee: 0,
        discount_amount: 0,
        total_amount: 1_000,
        order_status: definition.status,
        customer_name: "Catalog Test Customer",
        customer_phone: "0900000001",
        shipping_address: "Catalog test address",
      },
      create: {
        user_id: input.customerId,
        order_code: definition.code,
        sub_total: 1_000,
        shipping_fee: 0,
        discount_amount: 0,
        total_amount: 1_000,
        order_status: definition.status,
        customer_name: "Catalog Test Customer",
        customer_phone: "0900000001",
        shipping_address: "Catalog test address",
      },
    });
    await prisma.order_details.upsert({
      where: {
        order_id_variant_id: {
          order_id: order.order_id,
          variant_id: definition.variantId,
        },
      },
      update: {
        quantity: definition.quantity,
        unit_price: 1_000,
      },
      create: {
        order_id: order.order_id,
        variant_id: definition.variantId,
        quantity: definition.quantity,
        unit_price: 1_000,
      },
    });
  }

  return {
    categories,
    products,
    variants,
    alphaLowerPriceVariant,
    inactiveProduct,
  };
}
