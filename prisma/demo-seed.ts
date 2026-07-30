import bcrypt from "bcrypt";
import prisma from "../src/utils/prisma";

const DEMO_EMAIL_DOMAIN = "@webapple.demo";
const DEMO_ORDER_PREFIX = "DEMO-";
const DEMO_SERIAL_PREFIX = "WA-DEMO-";

const requiredDemoPassword = () => {
  const password = process.env.DEMO_ACCOUNT_PASSWORD?.trim();

  if (!password || password.length < 8) {
    throw new Error(
      "DEMO_ACCOUNT_PASSWORD is required and must contain at least 8 characters",
    );
  }

  return password;
};

const roles = ["Customer", "Admin", "Staff", "WarehouseStaff"] as const;

const accounts = [
  {
    userName: "demo_admin",
    fullName: "WebApple Demo Admin",
    email: `admin${DEMO_EMAIL_DOMAIN}`,
    phone: "0900000001",
    role: "Admin",
  },
  {
    userName: "demo_staff",
    fullName: "WebApple Demo Staff",
    email: `staff${DEMO_EMAIL_DOMAIN}`,
    phone: "0900000002",
    role: "Staff",
  },
  {
    userName: "demo_warehouse",
    fullName: "WebApple Demo Warehouse",
    email: `warehouse${DEMO_EMAIL_DOMAIN}`,
    phone: "0900000003",
    role: "WarehouseStaff",
  },
  {
    userName: "demo_customer_1",
    fullName: "WebApple Demo Customer One",
    email: `customer1${DEMO_EMAIL_DOMAIN}`,
    phone: "0900000011",
    role: "Customer",
  },
  {
    userName: "demo_customer_2",
    fullName: "WebApple Demo Customer Two",
    email: `customer2${DEMO_EMAIL_DOMAIN}`,
    phone: "0900000012",
    role: "Customer",
  },
] as const;

const catalog = [
  {
    category: "iphone",
    name: "iPhone 15 Pro Demo",
    slug: "iphone-15-pro-demo",
    description: "Sản phẩm iPhone demo phục vụ bàn giao WebApple.",
    image: "/products/iphone/iphone-15-pro-max_5.webp",
    variants: [
      ["WA-IP15P-128-BLK", "iPhone 15 Pro 128GB Đen", "Đen", "128GB", 25_990_000, 3],
      ["WA-IP15P-256-BLU", "iPhone 15 Pro 256GB Xanh", "Xanh", "256GB", 28_990_000, 0],
    ],
  },
  {
    category: "iphone",
    name: "iPhone 15 Plus Demo",
    slug: "iphone-15-plus-demo",
    description: "iPhone màn hình lớn dùng cho catalog demo.",
    image: "/products/iphone/iphone-15-plus.png",
    variants: [
      ["WA-IP15PLUS-128-PNK", "iPhone 15 Plus 128GB Hồng", "Hồng", "128GB", 21_990_000, 8],
      ["WA-IP15PLUS-256-BLK", "iPhone 15 Plus 256GB Đen", "Đen", "256GB", 24_490_000, 4],
    ],
  },
  {
    category: "iphone",
    name: "iPhone 14 Pro Max Demo",
    slug: "iphone-14-pro-max-demo",
    description: "Mẫu iPhone thế hệ trước cho dữ liệu demo.",
    image: "/products/iphone/iphone-14-pro-max.png",
    variants: [
      ["WA-IP14PM-128-GOLD", "iPhone 14 Pro Max 128GB Vàng", "Vàng", "128GB", 22_990_000, 3],
      ["WA-IP14PM-256-PUR", "iPhone 14 Pro Max 256GB Tím", "Tím", "256GB", 25_490_000, 2],
    ],
  },
  {
    category: "ipad",
    name: "iPad Pro M4 Demo",
    slug: "ipad-pro-m4-demo",
    description: "iPad Pro M4 dữ liệu demo.",
    image: "/products/iphone/iphone-15-plus.png",
    variants: [
      ["WA-IPADPRO-256-SLV", "iPad Pro M4 256GB Bạc", "Bạc", "256GB", 28_990_000, 5],
      ["WA-IPADPRO-512-BLK", "iPad Pro M4 512GB Đen", "Đen", "512GB", 34_990_000, 2],
    ],
  },
  {
    category: "ipad",
    name: "iPad Air M2 Demo",
    slug: "ipad-air-m2-demo",
    description: "iPad Air M2 dữ liệu demo.",
    image: "/products/iphone/iphone-15-plus.png",
    variants: [
      ["WA-IPADAIR-128-BLU", "iPad Air M2 128GB Xanh", "Xanh", "128GB", 16_490_000, 7],
      ["WA-IPADAIR-256-PUR", "iPad Air M2 256GB Tím", "Tím", "256GB", 19_490_000, 3],
    ],
  },
  {
    category: "mac",
    name: "MacBook Air M3 Demo",
    slug: "macbook-air-m3-demo",
    description: "MacBook Air M3 dữ liệu demo.",
    image: "/products/iphone/iphone-14-pro-max.png",
    variants: [
      ["WA-MBA-M3-256", "MacBook Air M3 8/256GB", "Xám", "256GB", 27_990_000, 4],
      ["WA-MBA-M3-512", "MacBook Air M3 16/512GB", "Bạc", "512GB", 34_990_000, 2],
    ],
  },
  {
    category: "mac",
    name: "MacBook Pro M3 Demo",
    slug: "macbook-pro-m3-demo",
    description: "MacBook Pro M3 dữ liệu demo.",
    image: "/products/iphone/iphone-14-pro-max.png",
    variants: [
      ["WA-MBP-M3-512", "MacBook Pro M3 16/512GB", "Đen", "512GB", 42_990_000, 2],
      ["WA-MBP-M3-1TB", "MacBook Pro M3 18GB/1TB", "Bạc", "1TB", 51_990_000, 0],
    ],
  },
  {
    category: "mac",
    name: "iMac M3 Demo",
    slug: "imac-m3-demo",
    description: "iMac M3 dữ liệu demo.",
    image: "/products/iphone/iphone-15-pro-max_5.webp",
    variants: [
      ["WA-IMAC-M3-256-BLU", "iMac M3 8/256GB Xanh", "Xanh", "256GB", 32_990_000, 3],
      ["WA-IMAC-M3-512-GRN", "iMac M3 16/512GB Xanh lá", "Xanh lá", "512GB", 39_990_000, 1],
    ],
  },
] as const;

