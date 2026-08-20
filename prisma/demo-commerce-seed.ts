import type { Prisma, PrismaClient } from "../src/generated/prisma/client";
import prisma from "../src/utils/prisma";
import {
  demoCategories,
  demoProducts,
  demoReceipts,
  demoSuppliers,
  demoVouchers,
  desiredStockForCategory,
  serializedCategorySlugs,
} from "./demo-commerce-data";

const DEMO_SERIAL_PREFIX = "DEMO-SERIAL-";
const VOUCHER_START = new Date("2026-01-01T00:00:00.000Z");
const VOUCHER_END = new Date("2035-12-31T23:59:59.000Z");
type CommerceClient = Prisma.TransactionClient;

export type DemoCommerceSummary = {
  categories: number;
  productsByCategory: Record<string, number>;
  products: number;
  variants: number;
  specifications: number;
  promotions: number;
  suppliers: number;
  receipts: number;
  receiptDetails: number;
  serials: number;
  vouchers: number;
  productImages: number;
  cloudinaryCalls: 0;
};

export function validateDemoCommerceDefinitions() {
  const expectedProductsByCategory: Record<string, number> = {
    iphone: 5,
    macbook: 5,
    ipad: 5,
    "apple-watch": 5,
    camera: 2,
    "am-thanh": 4,
    imac: 2,
    "phu-kien": 6,
  };
  const categorySlugs = demoCategories.map(([, slug]) => slug);
  const productSlugs = demoProducts.map((product) => product.slug);
  const variants = demoProducts.flatMap((product) => product.variants);
  const skus = variants.map((item) => item.sku);
  const voucherCodes = demoVouchers.map((voucher) => voucher.code);

  if (categorySlugs.length !== 8 || new Set(categorySlugs).size !== 8) {
    throw new Error("Demo commerce definition must contain 8 unique categories");
  }
  if (demoProducts.length !== 34 || new Set(productSlugs).size !== 34) {
    throw new Error("Demo commerce definition must contain 34 unique products");
  }

  for (const [categorySlug, expectedCount] of Object.entries(expectedProductsByCategory)) {
    const products = demoProducts.filter((product) => product.category === categorySlug);
    if (products.length !== expectedCount) {
      throw new Error(`Category ${categorySlug} must contain ${expectedCount} demo products`);
    }
    if (
      ["iphone", "macbook", "ipad", "apple-watch"].includes(categorySlug) &&
      products.some((product) => ![3, 4].includes(product.variants.length))
    ) {
      throw new Error(`Core category ${categorySlug} products must contain 3-4 variants`);
    }
  }

  if (variants.length < 80 || variants.length > 100) {
    throw new Error("Demo commerce definition must contain 80-100 variants");
  }
  if (new Set(skus).size !== skus.length) {
    throw new Error("Demo commerce SKU definitions must be unique");
  }
  if (
    variants.some(
      (item) =>
        !item.sku.startsWith("DEMO-") ||
        item.sku.length > 50 ||
        item.price <= 0 ||
        (item.oldPrice !== null && item.oldPrice <= 0),
    )
  ) {
    throw new Error("Demo variants must have valid namespaced SKU and prices");
  }
  if (demoProducts.some((product) => !product.variants.length || !product.slug.startsWith("demo-"))) {
    throw new Error("Every demo product must be namespaced and have variants");
  }
  const coreProducts = demoProducts.filter((product) => serializedCategorySlugs.has(product.category));
  if (coreProducts.some((product) => !product.specs?.length)) {
    throw new Error("Every core demo product must have specifications");
  }
  if (demoVouchers.length !== 8 || new Set(voucherCodes).size !== 8) {
    throw new Error("Demo commerce definition must contain 8 unique vouchers");
  }
}

function serialNumber(sku: string, index: number) {
  const value = `${DEMO_SERIAL_PREFIX}${sku.slice("DEMO-".length)}-${String(index).padStart(3, "0")}`;
  if (value.length > 50) throw new Error(`Generated serial exceeds schema limit for SKU ${sku}`);
  return value;
}

function costPrice(price: number) {
  return Math.floor((price * 0.78) / 1_000) * 1_000;
}

async function findOperator(tx: CommerceClient) {
  const warehouse = await tx.users.findFirst({
    where: { status: 1, roles: { role_name: "WarehouseStaff" } },
    orderBy: { user_id: "asc" },
  });
  if (warehouse) return warehouse;
  const admin = await tx.users.findFirst({
    where: { status: 1, roles: { role_name: "Admin" } },
    orderBy: { user_id: "asc" },
  });
  if (!admin) {
    throw new Error(
      "Demo commerce seed requires an active Admin or WarehouseStaff operator. Run the demo account seed first.",
    );
  }
  return admin;
}

