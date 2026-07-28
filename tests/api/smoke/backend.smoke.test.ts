import jwt from "jsonwebtoken";
import request from "supertest";
import {
  beforeAll,
  describe,
  expect,
  inject,
  test,
} from "vitest";
import { assertCurrentProcessUsesSafeTestDatabase } from "../../setup/database-safety";

describe.sequential("Backend API smoke foundation", () => {
  const manifest = inject("fixtureManifest");
  let customerApp: Awaited<
    typeof import("../../../src/apps/customer/customer.app")
  >["default"];
  let adminApp: Awaited<
    typeof import("../../../src/apps/admin/admin.app")
  >["default"];

  beforeAll(async () => {
    assertCurrentProcessUsesSafeTestDatabase();

    [{ default: customerApp }, { default: adminApp }] = await Promise.all([
      import("../../../src/apps/customer/customer.app"),
      import("../../../src/apps/admin/admin.app"),
    ]);
  });

  test("SMK-CUS-HEALTH-001 Customer composition root exposes health", async () => {
    const response = await request(customerApp).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      message: "Customer API is running",
    });
  });

  test("SMK-ADM-HEALTH-001 Admin composition root exposes health", async () => {
    const response = await request(adminApp).get("/api/admin/health");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      message: "Admin API is running",
    });
  });

  test("SMK-CUS-PRODUCT-001 Public product endpoint returns seeded product", async () => {
    const response = await request(customerApp).get("/api/products");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: manifest.catalog.product_active.productId,
          slug: manifest.catalog.product_active.slug,
          stockQuantity:
            manifest.catalog.variant_stock_10.stockQuantity,
        }),
      ]),
    );
    expect(response.body.data.pagination).toEqual(
      expect.objectContaining({
        totalItems: expect.any(Number),
        totalPages: expect.any(Number),
      }),
    );
  });

  test("SMK-CUS-AUTH-001 Anonymous Customer protected API returns 401", async () => {
    const response = await request(customerApp).get("/api/cart");

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ success: false });
  });

  test("SMK-ADM-AUTH-001 Anonymous Admin protected API returns 401", async () => {
    const response = await request(adminApp).get("/api/admin/products");

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ success: false });
  });

  test("SMK-ADM-RBAC-001 Customer token calling Admin API returns 403", async () => {
    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
      throw new Error("Test JWT secret was not initialized");
    }

    const token = jwt.sign(
      {
        userId: manifest.accounts.customer_active.userId,
        role: manifest.accounts.customer_active.roleName,
      },
      jwtSecret,
      { expiresIn: "5m" },
    );
    const response = await request(adminApp)
      .get("/api/admin/products")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ success: false });
  });
});