async function upsertStaticData(passwordHash: string) {
  const roleRows = new Map<string, number>();

  for (const roleName of roles) {
    const role = await prisma.roles.upsert({
      where: { role_name: roleName },
      update: {},
      create: { role_name: roleName },
    });
    roleRows.set(roleName, role.role_id);
  }

  const userRows = new Map<string, number>();

  for (const account of accounts) {
    const user = await prisma.users.upsert({
      where: { user_name: account.userName },
      update: {
        role_id: roleRows.get(account.role)!,
        email: account.email,
        phone: account.phone,
        full_name: account.fullName,
        pass_hash: passwordHash,
        status: 1,
      },
      create: {
        role_id: roleRows.get(account.role)!,
        email: account.email,
        phone: account.phone,
        user_name: account.userName,
        full_name: account.fullName,
        pass_hash: passwordHash,
        status: 1,
      },
    });
    userRows.set(account.userName, user.user_id);
  }

  for (const [userName, citizenId, branch] of [
    ["demo_staff", "DEMO-STAFF-001", "Demo Store"],
    ["demo_warehouse", "DEMO-WAREHOUSE-001", "Demo Warehouse"],
  ] as const) {
    await prisma.staff_profiles.upsert({
      where: { user_id: userRows.get(userName)! },
      update: {
        citizen_id: citizenId,
        hire_date: new Date("2026-01-01T00:00:00.000Z"),
        base_salary: 0,
        branch,
      },
      create: {
        user_id: userRows.get(userName)!,
        citizen_id: citizenId,
        hire_date: new Date("2026-01-01T00:00:00.000Z"),
        base_salary: 0,
        branch,
      },
    });
  }

  const categoryDefinitions = [
    ["iPhone", "iphone", 1],
    ["iPad", "ipad", 2],
    ["Mac", "mac", 3],
  ] as const;
  const categoryRows = new Map<string, number>();

  for (const [name, slug, order] of categoryDefinitions) {
    const category = await prisma.categories.upsert({
      where: { slug },
      update: {
        category_name: name,
        description: `${name} demo catalog`,
        display_order: order,
        is_active: true,
      },
      create: {
        category_name: name,
        slug,
        description: `${name} demo catalog`,
        display_order: order,
        is_active: true,
      },
    });
    categoryRows.set(slug, category.category_id);
  }

  const productRows = new Map<string, number>();
  const variantRows = new Map<string, number>();

  for (const item of catalog) {
    const product = await prisma.products.upsert({
      where: { slug: item.slug },
      update: {
        category_id: categoryRows.get(item.category)!,
        name: item.name,
        description: item.description,
        is_active: true,
      },
      create: {
        category_id: categoryRows.get(item.category)!,
        name: item.name,
        slug: item.slug,
        description: item.description,
        is_active: true,
      },
    });
    productRows.set(item.slug, product.product_id);

    for (const [sku, name, color, capacity, price, stock] of item.variants) {
      const variant = await prisma.product_variants.upsert({
        where: { sku },
        update: {
          product_id: product.product_id,
          variant_name: name,
          color,
          capacity,
          ram: item.category === "mac" ? "16GB" : "8GB",
          country: "VN/A",
          price,
          old_price: price + 2_000_000,
          stock_quantity: stock,
        },
        create: {
          product_id: product.product_id,
          variant_name: name,
          sku,
          color,
          capacity,
          ram: item.category === "mac" ? "16GB" : "8GB",
          country: "VN/A",
          price,
          old_price: price + 2_000_000,
          stock_quantity: stock,
        },
      });
      variantRows.set(sku, variant.variant_id);
    }

    await prisma.product_images.deleteMany({
      where: { product_id: product.product_id },
    });
    await prisma.product_images.create({
      data: {
        product_id: product.product_id,
        color: "Demo",
        image_url: item.image,
        alt_text: item.name,
        is_thumbnail: true,
        sort_order: 0,
        is_active: true,
      },
    });
  }

  return { userRows, productRows, variantRows };
}

