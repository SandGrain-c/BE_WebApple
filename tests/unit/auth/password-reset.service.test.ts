import { createHash } from "node:crypto";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, test, vi } from "vitest";

const sendMail = vi.hoisted(() => vi.fn());

vi.mock("../../../src/utils/prisma", () => ({
  default: {},
}));

vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => ({ sendMail })),
  },
}));

vi.mock("../../../src/config/env", () => ({
  env: {
    CLIENT_URL: "http://localhost:3000",
    SMTP_HOST: "smtp.test.invalid",
    SMTP_PORT: 587,
    SMTP_SECURE: false,
    SMTP_USER: "test-user",
    SMTP_PASS: "test-pass",
    MAIL_FROM: "WebApple <no-reply@test.invalid>",
    PASSWORD_RESET_TTL_MINUTES: 30,
    PASSWORD_RESET_RATE_LIMIT_WINDOW_MINUTES: 15,
    PASSWORD_RESET_RATE_LIMIT_MAX: 20,
  },
  integrationStatus: {
    smtp: "configured",
  },
}));

import { hashPasswordResetToken } from "../../../src/modules/auth/auth.service";
import { createPasswordResetRateLimiter } from "../../../src/middlewares/password-reset-rate-limit.middleware";
import { mailService } from "../../../src/services/mail.service";
import {
  hashPassword,
  isValidPassword,
  PASSWORD_HASH_ROUNDS,
  PASSWORD_MIN_LENGTH,
} from "../../../src/utils/password";
import bcrypt from "bcrypt";

describe("Password reset security helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendMail.mockResolvedValue({ messageId: "test-message" });
  });

  test("hashes reset tokens deterministically with SHA-256", () => {
    const rawToken = "a".repeat(64);
    const expectedHash = createHash("sha256").update(rawToken).digest("hex");

    expect(hashPasswordResetToken(rawToken)).toBe(expectedHash);
    expect(hashPasswordResetToken(rawToken)).not.toBe(rawToken);
  });

  test("shared password helper preserves the six-character bcrypt policy", async () => {
    expect(PASSWORD_MIN_LENGTH).toBe(6);
    expect(PASSWORD_HASH_ROUNDS).toBe(10);
    expect(isValidPassword("12345")).toBe(false);
    expect(isValidPassword("123456")).toBe(true);

    const passwordHash = await hashPassword("SharedPolicy!2026");
    expect(await bcrypt.compare("SharedPolicy!2026", passwordHash)).toBe(true);
  });

  test("SMTP mail abstraction sends reset HTML and text without network in tests", async () => {
    await mailService.sendPasswordResetEmail({
      recipient: "customer@test.invalid",
      resetUrl: "http://localhost:3000/reset-password?token=test-token",
      expiresInMinutes: 30,
    });

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "customer@test.invalid",
        subject: "Đặt lại mật khẩu WebApple",
        text: expect.stringContaining(
          "http://localhost:3000/reset-password?token=test-token",
        ),
        html: expect.stringContaining("Đặt lại mật khẩu"),
      }),
    );
  });

  test("route limiter returns 429 after the configured IP quota", async () => {
    const app = express();
    app.post(
      "/forgot-password",
      createPasswordResetRateLimiter({ limit: 1, windowMs: 60_000 }),
      (_req, res) => res.status(200).json({ success: true }),
    );

    expect((await request(app).post("/forgot-password")).status).toBe(200);

    const limitedResponse = await request(app).post("/forgot-password");
    expect(limitedResponse.status).toBe(429);
    expect(limitedResponse.body).toEqual({
      success: false,
      message: "Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau ít phút.",
    });
  });
});
