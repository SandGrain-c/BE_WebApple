import { execFileSync } from "node:child_process";
import path from "node:path";
import dotenv from "dotenv";
import { assertSafeE2EDatabase } from "./e2e-database-safety";

async function main() {
  dotenv.config({ quiet: true });

  const developmentDatabaseUrl = process.env.DATABASE_URL;
  const safeDatabase = assertSafeE2EDatabase({
    e2eDatabaseUrl: process.env.E2E_DATABASE_URL,
    developmentDatabaseUrl,
  });

  process.env.DATABASE_URL = safeDatabase.databaseUrl;

  const prismaExecutable = path.resolve(
    process.cwd(),
    "node_modules",
    ".bin",
    "prisma",
  );

  execFileSync(prismaExecutable, ["migrate", "deploy"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: safeDatabase.databaseUrl,
    },
    stdio: "inherit",
  });

  const [{ default: prisma }, { E2E_FIXTURE, seedE2EFixtures }] =
    await Promise.all([
      import("../../src/utils/prisma"),
      import("./e2e-seed"),
    ]);

  try {
    const tables = await prisma.$queryRawUnsafe<Array<{ tablename: string }>>(
      `SELECT tablename
       FROM pg_tables
       WHERE schemaname = 'public'
         AND tablename <> '_prisma_migrations'
       ORDER BY tablename`,
    );

    if (tables.length === 0) {
      throw new Error("[e2e-db] no application tables found after migrations");
    }

    const qualifiedTables = tables
      .map(({ tablename }) => `"public"."${tablename.replaceAll('"', '""')}"`)
      .join(", ");

    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE ${qualifiedTables} RESTART IDENTITY CASCADE`,
    );

    const manifest = await seedE2EFixtures(prisma);

    console.log(
      `[e2e-db] reset complete; database=${safeDatabase.databaseName}`,
    );
    console.log(
      `[e2e-db] accounts=${JSON.stringify({
        customer: E2E_FIXTURE.customer.email,
        admin: E2E_FIXTURE.admin.email,
        staff: E2E_FIXTURE.staff.email,
      })}`,
    );
    console.log(`[e2e-db] fixture=${JSON.stringify(manifest)}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
