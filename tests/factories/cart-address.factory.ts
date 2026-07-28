import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../../src/generated/prisma/client";
import type { AccountFixture } from "../fixtures/fixture-manifest";

let namespaceCounter = 0;

function nextNamespace(label: string) {
  namespaceCounter += 1;
  const safeLabel = label.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
  const suffix = randomUUID().replace(/-/g, "").slice(0, 8);
  return `${safeLabel}${namespaceCounter}${suffix}`;
}

function nextPhone(prefix: "07" | "08") {
  const randomHex = randomUUID().replace(/-/g, "").slice(0, 13);
  const digits = (BigInt(`0x${randomHex}`) % 10_000_000_000_000n)
    .toString()
    .padStart(13, "0");

  return `${prefix}${digits}`;
}

export async function createIsolatedCustomer(
  prisma: PrismaClient,
  label: string,
) {
  const role = await prisma.roles.findUnique({
    where: { role_name: "Customer" },
  });

  if (!role) {
    throw new Error("Customer role fixture is required");
  }

  const namespace = nextNamespace(label);
  const userName = `ca_${namespace}`.slice(0, 25);
  const user = await prisma.users.create({
    data: {
      role_id: role.role_id,
      user_name: userName,
      email: `${namespace}@test.invalid`,
      phone: nextPhone("08"),
      full_name: `Cart Address Test ${label}`,
      pass_hash: "test-only-unused-hash",
      status: 1,
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

  return { user, account, namespace };
}

export async function createAddressFixture(
  prisma: PrismaClient,
  input: {
    userId: number;
    label: string;
    isDefault: boolean;
  },
) {
  const namespace = nextNamespace(input.label);

  return prisma.user_addresses.create({
    data: {
      user_id: input.userId,
      receiver_name: `Receiver ${namespace}`,
      receiver_phone: nextPhone("07"),
      detailed_address: `${namespace} Test Street`,
      ward: `Ward ${namespace.slice(0, 8)}`,
      city: "Test City",
      is_default: input.isDefault,
    },
  });
}

export async function createCartItemFixture(
  prisma: PrismaClient,
  input: {
    userId: number;
    variantId: number;
    quantity: number;
    selected: boolean;
  },
) {
  const cart = await prisma.carts.upsert({
    where: { user_id: input.userId },
    update: {},
    create: { user_id: input.userId },
  });
  const item = await prisma.cart_items.create({
    data: {
      cart_id: cart.cart_id,
      variant_id: input.variantId,
      quantity: input.quantity,
      selected: input.selected,
    },
  });

  return { cart, item };
}
