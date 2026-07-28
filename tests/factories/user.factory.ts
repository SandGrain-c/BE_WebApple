import type { PrismaClient } from "../../src/generated/prisma/client";

export type FixtureRoleName =
  | "Customer"
  | "Admin"
  | "Staff"
  | "WarehouseStaff"
  | "UnknownTestRole";

export async function ensureRole(
  prisma: PrismaClient,
  roleName: FixtureRoleName,
) {
  return prisma.roles.upsert({
    where: { role_name: roleName },
    update: {},
    create: { role_name: roleName },
  });
}

export async function createUserFixture(
  prisma: PrismaClient,
  input: {
    roleId: number;
    userName: string;
    email: string;
    phone: string;
    fullName: string;
    passHash: string;
    status: number;
  },
) {
  const data = {
    role_id: input.roleId,
    user_name: input.userName,
    email: input.email,
    phone: input.phone,
    full_name: input.fullName,
    pass_hash: input.passHash,
    status: input.status,
  };

  return prisma.users.upsert({
    where: { user_name: input.userName },
    update: data,
    create: data,
  });
}

export async function createStaffProfileFixture(
  prisma: PrismaClient,
  input: {
    userId: number;
    citizenId: string;
    branch: string;
  },
) {
  const data = {
    citizen_id: input.citizenId,
    hire_date: new Date("2026-01-01T00:00:00.000Z"),
    base_salary: 10_000_000,
    branch: input.branch,
  };

  return prisma.staff_profiles.upsert({
    where: { user_id: input.userId },
    update: data,
    create: {
      user_id: input.userId,
      ...data,
    },
  });
}
