type SafeE2EDatabase = {
  databaseUrl: string;
  databaseName: string;
};

function parsePostgresUrl(value: string, label: string) {
  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`[e2e-db-safety] ${label} is not a valid URL`);
  }

  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new Error(
      `[e2e-db-safety] ${label} must use postgres:// or postgresql://`,
    );
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));

  if (!databaseName) {
    throw new Error(`[e2e-db-safety] ${label} has no database name`);
  }

  return { parsed, databaseName };
}

function databaseIdentity(parsed: URL, databaseName: string) {
  const port = parsed.port || "5432";
  return `${parsed.hostname.toLowerCase()}:${port}/${databaseName.toLowerCase()}`;
}

export function assertSafeE2EDatabase(input: {
  e2eDatabaseUrl?: string;
  developmentDatabaseUrl?: string;
}): SafeE2EDatabase {
  const e2eDatabaseUrl = input.e2eDatabaseUrl?.trim();

  if (!e2eDatabaseUrl) {
    throw new Error("[e2e-db-safety] E2E_DATABASE_URL is required");
  }

  const e2eTarget = parsePostgresUrl(e2eDatabaseUrl, "E2E_DATABASE_URL");
  const normalizedName = e2eTarget.databaseName.toLowerCase();

  if (!normalizedName.includes("e2e") && !normalizedName.includes("test")) {
    throw new Error(
      '[e2e-db-safety] database name must contain "e2e" or "test"',
    );
  }

  if (normalizedName === "devdb") {
    throw new Error(
      '[e2e-db-safety] refusing forbidden development database "devdb"',
    );
  }

  const developmentDatabaseUrl = input.developmentDatabaseUrl?.trim();

  if (developmentDatabaseUrl) {
    const developmentTarget = parsePostgresUrl(
      developmentDatabaseUrl,
      "development DATABASE_URL",
    );

    if (
      databaseIdentity(e2eTarget.parsed, e2eTarget.databaseName) ===
      databaseIdentity(
        developmentTarget.parsed,
        developmentTarget.databaseName,
      )
    ) {
      throw new Error(
        "[e2e-db-safety] E2E database must not match development DATABASE_URL",
      );
    }
  }

  return {
    databaseUrl: e2eDatabaseUrl,
    databaseName: e2eTarget.databaseName,
  };
}