async function reconcileSupplier(tx: CommerceClient, definition: (typeof demoSuppliers)[number]) {
  const existing = await tx.suppliers.findFirst({
    where: { supplier_name: { equals: definition.name, mode: "insensitive" } },
    orderBy: { supplier_id: "asc" },
  });
  const data = {
    supplier_name: definition.name,
    phone: definition.phone,
    email: definition.email,
    address: definition.address,
    status: "Active",
  };
  return existing
    ? tx.suppliers.update({ where: { supplier_id: existing.supplier_id }, data })
    : tx.suppliers.create({ data });
}

async function reconcileSpecifications(
  tx: CommerceClient,
  productId: number,
  definitions: NonNullable<(typeof demoProducts)[number]["specs"]>,
) {
  const groupOrder = new Map<string, number>();
  for (const definition of definitions) {
    if (!groupOrder.has(definition.group)) groupOrder.set(definition.group, groupOrder.size + 1);
  }

  for (const [groupName, sortOrder] of groupOrder) {
    const existingGroup = await tx.product_spec_groups.findFirst({
      where: { product_id: productId, group_name: groupName },
      orderBy: { spec_group_id: "asc" },
    });
    const group = existingGroup
      ? await tx.product_spec_groups.update({
          where: { spec_group_id: existingGroup.spec_group_id },
          data: { sort_order: sortOrder, is_active: true },
        })
      : await tx.product_spec_groups.create({
          data: { product_id: productId, group_name: groupName, sort_order: sortOrder, is_active: true },
        });
    const groupSpecs = definitions.filter((definition) => definition.group === groupName);

    for (const [index, definition] of groupSpecs.entries()) {
      const existingSpec = await tx.product_specs.findFirst({
        where: {
          product_id: productId,
          variant_id: null,
          spec_group_id: group.spec_group_id,
          spec_key: definition.key,
        },
        orderBy: { spec_id: "asc" },
      });
      const data = {
        product_id: productId,
        variant_id: null,
        spec_group_id: group.spec_group_id,
        spec_key: definition.key,
        spec_label: definition.label,
        spec_value: definition.value,
        unit: definition.unit ?? null,
        sort_order: index + 1,
        is_highlight: true,
        is_filterable: ["chip", "ram", "storage"].includes(definition.key),
        is_active: true,
      };
      if (existingSpec) {
        await tx.product_specs.update({ where: { spec_id: existingSpec.spec_id }, data });
      } else {
        await tx.product_specs.create({ data });
      }
    }
  }
}

async function reconcilePromotions(tx: CommerceClient, productId: number, promotionTexts: string[]) {
  for (const [index, promotionText] of promotionTexts.entries()) {
    const existing = await tx.product_promotions.findFirst({
      where: { product_id: productId, variant_id: null, promotion_text: promotionText },
      orderBy: { promotion_id: "asc" },
    });
    if (existing) {
      await tx.product_promotions.update({
        where: { promotion_id: existing.promotion_id },
        data: { sort_order: index + 1, is_active: true },
      });
    } else {
      await tx.product_promotions.create({
        data: { product_id: productId, variant_id: null, promotion_text: promotionText, sort_order: index + 1, is_active: true },
      });
    }
  }
}

async function getSummary(
  tx: CommerceClient,
  productIds: number[],
  receiptIds: number[],
): Promise<DemoCommerceSummary> {
  const categorySlugs = demoCategories.map(([, slug]) => slug);
  const productSlugs = demoProducts.map((product) => product.slug);
  const skus = demoProducts.flatMap((product) => product.variants.map((item) => item.sku));
  const supplierNames = demoSuppliers.map((supplier) => supplier.name);
  const voucherCodes = demoVouchers.map((voucher) => voucher.code);
  const [categories, managedProducts, variants, specifications, promotions, suppliers, receiptDetails, serials, vouchers, productImages] =
    await Promise.all([
      tx.categories.count({ where: { slug: { in: categorySlugs } } }),
      tx.products.findMany({
        where: { slug: { in: productSlugs } },
        select: { categories: { select: { slug: true } } },
      }),
      tx.product_variants.count({ where: { sku: { in: skus } } }),
      tx.product_specs.count({ where: { product_id: { in: productIds } } }),
      tx.product_promotions.count({ where: { product_id: { in: productIds } } }),
      tx.suppliers.count({ where: { supplier_name: { in: supplierNames } } }),
      tx.inventory_receipt_details.count({ where: { receipt_id: { in: receiptIds } } }),
      tx.product_items.count({ where: { serial_number: { startsWith: DEMO_SERIAL_PREFIX } } }),
      tx.vouchers.count({ where: { code: { in: voucherCodes } } }),
      tx.product_images.count({ where: { product_id: { in: productIds } } }),
    ]);
  const productsByCategory = Object.fromEntries(
    demoCategories.map(([, slug]) => [
      slug,
      managedProducts.filter((product) => product.categories.slug === slug)
        .length,
    ]),
  );

  return {
    categories,
    productsByCategory,
    products: managedProducts.length,
    variants,
    specifications,
    promotions,
    suppliers,
    receipts: receiptIds.length,
    receiptDetails,
    serials,
    vouchers,
    productImages,
    cloudinaryCalls: 0,
  };
}

