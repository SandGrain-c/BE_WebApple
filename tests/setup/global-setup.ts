import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import dotenv from "dotenv";
import type { TestProject } from "vitest/node";
import { assertSafeTestDatabase } from "./database-safety";

const POSTGRES_IMAGE = "postgres:16-alpine";

function redact(value: string, secrets: string[]) {
  return secrets.reduce(
    (output, secret) =>
      secret ? output.split(secret).join("[REDACTED]") : output,
    value,
  );
}

function runMigrations(databaseUrl: string) {
  const prismaExecutable = path.resolve(
    process.cwd(),
    "node_modules",
    ".bin",
    "prisma",
  );

  try {
    execFileSync(prismaExecutable, ["migrate", "deploy"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: "test",
        DATABASE_URL: databaseUrl,
      },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const failure = error as {
      stdout?: string | Buffer;
      stderr?: string | Buffer;
      message?: string;
    };
    const raw = [
      failure.message,
      failure.stdout?.toString(),
      failure.stderr?.toString(),
    ]
      .filter(Boolean)
      .join("\n");

    throw new Error(
      `prisma migrate deploy failed:\n${redact(raw, [databaseUrl])}`,
    );
  }
}

export default async function globalSetup(project: TestProject) {
  if (process.env.NODE_ENV !== "test") {
    throw new Error(
      '[test-db-safety] Refusing setup because NODE_ENV must equal "test"',
    );
  }

  dotenv.config({ quiet: true });
  const developmentDatabaseUrl = process.env.DATABASE_URL;
  const externalTestDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();
  let container: StartedPostgreSqlContainer | undefined;

  try {
    let databaseUrl: string;
    let databaseName: string;
    let source: "external" | "testcontainer";
    let containerId: string | undefined;

    if (externalTestDatabaseUrl) {
      const guarded = assertSafeTestDatabase({
        nodeEnv: process.env.NODE_ENV,
        testDatabaseUrl: externalTestDatabaseUrl,
        developmentDatabaseUrl,
        source: "external",
      });
      databaseUrl = guarded.databaseUrl;
      databaseName = guarded.databaseName;
      source = "external";
    } else {
      const generatedDatabaseName = `webapple_test_${randomBytes(4).toString("hex")}`;
      const generatedPassword = randomBytes(24).toString("base64url");

      container = await new PostgreSqlContainer(POSTGRES_IMAGE)
        .withDatabase(generatedDatabaseName)
        .withUsername("webapple_test_runner")
        .withPassword(generatedPassword)
        .withStartupTimeout(120_000)
        .start();

      containerId = container.getId();
      const guarded = assertSafeTestDatabase({
        nodeEnv: process.env.NODE_ENV,
        testDatabaseUrl: container.getConnectionUri(),
        developmentDatabaseUrl,
        source: "testcontainer",
        containerId,
      });
      databaseUrl = guarded.databaseUrl;
      databaseName = guarded.databaseName;
      source = "testcontainer";
    }

    if (developmentDatabaseUrl) {
      process.env.DEVELOPMENT_DATABASE_URL = developmentDatabaseUrl;
    } else {
      delete process.env.DEVELOPMENT_DATABASE_URL;
    }
    process.env.DATABASE_URL = databaseUrl;
    process.env.TEST_DATABASE_SOURCE = source;
    if (containerId) {
      process.env.TESTCONTAINERS_CONTAINER_ID = containerId;
    } else {
      delete process.env.TESTCONTAINERS_CONTAINER_ID;
    }
    process.env.JWT_SECRET = randomBytes(48).toString("base64url");
    process.env.PAYOS_CLIENT_ID = "test-client-id";
    process.env.PAYOS_API_KEY = "test-api-key";
    process.env.PAYOS_CHECKSUM_KEY = "test-checksum-key";
    process.env.CLOUDINARY_CLOUD_NAME = "test-cloud";
    process.env.CLOUDINARY_API_KEY = "test-api-key";
    process.env.CLOUDINARY_API_SECRET = "test-api-secret";

    runMigrations(databaseUrl);

    const [{ default: prisma }, { seedMinimalFixtures }] = await Promise.all([
      import("../../src/utils/prisma"),
      import("../fixtures/seed-minimal"),
    ]);
    const manifest = await seedMinimalFixtures(prisma);
    const versionRows = await prisma.$queryRaw<Array<{ server_version: string }>>`
      SELECT current_setting('server_version') AS server_version
    `;
    const postgresVersion = versionRows[0]?.server_version ?? "unknown";

    await prisma.$disconnect();

    project.provide("fixtureManifest", manifest);
    project.provide("testDatabaseMetadata", {
      source,
      databaseName,
      containerId: containerId?.slice(0, 12) ?? null,
      postgresVersion,
    });

    console.log(
      `[test-foundation] PostgreSQL ${postgresVersion}; source=${source}; database=${databaseName}; container=${containerId?.slice(0, 12) ?? "external"}`,
    );
    console.log(
      `[test-foundation] prisma migrate deploy completed; fixture=${manifest.fixtureVersion}`,
    );
    console.log(
      `[test-foundation] fixture manifest=${JSON.stringify({
        customer_active: manifest.accounts.customer_active.userId,
        customer_locked: manifest.accounts.customer_locked.userId,
        customer_b: manifest.accounts.customer_b.userId,
        admin_active: manifest.accounts.admin_active.userId,
        admin_locked: manifest.accounts.admin_locked.userId,
        staff_active: manifest.accounts.staff_active.userId,
        warehouse_active: manifest.accounts.warehouse_active.userId,
        unknown_role_active: manifest.accounts.unknown_role_active.userId,
        category_active: manifest.catalog.category_active.categoryId,
        product_active: manifest.catalog.product_active.productId,
        variant_stock_10: manifest.catalog.variant_stock_10.variantId,
        address_a: manifest.ownership.address_a.addressId,
        address_b: manifest.ownership.address_b.addressId,
        cart_item_a: manifest.ownership.cart_item_a.cartItemId,
        cart_item_b: manifest.ownership.cart_item_b.cartItemId,
        order_a: manifest.ownership.order_a.orderId,
        order_b: manifest.ownership.order_b.orderId,
        payment_b: manifest.ownership.payment_b.transactionId,
        shipment_b: manifest.ownership.shipment_b.shipmentId,
        review_b: manifest.ownership.review_b.reviewId,
        favorite_b: manifest.ownership.favorite_b.favoriteId,
      })}`,
    );

    return async () => {
      if (container) {
        await container.stop();
        console.log("[test-foundation] PostgreSQL test container destroyed");
      }
    };
  } catch (error) {
    if (container) {
      await container.stop();
    }

    throw error;
  }
}
