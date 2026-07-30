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

  const secondaryProductData = {
    category_id: category.category_id,
    name: "Test iPhone Cart Secondary",
    slug: "test-iphone-cart-secondary",
    description: "Secondary deterministic cart product",
    is_active: true,
  };
  const secondaryProduct = await prisma.products.upsert({
    where: { slug: secondaryProductData.slug },
    update: secondaryProductData,
    create: secondaryProductData,
  });

  const stockOneVariantData = {
    product_id: secondaryProduct.product_id,
    variant_name: "Cart Last Unit",
    sku: "TST-CART-STOCK-1",
    color: "Test Silver",
    capacity: "256GB",
    ram: "8GB",
    country: "VN",
    price: 1_234_567.25,
    old_price: 1_500_000,
    stock_quantity: 1,
  };
  const variantStockOne = await prisma.product_variants.upsert({
    where: { sku: stockOneVariantData.sku },
    update: stockOneVariantData,
    create: stockOneVariantData,
  });

  const outOfStockVariantData = {
    product_id: secondaryProduct.product_id,
    variant_name: "Cart Out Of Stock",
    sku: "TST-CART-STOCK-0",
    color: "Test Blue",
    capacity: "512GB",
    ram: "8GB",
    country: "VN",
    price: 2_345_678.5,
    old_price: null,
    stock_quantity: 0,
  };
  const variantOutOfStock = await prisma.product_variants.upsert({
    where: { sku: outOfStockVariantData.sku },
    update: outOfStockVariantData,
    create: outOfStockVariantData,
  });

  const inactiveProductData = {
    category_id: category.category_id,
    name: "Test Inactive Cart Product",
    slug: "test-inactive-cart-product",
    description: "Inactive product for cart rejection",
    is_active: false,
  };
  const inactiveProduct = await prisma.products.upsert({
    where: { slug: inactiveProductData.slug },
    update: inactiveProductData,
    create: inactiveProductData,
  });

  const inactiveProductVariantData = {
    product_id: inactiveProduct.product_id,
    variant_name: "Inactive Product Variant",
    sku: "TST-CART-INACTIVE-PRODUCT",
    color: "Test Gray",
    capacity: "128GB",
    ram: "4GB",
    country: "VN",
    price: 3_456_789.75,
    old_price: null,
    stock_quantity: 5,
  };
  const inactiveProductVariant = await prisma.product_variants.upsert({
    where: { sku: inactiveProductVariantData.sku },
    update: inactiveProductVariantData,
    create: inactiveProductVariantData,
  });

  return {
    category,
    product,
    variant,
    secondaryProduct,
    variantStockOne,
    variantOutOfStock,
    inactiveProduct,
    inactiveProductVariant,
  };
}
