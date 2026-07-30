import type { PrismaClient } from "../../src/generated/prisma/client";
import type { AccountFixture } from "../fixtures/fixture-manifest";

let fixtureCounter = 0;

function nextNamespace(label: string) {
  fixtureCounter += 1;
  const safeLabel =
    label.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10) || "fixture";

  return `${safeLabel}${fixtureCounter}`;
}

function fixturePhone(seed: string) {
  let hash = 2_166_136_261;

  for (const character of seed) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }

  const suffix = (hash >>> 0).toString().padStart(8, "0").slice(-8);
  return `08${suffix}`;
}

export type CheckoutItemInput = {
  key: string;
  price: number;
  stockQuantity: number;
  quantity: number;
  selected: boolean;
  productActive?: boolean;
};

export async function createCheckoutScenario(
  prisma: PrismaClient,
  input: {
    label: string;
    items?: CheckoutItemInput[];
    createCart?: boolean;
    categoryActive?: boolean;
    customerStatus?: number;
  },
) {
  const namespace = nextNamespace(input.label);
  const role = await prisma.roles.findUnique({
    where: { role_name: "Customer" },
  });

  if (!role) {
    throw new Error("Customer role fixture is required");
  }

  const user = await prisma.users.create({
    data: {
      role_id: role.role_id,
      user_name: `cod_${namespace}`.slice(0, 25),
      email: `${namespace}@checkout.test.invalid`,
      phone: fixturePhone(`${namespace}-user`),
      full_name: `Checkout Test ${namespace}`,
      pass_hash: "test-only-unused-hash",
      status: input.customerStatus ?? 1,
    },
  });
  const account: AccountFixture = {
    userId: user.user_id,
    roleName: "Customer",
    status: user.status,
    userName: user.user_name,
    email: user.email!,
    phone: user.phone!,
  };
  const address = await prisma.user_addresses.create({
    data: {
      user_id: user.user_id,
      receiver_name: `Receiver ${namespace}`,
      receiver_phone: fixturePhone(`${namespace}-receiver`),
      detailed_address: `${namespace} Checkout Street`,
      ward: `Ward ${namespace}`,
      city: "Test City",
      is_default: true,
    },
  });
  const category = await prisma.categories.create({
    data: {
      category_name: `Checkout Category ${namespace}`,
      slug: `checkout-category-${namespace}`,
      description: "Checkout COD integration fixture",
      display_order: fixtureCounter,
      is_active: input.categoryActive ?? true,
    },
  });
  const itemFixtures = [];

  for (const [index, itemInput] of (input.items ?? []).entries()) {
    const itemNamespace = `${namespace}-${itemInput.key}-${index + 1}`;
    const product = await prisma.products.create({
      data: {
        category_id: category.category_id,
        name: `Checkout Product ${itemNamespace}`,
        slug: `checkout-product-${itemNamespace}`.slice(0, 300),
        description: "Checkout COD integration product",
        is_active: itemInput.productActive ?? true,
      },
    });
    const variant = await prisma.product_variants.create({
      data: {
        product_id: product.product_id,
        variant_name: `Checkout Variant ${itemNamespace}`,
        sku: `COD-${itemNamespace}`.toUpperCase().slice(0, 50),
        color: `Color ${itemInput.key}`,
        capacity: "128GB",
        ram: "8GB",
        country: "VN",
        price: itemInput.price,
        old_price: null,
        stock_quantity: itemInput.stockQuantity,
      },
    });

    itemFixtures.push({
      input: itemInput,
      product,
      variant,
      cartItem: null as Awaited<
        ReturnType<PrismaClient["cart_items"]["create"]>
      > | null,
    });
  }

  const shouldCreateCart = input.createCart ?? true;
  const cart = shouldCreateCart
    ? await prisma.carts.create({
        data: { user_id: user.user_id },
      })
    : null;

  if (cart) {
    for (const itemFixture of itemFixtures) {
      itemFixture.cartItem = await prisma.cart_items.create({
        data: {
          cart_id: cart.cart_id,
          variant_id: itemFixture.variant.variant_id,
          quantity: itemFixture.input.quantity,
          selected: itemFixture.input.selected,
        },
      });
    }
  }

  return {
    namespace,
    user,
    account,
    address,
    category,
    cart,
    items: itemFixtures,
  };
}

export async function createVoucherFixture(
  prisma: PrismaClient,
  input: {
    label: string;
    discountType?: string;
    discountValue?: number;
    minOrderValue?: number | null;
    maxDiscountAmount?: number | null;
    usageLimit?: number | null;
    usedCount?: number;
    startDate?: Date | null;
    endDate?: Date | null;
    isActive?: boolean;
  },
) {
  const namespace = nextNamespace(input.label);
  const code = `V${namespace}`.toUpperCase().slice(0, 20);

  return prisma.vouchers.create({
    data: {
      code,
      discount_type: input.discountType ?? "Percent",
      discount_value: input.discountValue ?? 10,
      min_order_value: input.minOrderValue ?? 0,
      max_discount_amount: input.maxDiscountAmount ?? null,
      usage_limit: input.usageLimit ?? 100,
      used_count: input.usedCount ?? 0,
      start_date:
        input.startDate === undefined
          ? new Date("2026-01-01T00:00:00.000Z")
          : input.startDate,
      end_date:
        input.endDate === undefined
          ? new Date("2027-01-01T00:00:00.000Z")
          : input.endDate,
      is_active: input.isActive ?? true,
    },
  });
}

export async function createVoucherUsageFixture(
  prisma: PrismaClient,
  input: {
    voucherId: number;
    userId: number;
    addressId?: number;
  },
) {
  const namespace = nextNamespace("voucherusage");
  const order = await prisma.orders.create({
    data: {
      user_id: input.userId,
      address_id: input.addressId,
      voucher_id: input.voucherId,
      order_code: `USED-${namespace}`.toUpperCase().slice(0, 50),
      sub_total: 1_000,
      shipping_fee: 0,
      discount_amount: 100,
      total_amount: 900,
      order_status: "Completed",
      customer_name: "Voucher Usage Fixture",
      customer_phone: "0800000000",
      shipping_address: "Voucher usage fixture address",
    },
  });
  const usage = await prisma.voucher_usages.create({
    data: {
      voucher_id: input.voucherId,
      user_id: input.userId,
      order_id: order.order_id,
    },
  });

  await prisma.vouchers.update({
    where: { voucher_id: input.voucherId },
    data: {
      used_count: {
        increment: 1,
      },
    },
  });

  return { order, usage };
}
