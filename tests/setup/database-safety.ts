export type TestDatabaseSource =
  | {
      kind: "external";
      databaseUrl: string;
      databaseName: string;
    }
  | {
      kind: "testcontainer";
      databaseUrl: string;
      databaseName: string;
      containerId: string;
    };

type GuardInput = {
  nodeEnv: string | undefined;
  testDatabaseUrl: string;
  developmentDatabaseUrl?: string;
  source: "external" | "testcontainer";
  containerId?: string;
};

function parsePostgresUrl(value: string, label: string) {
  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`[test-db-safety] ${label} is not a valid URL`);
  }

  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new Error(
      `[test-db-safety] ${label} must use postgres:// or postgresql://`,
    );
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));

  if (!databaseName) {
    throw new Error(`[test-db-safety] ${label} has no database name`);
  }

  return { parsed, databaseName };
}

function databaseIdentity(parsed: URL, databaseName: string) {
  const port = parsed.port || "5432";
  return `${parsed.hostname.toLowerCase()}:${port}/${databaseName.toLowerCase()}`;
}

export function assertSafeTestDatabase(input: GuardInput): TestDatabaseSource {
  if (input.nodeEnv !== "test") {
    throw new Error(
      '[test-db-safety] Refusing database access because NODE_ENV must equal "test"',
    );
  }

  const testTarget = parsePostgresUrl(
    input.testDatabaseUrl,
    "test database URL",
  );
  const normalizedDatabaseName = testTarget.databaseName.toLowerCase();

  if (normalizedDatabaseName === "devdb") {
    throw new Error(
      '[test-db-safety] Refusing database access to forbidden database "devdb"',
    );
  }

  if (input.source === "external" && !normalizedDatabaseName.includes("_test")) {
    throw new Error(
      '[test-db-safety] TEST_DATABASE_URL database name must contain "_test"',
    );
  }

  if (input.source === "testcontainer" && !input.containerId) {
    throw new Error(
      "[test-db-safety] Generated database is missing its run-owned container ID",
    );
  }

  if (input.developmentDatabaseUrl) {
    const developmentTarget = parsePostgresUrl(
      input.developmentDatabaseUrl,
      "development DATABASE_URL",
    );

    if (
      databaseIdentity(testTarget.parsed, testTarget.databaseName) ===
      databaseIdentity(
        developmentTarget.parsed,
        developmentTarget.databaseName,
      )
    ) {
      throw new Error(
        "[test-db-safety] Test database must not match development DATABASE_URL",
      );
    }
  }

  if (input.source === "external") {
    return {
      kind: "external",
      databaseUrl: input.testDatabaseUrl,
      databaseName: testTarget.databaseName,
    };
  }

  return {
    kind: "testcontainer",
    databaseUrl: input.testDatabaseUrl,
    databaseName: testTarget.databaseName,
    containerId: input.containerId!,
  };
}

export function assertCurrentProcessUsesSafeTestDatabase() {
  const source = process.env.TEST_DATABASE_SOURCE;

  if (source !== "external" && source !== "testcontainer") {
    throw new Error(
      "[test-db-safety] TEST_DATABASE_SOURCE was not established by global setup",
    );
  }

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      "[test-db-safety] DATABASE_URL was not established by global setup",
    );
  }

  return assertSafeTestDatabase({
    nodeEnv: process.env.NODE_ENV,
    testDatabaseUrl: databaseUrl,
    developmentDatabaseUrl: process.env.DEVELOPMENT_DATABASE_URL,
    source,
    containerId: process.env.TESTCONTAINERS_CONTAINER_ID,
  });
}
