import { describe, expect, test } from "vitest";
import { assertSafeTestDatabase } from "./database-safety";

describe("Test database safety guard", () => {
  test("DB-SAFE-001 rejects non-test NODE_ENV", () => {
    expect(() =>
      assertSafeTestDatabase({
        nodeEnv: "development",
        testDatabaseUrl: "postgresql://runner:secret@localhost/app_test",
        source: "external",
      }),
    ).toThrow('NODE_ENV must equal "test"');
  });

  test("DB-SAFE-002 rejects external database without _test in its name", () => {
    expect(() =>
      assertSafeTestDatabase({
        nodeEnv: "test",
        testDatabaseUrl: "postgresql://runner:secret@localhost/application",
        source: "external",
      }),
    ).toThrow('must contain "_test"');
  });

  test("DB-SAFE-003 rejects devdb", () => {
    expect(() =>
      assertSafeTestDatabase({
        nodeEnv: "test",
        testDatabaseUrl: "postgresql://runner:secret@localhost/devdb",
        source: "external",
      }),
    ).toThrow('forbidden database "devdb"');
  });

  test("DB-SAFE-004 rejects the development database identity", () => {
    expect(() =>
      assertSafeTestDatabase({
        nodeEnv: "test",
        testDatabaseUrl:
          "postgresql://test_user:test_password@localhost:5432/application_test",
        developmentDatabaseUrl:
          "postgresql://dev_user:dev_password@localhost:5432/application_test",
        source: "external",
      }),
    ).toThrow("must not match development DATABASE_URL");
  });

  test("DB-SAFE-005 accepts a run-owned Testcontainers database", () => {
    expect(
      assertSafeTestDatabase({
        nodeEnv: "test",
        testDatabaseUrl:
          "postgresql://runner:secret@localhost:54321/generated_database",
        developmentDatabaseUrl:
          "postgresql://developer:secret@localhost:5432/devdb",
        source: "testcontainer",
        containerId: "run-owned-container",
      }),
    ).toMatchObject({
      kind: "testcontainer",
      databaseName: "generated_database",
      containerId: "run-owned-container",
    });
  });
});