async function clearMutableDemoData(userRows: Map<string, number>) {
  const demoUserIds = [...userRows.values()];
  const demoOrders = await prisma.orders.findMany({
    where: {
      OR: [
        { order_code: { startsWith: DEMO_ORDER_PREFIX } },
        { user_id: { in: demoUserIds } },
      ],
    },
    select: {
      order_id: true,
      order_details: { select: { order_detail_id: true } },
    },
  });
  const orderIds = demoOrders.map((order) => order.order_id);
  const orderDetailIds = demoOrders.flatMap((order) =>
    order.order_details.map((detail) => detail.order_detail_id),
  );
  const shipments = await prisma.shipments.findMany({
    where: { order_id: { in: orderIds } },
    select: { shipment_id: true },
  });

  await prisma.shipment_status_history.deleteMany({
    where: { shipment_id: { in: shipments.map((item) => item.shipment_id) } },
  });
  await prisma.shipments.deleteMany({ where: { order_id: { in: orderIds } } });
  await prisma.payment_transactions.deleteMany({
    where: { order_id: { in: orderIds } },
  });
  await prisma.voucher_usages.deleteMany({
    where: { order_id: { in: orderIds } },
  });
  await prisma.reviews.deleteMany({ where: { user_id: { in: demoUserIds } } });
  await prisma.product_items.updateMany({
    where: { order_detail_id: { in: orderDetailIds } },
    data: { order_detail_id: null },
  });
  await prisma.order_status_history.deleteMany({
    where: { order_id: { in: orderIds } },
  });
  await prisma.order_details.deleteMany({ where: { order_id: { in: orderIds } } });
  await prisma.orders.deleteMany({ where: { order_id: { in: orderIds } } });

  await prisma.cart_items.deleteMany({
    where: { carts: { user_id: { in: demoUserIds } } },
  });
  await prisma.carts.deleteMany({ where: { user_id: { in: demoUserIds } } });
  await prisma.favorite_products.deleteMany({
    where: { user_id: { in: demoUserIds } },
  });
  await prisma.user_addresses.deleteMany({
    where: { user_id: { in: demoUserIds } },
  });

  const warehouseId = userRows.get("demo_warehouse")!;
  const receiptRows = await prisma.inventory_receipts.findMany({
    where: { warehouse_staff_id: warehouseId },
    select: {
      receipt_id: true,
      inventory_receipt_details: {
        select: { receipt_detail_id: true },
      },
    },
  });
  const receiptIds = receiptRows.map((item) => item.receipt_id);
  const receiptDetailIds = receiptRows.flatMap((item) =>
    item.inventory_receipt_details.map((detail) => detail.receipt_detail_id),
  );
  await prisma.product_items.deleteMany({
    where: {
      OR: [
        { serial_number: { startsWith: DEMO_SERIAL_PREFIX } },
        { import_receipt_detail_id: { in: receiptDetailIds } },
      ],
    },
  });
  await prisma.inventory_receipt_details.deleteMany({
    where: { receipt_id: { in: receiptIds } },
  });
  await prisma.inventory_receipts.deleteMany({
    where: { receipt_id: { in: receiptIds } },
  });
}

