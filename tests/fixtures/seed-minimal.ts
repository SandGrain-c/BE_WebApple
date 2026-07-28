import bcrypt from "bcrypt";
import type { PrismaClient } from "../../src/generated/prisma/client";
import { createActiveCatalogFixture } from "../factories/catalog.factory";
import {
  createStaffProfileFixture,
  createUserFixture,
  ensureRole,
  type FixtureRoleName,
} from "../factories/user.factory";
import {
  FIXTURE_VERSION,
  type AccountFixture,
  type FixtureManifest,
} from "./fixture-manifest";

function toAccount(
  user: { user_id: number; status: number },
  roleName: FixtureRoleName,
): AccountFixture {
  return {
    userId: user.user_id,
    roleName,
    status: user.status,
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

  const passHash = await bcrypt.hash("FoundationOnly!2026", 6);

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
  const adminActive = await createUserFixture(prisma, {
    roleId: roleId("Admin"),
    userName: "tst_admin",
    email: "admin@test.invalid",
    phone: "0900000003",
    fullName: "Test Admin Active",
    passHash,
    status: 1,
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

  return {
    fixtureVersion: FIXTURE_VERSION,
    accounts: {
      customer_active: toAccount(customerActive, "Customer"),
      customer_locked: toAccount(customerLocked, "Customer"),
      admin_active: toAccount(adminActive, "Admin"),
      staff_active: toAccount(staffActive, "Staff"),
      warehouse_active: toAccount(warehouseActive, "WarehouseStaff"),
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
  };
}