export async function seedDemoCommerce(client: PrismaClient = prisma) {
  validateDemoCommerceDefinitions();
  return client.$transaction(
    async (tx) => {
      const operator = await findOperator(tx);
      const categoryRows = new Map<string, number>();

      for (const [name, slug, displayOrder] of demoCategories) {
        const category = await tx.categories.upsert({
          where: { slug },
          update: { category_name: name, description: `Danh mục ${name} của WebApple`, display_order: displayOrder, is_active: true },
          create: { category_name: name, slug, description: `Danh mục ${name} của WebApple`, display_order: displayOrder, is_active: true },
        });
        categoryRows.set(slug, category.category_id);
      }

      const productRows = new Map<string, number>();
      const variantRows = new Map<string, { id: number; category: string; price: number }>();
      for (const definition of demoProducts) {
        const product = await tx.products.upsert({
          where: { slug: definition.slug },
          update: { category_id: categoryRows.get(definition.category)!, name: definition.name, description: definition.description, is_active: true },
          create: { category_id: categoryRows.get(definition.category)!, name: definition.name, slug: definition.slug, description: definition.description, is_active: true },
        });
        productRows.set(definition.slug, product.product_id);

        for (const item of definition.variants) {
          const existing = await tx.product_variants.findUnique({ where: { sku: item.sku } });
          const data = {
            product_id: product.product_id,
            variant_name: item.name,
            color: item.color,
            capacity: item.capacity,
            ram: item.ram,
            country: item.country,
            price: item.price,
            old_price: item.oldPrice,
            installment: "Hỗ trợ trả góp qua thẻ tín dụng",
            discount_label:
              item.oldPrice && item.oldPrice > item.price
                ? `Giảm ${Math.round(((item.oldPrice - item.price) / item.oldPrice) * 100)}%`
                : null,
          };
          const row = existing
            ? await tx.product_variants.update({ where: { variant_id: existing.variant_id }, data })
            : await tx.product_variants.create({ data: { ...data, sku: item.sku, stock_quantity: 0 } });
          variantRows.set(item.sku, { id: row.variant_id, category: definition.category, price: item.price });
        }
        if (definition.specs?.length) await reconcileSpecifications(tx, product.product_id, definition.specs);
        if (definition.promotions?.length) await reconcilePromotions(tx, product.product_id, definition.promotions);
      }

      const supplierRows = new Map<string, { id: number; name: string }>();
      for (const definition of demoSuppliers) {
        const supplier = await reconcileSupplier(tx, definition);
        supplierRows.set(definition.name, { id: supplier.supplier_id, name: supplier.supplier_name });
      }

      const receiptIds: number[] = [];
      for (const definition of demoReceipts) {
        const supplier = supplierRows.get(definition.supplier)!;
        const receiptVariants = [...variantRows.entries()].filter(([, item]) =>
          (definition.categories as readonly string[]).includes(item.category),
        );
        const totalAmount = receiptVariants.reduce(
          (total, [, item]) => total + desiredStockForCategory(item.category) * costPrice(item.price),
          0,
        );
        const matchingReceipts = await tx.inventory_receipts.findMany({
          where: { supplier_id: supplier.id, created_at: definition.createdAt },
          orderBy: { receipt_id: "asc" },
        });
        if (matchingReceipts.length > 1) {
          throw new Error(`Multiple demo receipts match ${definition.key}; manual reconciliation is required`);
        }
        const receipt = matchingReceipts[0]
          ? await tx.inventory_receipts.update({
              where: { receipt_id: matchingReceipts[0].receipt_id },
              data: { warehouse_staff_id: operator.user_id, supplier_id: supplier.id, supplier_name: supplier.name, total_amount: totalAmount },
            })
          : await tx.inventory_receipts.create({
              data: { warehouse_staff_id: operator.user_id, supplier_id: supplier.id, supplier_name: supplier.name, total_amount: totalAmount, created_at: definition.createdAt },
            });
        receiptIds.push(receipt.receipt_id);

        for (const [sku, item] of receiptVariants) {
          const quantity = desiredStockForCategory(item.category);
          const matchingDetails = await tx.inventory_receipt_details.findMany({
            where: { receipt_id: receipt.receipt_id, variant_id: item.id },
            orderBy: { receipt_detail_id: "asc" },
          });
          if (matchingDetails.length > 1) throw new Error(`Multiple demo receipt details match ${definition.key}/${sku}`);
          const previousQuantity = matchingDetails[0]?.quantity ?? 0;
          const delta = quantity - previousQuantity;
          const detail = matchingDetails[0]
            ? await tx.inventory_receipt_details.update({
                where: { receipt_detail_id: matchingDetails[0].receipt_detail_id },
                data: { quantity, cost_price: costPrice(item.price) },
              })
            : await tx.inventory_receipt_details.create({
                data: { receipt_id: receipt.receipt_id, variant_id: item.id, quantity, cost_price: costPrice(item.price) },
              });
          if (delta !== 0) {
            const currentVariant = await tx.product_variants.findUniqueOrThrow({
              where: { variant_id: item.id },
              select: { stock_quantity: true },
            });
            if (currentVariant.stock_quantity + delta < 0) {
              throw new Error(`Cannot reconcile ${sku}: resulting stock would be negative`);
            }
            await tx.product_variants.update({
              where: { variant_id: item.id },
              data: { stock_quantity: { increment: delta } },
            });
          }

          if (serializedCategorySlugs.has(item.category)) {
            for (let index = 1; index <= quantity; index += 1) {
              const serial = serialNumber(sku, index);
              const existingItem = await tx.product_items.findUnique({ where: { serial_number: serial } });
              if (existingItem && existingItem.variant_id !== item.id) {
                throw new Error(`Demo serial ${serial} belongs to another variant`);
              }
              if (!existingItem) {
                await tx.product_items.create({
                  data: { variant_id: item.id, serial_number: serial, status: 1, import_receipt_detail_id: detail.receipt_detail_id },
                });
              }
            }
          }
        }
      }

      for (const definition of demoVouchers) {
        const data = {
          discount_type: definition.type,
          discount_value: definition.value,
          min_order_value: definition.minimum,
          max_discount_amount: definition.maximum,
          usage_limit: definition.limit,
          start_date: VOUCHER_START,
          end_date: VOUCHER_END,
          is_active: true,
        };
        await tx.vouchers.upsert({
          where: { code: definition.code },
          update: data,
          create: { code: definition.code, ...data, used_count: 0 },
        });
      }
      return getSummary(tx, [...productRows.values()], receiptIds);
    },
    { maxWait: 30_000, timeout: 120_000 },
  );
}

