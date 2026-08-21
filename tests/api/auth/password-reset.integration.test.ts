import { randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import express from "express";
import request from "supertest";
import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  inject,
  test,
  vi,
} from "vitest";
import { mailService } from "../../../src/services/mail.service";
import {
  FORGOT_PASSWORD_PUBLIC_MESSAGE,
  PASSWORD_RESET_TOKEN_TYPE,
  hashPasswordResetToken,
} from "../../../src/modules/auth/auth.service";
import { createPasswordResetRateLimiter } from "../../../src/middlewares/password-reset-rate-limit.middleware";
import prisma from "../../../src/utils/prisma";
import {
  AUTH_TEST_PASSWORD,
  restoreAuthAccount,
} from "../../factories/auth.factory";
import { assertCurrentProcessUsesSafeTestDatabase } from "../../setup/database-safety";

const NEW_PASSWORD = "ResetPasswordOnly!2026";

describe.sequential("Customer Forgot Password / Reset Password API", () => {
  const manifest = inject("fixtureManifest");
  let customerApp: Awaited<
    typeof import("../../../src/apps/customer/customer.app")
  >["default"];

  beforeAll(async () => {
    assertCurrentProcessUsesSafeTestDatabase();
    ({ default: customerApp } = await import(
      "../../../src/apps/customer/customer.app"
    ));
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.spyOn(mailService, "sendPasswordResetEmail").mockResolvedValue();

    await prisma.verification_tokens.deleteMany({
      where: {
        token_type: PASSWORD_RESET_TOKEN_TYPE,
      },
    });

    await Promise.all([
      restoreAuthAccount(prisma, {
        userId: manifest.accounts.customer_active.userId,
        roleName: "Customer",
        status: 1,
      }),
      restoreAuthAccount(prisma, {
        userId: manifest.accounts.customer_locked.userId,
        roleName: "Customer",
        status: 0,
      }),
    ]);
  });

  async function issueResetToken(email = manifest.accounts.customer_active.email) {
    const response = await request(customerApp)
      .post("/api/auth/forgot-password")
      .send({ email });
    const sendMailMock = vi.mocked(mailService.sendPasswordResetEmail);
    const mail = sendMailMock.mock.calls.at(-1)?.[0];

    if (!mail) {
      throw new Error("Password reset mail was not captured");
    }

    const rawToken = new URL(mail.resetUrl).searchParams.get("token");

    if (!rawToken) {
      throw new Error("Password reset URL does not contain a token");
    }

    return { response, mail, rawToken };
  }

  test("known and unknown emails receive the same public response without enumeration", async () => {
    const knownResponse = await request(customerApp)
      .post("/api/auth/forgot-password")
      .send({ email: manifest.accounts.customer_active.email });
    const knownTokenCount = await prisma.verification_tokens.count({
      where: {
        user_id: manifest.accounts.customer_active.userId,
        token_type: PASSWORD_RESET_TOKEN_TYPE,
        used_at: null,
      },
    });
    const knownMailCount = vi.mocked(mailService.sendPasswordResetEmail).mock
      .calls.length;

    const unknownResponse = await request(customerApp)
      .post("/api/auth/forgot-password")
      .send({ email: "missing-customer@test.invalid" });

    expect(knownResponse.status).toBe(200);
    expect(unknownResponse.status).toBe(knownResponse.status);
    expect(knownResponse.body).toEqual({
      success: true,
      message: FORGOT_PASSWORD_PUBLIC_MESSAGE,
    });
    expect(unknownResponse.body).toEqual(knownResponse.body);
    expect(knownTokenCount).toBe(1);
    expect(
      await prisma.verification_tokens.count({
        where: {
          token_type: PASSWORD_RESET_TOKEN_TYPE,
        },
      }),
    ).toBe(1);
    expect(knownMailCount).toBe(1);
    expect(mailService.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
  });

  test("stores only the SHA-256 token hash and sends the raw token in the Customer reset URL", async () => {
    const { response, mail, rawToken } = await issueResetToken();
    const storedToken = await prisma.verification_tokens.findFirstOrThrow({
      where: {
        user_id: manifest.accounts.customer_active.userId,
        token_type: PASSWORD_RESET_TOKEN_TYPE,
        used_at: null,
      },
    });

    expect(response.status).toBe(200);
    expect(mail.recipient).toBe(manifest.accounts.customer_active.email);
    expect(new URL(mail.resetUrl).pathname).toBe("/reset-password");
    expect(rawToken).toMatch(/^[a-f0-9]{64}$/);
    expect(storedToken.token).toBe(hashPasswordResetToken(rawToken));
    expect(storedToken.token).not.toBe(rawToken);
    expect(storedToken.expired_at.getTime()).toBeGreaterThan(Date.now());
  });

  test("valid reset updates the password, consumes the token, and changes login credentials", async () => {
    const { rawToken } = await issueResetToken();

    const resetResponse = await request(customerApp)
      .post("/api/auth/reset-password")
      .send({
        token: rawToken,
        newPassword: NEW_PASSWORD,
        confirmPassword: NEW_PASSWORD,
      });

    expect(resetResponse.status).toBe(200);
    expect(resetResponse.body).toEqual({
      success: true,
      message: "Mật khẩu đã được đặt lại thành công",
    });
    expect(
      await prisma.verification_tokens.findFirstOrThrow({
        where: {
          token: hashPasswordResetToken(rawToken),
        },
      }),
    ).toMatchObject({ used_at: expect.any(Date) });

    const oldPasswordLogin = await request(customerApp)
      .post("/api/auth/login")
      .send({
        identifier: manifest.accounts.customer_active.email,
        password: AUTH_TEST_PASSWORD,
      });
    const newPasswordLogin = await request(customerApp)
      .post("/api/auth/login")
      .send({
        identifier: manifest.accounts.customer_active.email,
        password: NEW_PASSWORD,
      });

    expect(oldPasswordLogin.status).toBe(401);
    expect(newPasswordLogin.status).toBe(200);
  });

  test("rejects replay of a consumed reset token", async () => {
    const { rawToken } = await issueResetToken();
    const payload = {
      token: rawToken,
      newPassword: NEW_PASSWORD,
      confirmPassword: NEW_PASSWORD,
    };

    expect(
      (await request(customerApp).post("/api/auth/reset-password").send(payload))
        .status,
    ).toBe(200);

    const replayResponse = await request(customerApp)
      .post("/api/auth/reset-password")
      .send(payload);

    expect(replayResponse.status).toBe(400);
    expect(replayResponse.body.message).toBe(
      "Token không hợp lệ hoặc đã hết hạn",
    );
  });

  test("rejects an expired token without changing the password", async () => {
    const rawToken = randomBytes(32).toString("hex");
    await prisma.verification_tokens.create({
      data: {
        user_id: manifest.accounts.customer_active.userId,
        token: hashPasswordResetToken(rawToken),
        token_type: PASSWORD_RESET_TOKEN_TYPE,
        expired_at: new Date(Date.now() - 60_000),
      },
    });

    const response = await request(customerApp)
      .post("/api/auth/reset-password")
      .send({
        token: rawToken,
        newPassword: NEW_PASSWORD,
        confirmPassword: NEW_PASSWORD,
      });
    const customer = await prisma.users.findUniqueOrThrow({
      where: {
        user_id: manifest.accounts.customer_active.userId,
      },
    });

    expect(response.status).toBe(400);
    expect(await bcrypt.compare(AUTH_TEST_PASSWORD, customer.pass_hash)).toBe(
      true,
    );
  });

  test("a new request invalidates the previous reset token for the same Customer", async () => {
    const first = await issueResetToken();
    const second = await issueResetToken();

    const firstResponse = await request(customerApp)
      .post("/api/auth/reset-password")
      .send({
        token: first.rawToken,
        newPassword: NEW_PASSWORD,
        confirmPassword: NEW_PASSWORD,
      });
    const secondResponse = await request(customerApp)
      .post("/api/auth/reset-password")
      .send({
        token: second.rawToken,
        newPassword: NEW_PASSWORD,
        confirmPassword: NEW_PASSWORD,
      });

    expect(firstResponse.status).toBe(400);
    expect(secondResponse.status).toBe(200);
  });

  test("rejects invalid random tokens safely", async () => {
    const response = await request(customerApp)
      .post("/api/auth/reset-password")
      .send({
        token: randomBytes(32).toString("hex"),
        newPassword: NEW_PASSWORD,
        confirmPassword: NEW_PASSWORD,
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      success: false,
      message: "Token không hợp lệ hoặc đã hết hạn",
    });
  });

  test("rejects short or mismatched new passwords without consuming the token", async () => {
    const { rawToken } = await issueResetToken();

    const shortPasswordResponse = await request(customerApp)
      .post("/api/auth/reset-password")
      .send({
        token: rawToken,
        newPassword: "12345",
        confirmPassword: "12345",
      });
    const mismatchResponse = await request(customerApp)
      .post("/api/auth/reset-password")
      .send({
        token: rawToken,
        newPassword: NEW_PASSWORD,
        confirmPassword: "DifferentPassword!2026",
      });
    const storedToken = await prisma.verification_tokens.findFirstOrThrow({
      where: {
        token: hashPasswordResetToken(rawToken),
      },
    });

    expect(shortPasswordResponse.status).toBe(400);
    expect(mismatchResponse.status).toBe(400);
    expect(storedToken.used_at).toBeNull();
  });

  test("locked Customer forgot-password remains generic without creating a token", async () => {
    const response = await request(customerApp)
      .post("/api/auth/forgot-password")
      .send({ email: manifest.accounts.customer_locked.email });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      message: FORGOT_PASSWORD_PUBLIC_MESSAGE,
    });
    expect(mailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    expect(
      await prisma.verification_tokens.count({
        where: {
          user_id: manifest.accounts.customer_locked.userId,
          token_type: PASSWORD_RESET_TOKEN_TYPE,
        },
      }),
    ).toBe(0);
  });

  test("does not let password reset bypass a Customer account lock", async () => {
    const { rawToken } = await issueResetToken();
    const beforeLock = await prisma.users.findUniqueOrThrow({
      where: {
        user_id: manifest.accounts.customer_active.userId,
      },
      select: {
        pass_hash: true,
      },
    });

    await prisma.users.update({
      where: {
        user_id: manifest.accounts.customer_active.userId,
      },
      data: {
        status: 0,
      },
    });

    const response = await request(customerApp)
      .post("/api/auth/reset-password")
      .send({
        token: rawToken,
        newPassword: NEW_PASSWORD,
        confirmPassword: NEW_PASSWORD,
      });
    const lockedCustomer = await prisma.users.findUniqueOrThrow({
      where: {
        user_id: manifest.accounts.customer_active.userId,
      },
    });

    expect(response.status).toBe(400);
    expect(lockedCustomer.status).toBe(0);
    expect(lockedCustomer.pass_hash).toBe(beforeLock.pass_hash);
  });

  test("SMTP failure keeps the generic response and removes the undelivered token", async () => {
    vi.mocked(mailService.sendPasswordResetEmail).mockRejectedValueOnce(
      new Error("test SMTP failure"),
    );
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await request(customerApp)
      .post("/api/auth/forgot-password")
      .send({ email: manifest.accounts.customer_active.email });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      message: FORGOT_PASSWORD_PUBLIC_MESSAGE,
    });
    expect(
      await prisma.verification_tokens.count({
        where: {
          user_id: manifest.accounts.customer_active.userId,
          token_type: PASSWORD_RESET_TOKEN_TYPE,
          used_at: null,
        },
      }),
    ).toBe(0);
  });

  test("two concurrent reset requests can consume the token only once", async () => {
    const { rawToken } = await issueResetToken();
    const payload = {
      token: rawToken,
      newPassword: NEW_PASSWORD,
      confirmPassword: NEW_PASSWORD,
    };

    const responses = await Promise.all([
      request(customerApp).post("/api/auth/reset-password").send(payload),
      request(customerApp).post("/api/auth/reset-password").send(payload),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 400,
    ]);
  });

  test("route-specific rate limiter rejects requests above its configured IP quota", async () => {
    const app = express();
    app.post(
      "/forgot-password",
      createPasswordResetRateLimiter({ limit: 2, windowMs: 60_000 }),
      (_req, res) => res.status(200).json({ success: true }),
    );

    expect((await request(app).post("/forgot-password")).status).toBe(200);
    expect((await request(app).post("/forgot-password")).status).toBe(200);

    const limitedResponse = await request(app).post("/forgot-password");

    expect(limitedResponse.status).toBe(429);
    expect(limitedResponse.body.success).toBe(false);
  });
});
