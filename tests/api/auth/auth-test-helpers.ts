import { expect } from "vitest";

const FORBIDDEN_RESPONSE_KEYS = [
  "pass_hash",
  "password",
  "jwtSecret",
  "JWT_SECRET",
];

export function expectSafeAuthResponse(body: unknown) {
  const serialized = JSON.stringify(body);

  for (const forbiddenKey of FORBIDDEN_RESPONSE_KEYS) {
    expect(serialized).not.toContain(forbiddenKey);
  }

  if (process.env.JWT_SECRET) {
    expect(serialized).not.toContain(process.env.JWT_SECRET);
  }
}

export function expectCanonicalAuthUser(
  actual: unknown,
  expected: {
    id: number;
    userName: string;
    fullName?: string;
    email: string;
    phone: string;
    role: string;
  },
) {
  expect(actual).toEqual(
    expect.objectContaining({
      id: expected.id,
      userName: expected.userName,
      email: expected.email,
      phone: expected.phone,
      role: expected.role,
      fullName: expected.fullName ?? expect.any(String),
    }),
  );
}
