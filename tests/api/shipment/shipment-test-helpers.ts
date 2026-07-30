import type { Express } from "express";
import request, { type Test } from "supertest";
import { expect } from "vitest";

export function authorize(apiRequest: Test, token: string) {
  return apiRequest.set("Authorization", `Bearer ${token}`);
}

export function adminShipmentRequest(
  app: Express,
  method: "get" | "post" | "patch" | "delete",
  path: string,
) {
  if (method === "get") return request(app).get(path);
  if (method === "post") return request(app).post(path);
  if (method === "patch") return request(app).patch(path);
  return request(app).delete(path);
}

export function expectSafeShipmentError(body: unknown) {
  expect(JSON.stringify(body)).not.toMatch(
    /controlled shipment|PrismaClient|ConnectorError|Unique constraint|SQLSTATE|SELECT |INSERT |UPDATE |postgres(?:ql)?:\/\/|JWT_SECRET|PAYOS_|CLOUDINARY_|\/Users\/|trim is not a function/i,
  );
}

export function expectFailureEnvelope(body: unknown) {
  expect(body).toMatchObject({
    success: false,
  });
  expectSafeShipmentError(body);
}