export function printDemoCommerceSummary(summary: DemoCommerceSummary) {
  const labelBySlug = new Map(demoCategories.map(([name, slug]) => [slug, name]));
  console.log("=== WebApple Demo Seed Completed ===");
  console.log(`\nCategories: ${summary.categories}`);
  console.log("\nProducts:");
  for (const [, slug] of demoCategories) {
    console.log(`- ${labelBySlug.get(slug)}: ${summary.productsByCategory[slug] ?? 0}`);
  }
  console.log(`Total Products: ${summary.products}`);
  console.log(`\nVariants: ${summary.variants}`);
  console.log(`Specifications: ${summary.specifications}`);
  console.log(`Promotions: ${summary.promotions}`);
  console.log(`\nSuppliers: ${summary.suppliers}`);
  console.log(`Inventory Receipts: ${summary.receipts}`);
  console.log(`Receipt Details: ${summary.receiptDetails}`);
  console.log(`Product Items / Serials: ${summary.serials}`);
  console.log(`\nVouchers: ${summary.vouchers}`);
  console.log(`\nProduct Images: ${summary.productImages}`);
  console.log(`Cloudinary calls: ${summary.cloudinaryCalls}`);
  console.log("\nNext:");
  console.log("Admin → Products → upload product images manually");
}

async function run() {
  const summary = await seedDemoCommerce();
  printDemoCommerceSummary(summary);
}

if (require.main === module) {
  run()
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