async function createDemoCommerce(
  userRows: Map<string, number>,
  productRows: Map<string, number>,
  variantRows: Map<string, number>,
) {
  const customerOne = userRows.get("demo_customer_1")!;
  const customerTwo = userRows.get("demo_customer_2")!;
  const staff = userRows.get("demo_staff")!;
  const warehouse = userRows.get("demo_warehouse")!;

  const addressOne = await prisma.user_addresses.create({
    data: {
      user_id: customerOne,
      receiver_name: "Demo Customer One",
      receiver_phone: "0900000011",
      detailed_address: "01 Đường Demo",
      ward: "Phường Demo",
      city: "Thành phố Hồ Chí Minh",
      is_default: true,
    },
  });
  const addressTwo = await prisma.user_addresses.create({
    data: {
      user_id: customerTwo,
      receiver_name: "Demo Customer Two",
      receiver_phone: "0900000012",
      detailed_address: "02 Đường Demo",
      ward: "Phường Demo",
      city: "Hà Nội",
      is_default: true,
    },
  });

  const vouchers = [
    ["WELCOME10", "Percent", 10, 5_000_000],
    ["DEMO500K", "Fixed", 500_000, 10_000_000],
  ] as const;
  const voucherRows = new Map<string, number>();

  for (const [code, type, value, minimum] of vouchers) {
    const voucher = await prisma.vouchers.upsert({
      where: { code },
      update: {
        discount_type: type,
        discount_value: value,
        min_order_value: minimum,
        max_discount_amount: type === "Percent" ? 2_000_000 : null,
        usage_limit: 1000,
        used_count: 0,
        start_date: new Date("2026-01-01T00:00:00.000Z"),
        end_date: new Date("2030-12-31T23:59:59.000Z"),
        is_active: true,
      },
      create: {
        code,
        discount_type: type,
        discount_value: value,
        min_order_value: minimum,
        max_discount_amount: type === "Percent" ? 2_000_000 : null,
        usage_limit: 1000,
        used_count: 0,
        start_date: new Date("2026-01-01T00:00:00.000Z"),
        end_date: new Date("2030-12-31T23:59:59.000Z"),
        is_active: true,
      },
    });
    voucherRows.set(code, voucher.voucher_id);
  }

  const cart = await prisma.carts.create({ data: { user_id: customerOne } });
  await prisma.cart_items.create({
    data: {
      cart_id: cart.cart_id,
      variant_id: variantRows.get("WA-IPADAIR-128-BLU")!,
      quantity: 1,
      selected: true,
    },
  });

  await prisma.favorite_products.create({
    data: {
      user_id: customerOne,
      product_id: productRows.get("iphone-15-pro-demo")!,
    },
  });

  const statuses = [
    ["DEMO-COD-PENDING", "PendingConfirmation", customerOne, addressOne, "WA-IP15PLUS-128-PNK"],
    ["DEMO-COD-CONFIRMED", "Confirmed", customerOne, addressOne, "WA-IP14PM-128-GOLD"],
    ["DEMO-COD-PROCESSING", "Processing", customerTwo, addressTwo, "WA-IPADPRO-256-SLV"],
    ["DEMO-COD-SHIPPING", "Shipping", customerTwo, addressTwo, "WA-MBA-M3-256"],
    ["DEMO-COD-COMPLETED", "Completed", customerTwo, addressTwo, "WA-IP15P-128-BLK"],
  ] as const;

  let completedDetailId = 0;

  for (const [code, status, userId, address, sku] of statuses) {
    const variantId = variantRows.get(sku)!;
    const variant = await prisma.product_variants.findUniqueOrThrow({
      where: { variant_id: variantId },
    });
    const amount = Number(variant.price);
    const order = await prisma.orders.create({
      data: {
        user_id: userId,
        order_code: code,
        sub_total: amount,
        shipping_fee: 0,
        discount_amount: 0,
        total_amount: amount,
        order_status: status,
        customer_name: address.receiver_name,
        customer_phone: address.receiver_phone,
        shipping_address: `${address.detailed_address}, ${address.ward}, ${address.city}`,
        address_id: address.address_id,
        updated_at: new Date(),
      },
    });
    const detail = await prisma.order_details.create({
      data: {
        order_id: order.order_id,
        variant_id: variantId,
        quantity: 1,
        unit_price: variant.price,
      },
    });
    if (status === "Completed") completedDetailId = detail.order_detail_id;

    await prisma.payment_transactions.create({
      data: {
        order_id: order.order_id,
        gateway: "COD",
        amount,
        payment_type: "Payment",
        status: status === "Completed" ? "Success" : "Pending",
        paid_at: status === "Completed" ? new Date() : null,
        updated_at: new Date(),
      },
    });
    await prisma.order_status_history.create({
      data: {
        order_id: order.order_id,
        old_status: null,
        new_status: status,
        changed_by: status === "PendingConfirmation" ? userId : staff,
        note: "Official deterministic demo seed",
      },
    });

    if (status !== "PendingConfirmation") {
      const shipmentStatus =
        status === "Confirmed"
          ? "Pending"
          : status === "Processing"
            ? "Preparing"
            : status === "Shipping"
              ? "InTransit"
              : "Delivered";
      const shipment = await prisma.shipments.create({
        data: {
          order_id: order.order_id,
          shipping_provider: "WebApple Demo Shipping",
          tracking_code: `TRACK-${code}`,
          status: shipmentStatus,
        },
      });
      await prisma.shipment_status_history.create({
        data: {
          shipment_id: shipment.shipment_id,
          status: shipmentStatus,
          location: "Demo Hub",
          note: "Official deterministic demo seed",
        },
      });
    }
  }

  await prisma.reviews.create({
    data: {
      user_id: customerTwo,
      product_id: productRows.get("iphone-15-pro-demo")!,
      order_detail_id: completedDetailId,
      rating: 5,
      comment: "Đánh giá demo, không phải dữ liệu người dùng thật.",
      is_active: true,
    },
  });

  let supplier = await prisma.suppliers.findFirst({
    where: { supplier_name: "WebApple Demo Supplier" },
  });
  supplier = supplier
    ? await prisma.suppliers.update({
        where: { supplier_id: supplier.supplier_id },
        data: { status: "Active" },
      })
    : await prisma.suppliers.create({
        data: {
          supplier_name: "WebApple Demo Supplier",
          phone: "0900000099",
          email: `supplier${DEMO_EMAIL_DOMAIN}`,
          address: "Demo Supply Hub",
          status: "Active",
        },
      });

  const secondarySupplierName = "WebApple Demo Accessories Supplier";
  const secondarySupplier = await prisma.suppliers.findFirst({
    where: { supplier_name: secondarySupplierName },
  });
  if (secondarySupplier) {
    await prisma.suppliers.update({
      where: { supplier_id: secondarySupplier.supplier_id },
      data: { status: "Active" },
    });
  } else {
    await prisma.suppliers.create({
      data: {
        supplier_name: secondarySupplierName,
        phone: "0900000098",
        email: `accessories.supplier${DEMO_EMAIL_DOMAIN}`,
        address: "Demo Accessories Hub",
        status: "Active",
      },
    });
  }

  const receipt = await prisma.inventory_receipts.create({
    data: {
      warehouse_staff_id: warehouse,
      supplier_id: supplier.supplier_id,
      supplier_name: supplier.supplier_name,
      total_amount: 60_000_000,
    },
  });
  const receiptDetail = await prisma.inventory_receipt_details.create({
    data: {
      receipt_id: receipt.receipt_id,
      variant_id: variantRows.get("WA-IP15P-128-BLK")!,
      quantity: 3,
      cost_price: 20_000_000,
    },
  });
  await prisma.product_items.createMany({
    data: [1, 2, 3].map((index) => ({
      variant_id: variantRows.get("WA-IP15P-128-BLK")!,
      serial_number: `${DEMO_SERIAL_PREFIX}IP15P-${String(index).padStart(4, "0")}`,
      status: 1,
      import_receipt_detail_id: receiptDetail.receipt_detail_id,
    })),
  });

  return {
    categories: 3,
    products: catalog.length,
    variants: catalog.reduce((sum, item) => sum + item.variants.length, 0),
    accounts: accounts.length,
    orders: statuses.length,
    vouchers: vouchers.length,
    suppliers: 2,
    serials: 3,
  };
}

async function main() {
  const passwordHash = await bcrypt.hash(requiredDemoPassword(), 12);
  const staticRows = await upsertStaticData(passwordHash);
  await clearMutableDemoData(staticRows.userRows);
  const summary = await createDemoCommerce(
    staticRows.userRows,
    staticRows.productRows,
    staticRows.variantRows,
  );

  console.log(`[demo-seed] complete ${JSON.stringify(summary)}`);
  console.log(
    `[demo-seed] accounts=${accounts.map((account) => account.userName).join(",")}`,
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
