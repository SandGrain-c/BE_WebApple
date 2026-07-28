import bcrypt from "bcrypt";
import type { PrismaClient } from "../../src/generated/prisma/client";
import { createActiveCatalogFixture } from "../factories/catalog.factory";
import {
  createStaffProfileFixture,
  createUserFixture,
  ensureRole,
  type FixtureRoleName,
} from "../factories/user.factory";
import { AUTH_TEST_PASSWORD } from "../factories/auth.factory";
import { createOwnershipFixtures } from "../factories/ownership.factory";
import {
  FIXTURE_VERSION,
  type AccountFixture,
  type FixtureManifest,
} from "./fixture-manifest";

function toAccount(
  user: {
    user_id: number;
    status: number;
    user_name: string;
    email: string | null;
    phone: string | null;
  },
  roleName: FixtureRoleName,
): AccountFixture {
  if (!user.email || !user.phone) {
    throw new Error(`Auth fixture ${user.user_name} requires email and phone`);
  }

  return {
    userId: user.user_id,
    roleName,
    status: user.status,
    userName: user.user_name,
    email: user.email,
    phone: user.phone,
  };
}

export async function seedMinimalFixtures(
  prisma: PrismaClient,
): Promise<FixtureManifest> {
  const roleNames: FixtureRoleName[] = [
    "Customer",
    "Admin",
    "Staff",
    "WarehouseStaff",
    "UnknownTestRole",
  ];
  const roleRows = await Promise.all(
    roleNames.map((roleName) => ensureRole(prisma, roleName)),
  );
  const roleByName = new Map(
    roleRows.map((role) => [role.role_name, role.role_id]),
  );
  const roleId = (roleName: FixtureRoleName) => {
    const id = roleByName.get(roleName);

    if (!id) {
      throw new Error(`Fixture role lookup failed for ${roleName}`);
    }

    return id;
  };

  const passHash = await bcrypt.hash(AUTH_TEST_PASSWORD, 6);

  const customerActive = await createUserFixture(prisma, {
    roleId: roleId("Customer"),
    userName: "tst_customer",
    email: "customer@test.invalid",
    phone: "0900000001",
    fullName: "Test Customer Active",
    passHash,
    status: 1,
  });
  const customerLocked = await createUserFixture(prisma, {
    roleId: roleId("Customer"),
    userName: "tst_locked",
    email: "locked@test.invalid",
    phone: "0900000002",
    fullName: "Test Customer Locked",
    passHash,
    status: 0,
  });
  const customerB = await createUserFixture(prisma, {
    roleId: roleId("Customer"),
    userName: "tst_customer_b",
    email: "customer-b@test.invalid",
    phone: "0900000006",
    fullName: "Test Customer B",
    passHash,
    status: 1,
  });
  const adminActive = await createUserFixture(prisma, {
    roleId: roleId("Admin"),
    userName: "tst_admin",
    email: "admin@test.invalid",
    phone: "0900000003",
    fullName: "Test Admin Active",
    passHash,
    status: 1,
  });
  const adminLocked = await createUserFixture(prisma, {
    roleId: roleId("Admin"),
    userName: "tst_admin_locked",
    email: "admin-locked@test.invalid",
    phone: "0900000007",
    fullName: "Test Admin Locked",
    passHash,
    status: 0,
  });
  const staffActive = await createUserFixture(prisma, {
    roleId: roleId("Staff"),
    userName: "tst_staff",
    email: "staff@test.invalid",
    phone: "0900000004",
    fullName: "Test Staff Active",
    passHash,
    status: 1,
  });
  const warehouseActive = await createUserFixture(prisma, {
    roleId: roleId("WarehouseStaff"),
    userName: "tst_warehouse",
    email: "warehouse@test.invalid",
    phone: "0900000005",
    fullName: "Test Warehouse Active",
    passHash,
    status: 1,
  });
  const unknownRoleActive = await createUserFixture(prisma, {
    roleId: roleId("UnknownTestRole"),
    userName: "tst_unknown_role",
    email: "unknown-role@test.invalid",
    phone: "0900000008",
    fullName: "Test Unknown Role",
    passHash,
    status: 1,
  });

  await createStaffProfileFixture(prisma, {
    userId: staffActive.user_id,
    citizenId: "TSTSTAFF0001",
    branch: "Test Branch",
  });
  await createStaffProfileFixture(prisma, {
    userId: warehouseActive.user_id,
    citizenId: "TSTWARE00001",
    branch: "Test Warehouse",
  });

  const { category, product, variant } =
    await createActiveCatalogFixture(prisma);
  const ownership = await createOwnershipFixtures(prisma, {
    customerAId: customerActive.user_id,
    customerBId: customerB.user_id,
    productId: product.product_id,
    variantId: variant.variant_id,
  });

  return {
    fixtureVersion: FIXTURE_VERSION,
    accounts: {
      customer_active: toAccount(customerActive, "Customer"),
      customer_locked: toAccount(customerLocked, "Customer"),
      customer_b: toAccount(customerB, "Customer"),
      admin_active: toAccount(adminActive, "Admin"),
      admin_locked: toAccount(adminLocked, "Admin"),
      staff_active: toAccount(staffActive, "Staff"),
      warehouse_active: toAccount(warehouseActive, "WarehouseStaff"),
      unknown_role_active: toAccount(
        unknownRoleActive,
        "UnknownTestRole",
      ),
    },
    catalog: {
      category_active: {
        categoryId: category.category_id,
        slug: category.slug,
      },
      product_active: {
        productId: product.product_id,
        slug: product.slug,
      },
      variant_stock_10: {
        variantId: variant.variant_id,
        sku: variant.sku,
        stockQuantity: variant.stock_quantity,
      },
    },
    ownership: {
      address_a: {
        addressId: ownership.addressA.address_id,
      },
      address_b: {
        addressId: ownership.addressB.address_id,
        receiverName: ownership.addressB.receiver_name,
        receiverPhone: ownership.addressB.receiver_phone,
        detailedAddress: ownership.addressB.detailed_address,
        isDefault: ownership.addressB.is_default,
      },
      cart_item_a: {
        cartItemId: ownership.cartItemA.cart_item_id,
      },
      cart_item_b: {
        cartItemId: ownership.cartItemB.cart_item_id,
        quantity: ownership.cartItemB.quantity,
        selected: ownership.cartItemB.selected,
      },
      order_a: {
        orderId: ownership.orderA.order_id,
      },
      order_b: {
        orderId: ownership.orderB.order_id,
        status: ownership.orderB.order_status,
        orderCode: ownership.orderB.order_code,
      },
      payment_b: {
        transactionId: ownership.paymentB.transaction_id,
        status: ownership.paymentB.status,
        transactionRef: ownership.paymentB.transaction_ref!,
      },
      shipment_b: {
        shipmentId: ownership.shipmentB.shipment_id,
        status: ownership.shipmentB.status,
        trackingCode: ownership.shipmentB.tracking_code!,
      },
      review_b: {
        reviewId: ownership.reviewB.review_id,
        rating: ownership.reviewB.rating,
        comment: ownership.reviewB.comment!,
        isActive: ownership.reviewB.is_active,
      },
      favorite_b: {
        favoriteId: ownership.favoriteB.favorite_id,
        productId: ownership.favoriteB.product_id,
      },
      voucher_b: {
        voucherId: ownership.voucherB.voucher_id,
        usedCount: ownership.voucherB.used_count,
      },
      order_history_b: {
        historyId: ownership.orderHistoryB.history_id,
      },
    },
    adminDomain: {
      banner: {
        bannerId: ownership.banner.banner_id,
      },
      productImage: {
        imageId: ownership.productImage.image_id,
      },
      supplier: {
        supplierId: ownership.supplier.supplier_id,
      },
      productItem: {
        itemId: ownership.productItem.item_id,
      },
    },
  };
}
