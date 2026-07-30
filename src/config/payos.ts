// src/config/payos.ts

import { PayOS } from "@payos/node";
import { env, integrationStatus } from "./env";

if (integrationStatus.payos !== "configured") {
  console.warn(`[config] payos=${integrationStatus.payos}; COD vẫn khả dụng`);
}

export const payOS = new PayOS({
  clientId: env.PAYOS_CLIENT_ID,
  apiKey: env.PAYOS_API_KEY,
  checksumKey: env.PAYOS_CHECKSUM_KEY,
});

export const payOSConfig = {
  returnUrl: env.PAYOS_RETURN_URL,
  cancelUrl: env.PAYOS_CANCEL_URL,
  webhookUrl: env.PAYOS_WEBHOOK_URL,
} as const;
