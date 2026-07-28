import type { PrismaClient } from "../../src/generated/prisma/client";

export async function createActiveCatalogFixture(prisma: PrismaClient) {
  const categoryData = {
    category_name: "Test iPhone",
    slug: "test-iphone",
    description: "Backend foundation fixture",
    display_order: 1,
    is_active: true,
  };
  const category = await prisma.categories.upsert({
    where: { slug: categoryData.slug },
    update: categoryData,
    create: categoryData,
  });

  const productData = {
    category_id: category.category_id,
    name: "Test iPhone Foundation",
    slug: "test-iphone-foundation",
    description: "Deterministic integration-test product",
    is_active: true,
  };
  const product = await prisma.products.upsert({
    where: { slug: productData.slug },
    update: productData,
    create: productData,
  });

  const variantData = {
    product_id: product.product_id,
    variant_name: "128GB Test Black",
    sku: "TST-IPHONE-128-BLK",
    color: "Test Black",
    capacity: "128GB",
    ram: "8GB",
    country: "VN",
    price: 20_000_000,
    old_price: 21_000_000,
    stock_quantity: 10,
  };
  const variant = await prisma.product_variants.upsert({
    where: { sku: variantData.sku },
    update: variantData,
    create: variantData,
  });

  return { category, product, variant };
}
