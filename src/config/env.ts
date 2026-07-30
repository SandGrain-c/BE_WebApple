// src/config/env.ts

import dotenv from "dotenv";

dotenv.config();

export type IntegrationStatus = "configured" | "disabled" | "misconfigured";

const readOptional = (name: string) => process.env[name]?.trim() || "";

const getGroupStatus = (values: string[]): IntegrationStatus => {
  const configuredCount = values.filter(Boolean).length;
  if (configuredCount === 0) return "disabled";
  if (configuredCount === values.length) return "configured";
  return "misconfigured";
};

const cloudinaryUrl = readOptional("CLOUDINARY_URL");
const cloudinaryParts = [
  readOptional("CLOUDINARY_CLOUD_NAME"),
  readOptional("CLOUDINARY_API_KEY"),
  readOptional("CLOUDINARY_API_SECRET"),
];
const payOSParts = [
  readOptional("PAYOS_CLIENT_ID"),
  readOptional("PAYOS_API_KEY"),
  readOptional("PAYOS_CHECKSUM_KEY"),
];

export const integrationStatus = {
  cloudinary: cloudinaryUrl
    ? ("configured" as const)
    : getGroupStatus(cloudinaryParts),
  payos: getGroupStatus(payOSParts),
};

export const env = {
  PORT: process.env.PORT || 5000,
  CLIENT_URL: process.env.CLIENT_URL || "http://localhost:3000",
  ADMIN_CLIENT_URL:
    process.env.ADMIN_CLIENT_URL || "http://localhost:3000",

  DATABASE_URL: readOptional("DATABASE_URL"),
  JWT_SECRET: readOptional("JWT_SECRET"),
  CLOUDINARY_URL: cloudinaryUrl,
  CLOUDINARY_CLOUD_NAME: cloudinaryParts[0],
  CLOUDINARY_API_KEY: cloudinaryParts[1],
  CLOUDINARY_API_SECRET: cloudinaryParts[2],
  PAYOS_CLIENT_ID: payOSParts[0],
  PAYOS_API_KEY: payOSParts[1],
  PAYOS_CHECKSUM_KEY: payOSParts[2],
  PAYOS_RETURN_URL:
    readOptional("PAYOS_RETURN_URL") ||
    "http://localhost:3000/checkout/payment-success",
  PAYOS_CANCEL_URL:
    readOptional("PAYOS_CANCEL_URL") ||
    "http://localhost:3000/checkout/payment-cancel",
  PAYOS_WEBHOOK_URL: readOptional("PAYOS_WEBHOOK_URL"),
} as const;

export const validateCoreEnvironment = () => {
  const missing = [
    !env.DATABASE_URL ? "DATABASE_URL" : null,
    !env.JWT_SECRET ? "JWT_SECRET" : null,
  ].filter((name): name is string => Boolean(name));

  if (missing.length > 0) {
    throw new Error(`Thiếu biến môi trường bắt buộc: ${missing.join(", ")}`);
  }

  console.log(
    `[config] database=configured cloudinary=${integrationStatus.cloudinary} payos=${integrationStatus.payos}`,
  );
};
