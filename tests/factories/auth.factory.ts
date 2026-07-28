import { randomInt, randomUUID } from "node:crypto";
import bcrypt from "bcrypt";
import type { PrismaClient } from "../../src/generated/prisma/client";
import {
  createUserFixture,
  ensureRole,
  type FixtureRoleName,
} from "./user.factory";

export const AUTH_TEST_PASSWORD = "AuthTestOnly!2026";

let namespaceCounter = 0;

function nextNamespace(label: string) {
  namespaceCounter += 1;
  const safeLabel = label.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
  const randomSuffix = randomUUID().replace(/-/g, "").slice(0, 6);
  return `${safeLabel}${namespaceCounter}${randomSuffix}`;
}

function nextPhone() {
  return `09${randomInt(0, 10 ** 11).toString().padStart(11, "0")}`.slice(
    0,
    15,
  );
}

export function createRegistrationPayload(label: string) {
  const namespace = nextNamespace(label);

  return {
    userName: `t_${namespace}`.slice(0, 25),
    fullName: `Auth Test ${label}`,
    email: `${namespace}@test.invalid`,
    phone: nextPhone(),
    password: AUTH_TEST_PASSWORD,
  };
}

export async function createAuthAccount(
  prisma: PrismaClient,
  input: {
    label: string;
    roleName: FixtureRoleName;
    status: number;
  },
) {
  const role = await ensureRole(prisma, input.roleName);
  const registration = createRegistrationPayload(input.label);
  const passHash = await bcrypt.hash(AUTH_TEST_PASSWORD, 6);
  const user = await createUserFixture(prisma, {
    roleId: role.role_id,
    userName: registration.userName,
    email: registration.email,
    phone: registration.phone,
    fullName: registration.fullName,
    passHash,
    status: input.status,
  });

  return {
    user,
    credentials: {
      identifier: user.user_name,
      password: AUTH_TEST_PASSWORD,
    },
  };
}

export async function restoreAuthAccount(
  prisma: PrismaClient,
  input: {
    userId: number;
    roleName: FixtureRoleName;
    status: number;
  },
) {
  const role = await ensureRole(prisma, input.roleName);
  const passHash = await bcrypt.hash(AUTH_TEST_PASSWORD, 6);

  return prisma.users.update({
    where: { user_id: input.userId },
    data: {
      role_id: role.role_id,
      status: input.status,
      pass_hash: passHash,
    },
  });
}
