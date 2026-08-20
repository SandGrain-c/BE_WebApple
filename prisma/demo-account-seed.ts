import bcrypt from "bcrypt";
import type { PrismaClient } from "../src/generated/prisma/client";
import prisma from "../src/utils/prisma";

const DEMO_EMAIL_DOMAIN = "@webapple.demo";

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

export const demoAccounts = [
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

export async function seedDemoAccounts(client: PrismaClient = prisma) {
  const passwordHash = await bcrypt.hash(requiredDemoPassword(), 12);
  const roleRows = new Map<string, number>();

  for (const roleName of roles) {
    const role = await client.roles.upsert({
      where: { role_name: roleName },
      update: {},
      create: { role_name: roleName },
    });
    roleRows.set(roleName, role.role_id);
  }

  const userRows = new Map<string, number>();

  for (const account of demoAccounts) {
    const user = await client.users.upsert({
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
    await client.staff_profiles.upsert({
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

  return { accounts: demoAccounts.length, userRows };
}

async function run() {
  const summary = await seedDemoAccounts();
  console.log(`[demo-account-seed] complete accounts=${summary.accounts}`);
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
