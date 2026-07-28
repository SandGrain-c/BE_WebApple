// src/config/payos.ts

import { PayOS } from "@payos/node";

const {
  PAYOS_CLIENT_ID,
  PAYOS_API_KEY,
  PAYOS_CHECKSUM_KEY,
  PAYOS_RETURN_URL,
  PAYOS_CANCEL_URL,
} = process.env;

if (!PAYOS_CLIENT_ID || !PAYOS_API_KEY || !PAYOS_CHECKSUM_KEY) {
  console.warn(
    "Thiếu PAYOS_CLIENT_ID, PAYOS_API_KEY hoặc PAYOS_CHECKSUM_KEY trong .env"
  );
}

// PayOS client: đối tượng dùng để gọi API PayOS
export const payOS = new PayOS({
  clientId: PAYOS_CLIENT_ID || "",
  apiKey: PAYOS_API_KEY || "",
  checksumKey: PAYOS_CHECKSUM_KEY || "",
});

export const payOSConfig = {
  returnUrl: PAYOS_RETURN_URL || "http://localhost:3000/checkout/payment-success",
  cancelUrl: PAYOS_CANCEL_URL || "http://localhost:3000/checkout/payment-cancel",
};