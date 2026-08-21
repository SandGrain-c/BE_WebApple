import { rateLimit } from "express-rate-limit";
import { env } from "../config/env";

type PasswordResetRateLimitOptions = {
  windowMs?: number;
  limit?: number;
};

export const createPasswordResetRateLimiter = (
  options: PasswordResetRateLimitOptions = {},
) => {
  return rateLimit({
    windowMs:
      options.windowMs ??
      env.PASSWORD_RESET_RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
    limit: options.limit ?? env.PASSWORD_RESET_RATE_LIMIT_MAX,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: {
      success: false,
      message:
        "Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau ít phút.",
    },
  });
};

export const passwordResetRateLimiter = createPasswordResetRateLimiter();
