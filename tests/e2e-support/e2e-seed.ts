import bcrypt from "bcrypt";
import type { PrismaClient } from "../../src/generated/prisma/client";

export const E2E_FIXTURE = {
  accountPassword: process.env.E2E_ACCOUNT_PASSWORD || "WebAppleE2E!2026",
  customer: {
    userName: "e2e_customer",
    email: "customer@webapple.e2e",
    phone: "0901000001",
    fullName: "E2E Customer",
  },
  admin: {
    userName: "e2e_admin",
    email: "admin@webapple.e2e",
    phone: "0901000002",
    fullName: "E2E Admin",
  },
  staff: {
    userName: "e2e_staff",
    email: "staff@webapple.e2e",
    phone: "0901000003",
    fullName: "E2E Staff",
  },
  category: {
    name: "E2E iPhone",
    slug: "e2e-iphone",
  },
  product: {
    name: "E2E iPhone Smoke",
    slug: "e2e-iphone-smoke",
  },
  inStockVariant: {
    name: "E2E iPhone Smoke 128GB Đen",
    sku: "E2E-IP-SMOKE-BLK-128",
    color: "Đen E2E",
    capacity: "128GB",
    ram: "8GB",
    price: 20_000_000,
    stockQuantity: 10,
  },
  outOfStockVariant: {
    name: "E2E iPhone Smoke 256GB Trắng",
    sku: "E2E-IP-SMOKE-WHT-256",
    color: "Trắng E2E",
    capacity: "256GB",
    ram: "8GB",
    price: 25_000_000,
    stockQuantity: 0,
  },
  voucher: {
    code: "E2ECOD10",
    discountValue: 10,
  },
} as const;

export async function seedE2EFixtures(prisma: PrismaClient) {
  const passHash = await bcrypt.hash(E2E_FIXTURE.accountPassword, 6);

  return prisma.$transaction(async (tx) => {
    const customerRole = await tx.roles.create({
      data: { role_name: "Customer" },
    });
    const adminRole = await tx.roles.create({
      data: { role_name: "Admin" },
    });
    const staffRole = await tx.roles.create({
      data: { role_name: "Staff" },
    });

    const customer = await tx.users.create({
      data: {
        role_id: customerRole.role_id,
        user_name: E2E_FIXTURE.customer.userName,
        email: E2E_FIXTURE.customer.email,
        phone: E2E_FIXTURE.customer.phone,
        full_name: E2E_FIXTURE.customer.fullName,
        pass_hash: passHash,
        status: 1,
      },
    });
    const admin = await tx.users.create({
      data: {
        role_id: adminRole.role_id,
        user_name: E2E_FIXTURE.admin.userName,
        email: E2E_FIXTURE.admin.email,
        phone: E2E_FIXTURE.admin.phone,
        full_name: E2E_FIXTURE.admin.fullName,
        pass_hash: passHash,
        status: 1,
      },
    });
    const staff = await tx.users.create({
      data: {
        role_id: staffRole.role_id,
        user_name: E2E_FIXTURE.staff.userName,
        email: E2E_FIXTURE.staff.email,
        phone: E2E_FIXTURE.staff.phone,
        full_name: E2E_FIXTURE.staff.fullName,
        pass_hash: passHash,
        status: 1,
      },
    });

    await tx.carts.create({
      data: { user_id: customer.user_id },
    });

    const address = await tx.user_addresses.create({
      data: {
        user_id: customer.user_id,
        receiver_name: "E2E Customer",
        receiver_phone: "0901000001",
        detailed_address: "01 Đường E2E",
        ward: "Phường Test",
        city: "TP Hồ Chí Minh",
        is_default: true,
      },
    });

    const category = await tx.categories.create({
      data: {
        category_name: E2E_FIXTURE.category.name,
        slug: E2E_FIXTURE.category.slug,
        description: "Danh mục fixture cho Full-stack E2E smoke.",
        display_order: 1,
        is_active: true,
      },
    });

    const product = await tx.products.create({
      data: {
        category_id: category.category_id,
        name: E2E_FIXTURE.product.name,
        slug: E2E_FIXTURE.product.slug,
        description: "Sản phẩm fixture cho Full-stack E2E smoke.",
        is_active: true,
      },
    });

    const inStockVariant = await tx.product_variants.create({
      data: {
        product_id: product.product_id,
        variant_name: E2E_FIXTURE.inStockVariant.name,
        sku: E2E_FIXTURE.inStockVariant.sku,
        color: E2E_FIXTURE.inStockVariant.color,
        capacity: E2E_FIXTURE.inStockVariant.capacity,
        ram: E2E_FIXTURE.inStockVariant.ram,
        country: "VN",
        price: E2E_FIXTURE.inStockVariant.price,
        old_price: 22_000_000,
        stock_quantity: E2E_FIXTURE.inStockVariant.stockQuantity,
      },
    });

    const outOfStockVariant = await tx.product_variants.create({
      data: {
        product_id: product.product_id,
        variant_name: E2E_FIXTURE.outOfStockVariant.name,
        sku: E2E_FIXTURE.outOfStockVariant.sku,
        color: E2E_FIXTURE.outOfStockVariant.color,
        capacity: E2E_FIXTURE.outOfStockVariant.capacity,
        ram: E2E_FIXTURE.outOfStockVariant.ram,
        country: "VN",
        price: E2E_FIXTURE.outOfStockVariant.price,
        stock_quantity: E2E_FIXTURE.outOfStockVariant.stockQuantity,
      },
    });

    await tx.product_images.create({
      data: {
        product_id: product.product_id,
        variant_id: inStockVariant.variant_id,
        color: E2E_FIXTURE.inStockVariant.color,
        image_url: "/products/iphone/iphone-15-plus.png",
        alt_text: E2E_FIXTURE.product.name,
        is_thumbnail: true,
        sort_order: 1,
        is_active: true,
      },
    });

    const voucher = await tx.vouchers.create({
      data: {
        code: E2E_FIXTURE.voucher.code,
        discount_type: "Percent",
        discount_value: E2E_FIXTURE.voucher.discountValue,
        min_order_value: 1_000_000,
        max_discount_amount: 2_000_000,
        usage_limit: 100,
        used_count: 0,
        start_date: new Date("2026-01-01T00:00:00.000Z"),
        end_date: new Date("2030-12-31T23:59:59.000Z"),
        is_active: true,
      },
    });

    return {
      accounts: {
        customer: customer.user_id,
        admin: admin.user_id,
        staff: staff.user_id,
      },
      catalog: {
        categoryId: category.category_id,
        productId: product.product_id,
        inStockVariantId: inStockVariant.variant_id,
        outOfStockVariantId: outOfStockVariant.variant_id,
      },
      checkout: {
        addressId: address.address_id,
        voucherId: voucher.voucher_id,
      },
    };
  });
}
