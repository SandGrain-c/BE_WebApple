import { createHmac } from "node:crypto";
import type { PrismaClient } from "../../src/generated/prisma/client";
import {
  createOrderCustomer,
  createOrderLifecycleScenario,
  type OrderStatus,
} from "./order-lifecycle.factory";

let paymentFixtureCounter = 0;

function nextPaymentLabel(label: string) {
  paymentFixtureCounter += 1;
  const safeLabel =
    label.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 14) || "payment";

  return `${safeLabel}${paymentFixtureCounter}`;
}

export type PaymentIntegrityScenarioInput = {
  label: string;
  customerStatus?: number;
  orderStatus?: OrderStatus;
  paymentStatus?: "Pending" | "Success" | "Failed" | "Cancelled";
  gateway?: "payOS" | "COD";
  totalAmount?: number;
  paymentAmount?: number;
  transactionRef?: string | null;
  gatewayResponse?: unknown;
  paidAt?: Date | null;
  withVoucher?: boolean;
  withCartItem?: boolean;
  shipmentStatus?: string | null;
};

export async function createPaymentIntegrityScenario(
  prisma: PrismaClient,
  input: PaymentIntegrityScenarioInput,
) {
  const label = nextPaymentLabel(input.label);
  const totalAmount = input.totalAmount ?? 2_000;
  const customer = await createOrderCustomer(
    prisma,
    label,
    input.customerStatus ?? 1,
  );
  const lifecycle = await createOrderLifecycleScenario(prisma, {
    label,
    customerId: customer.user.user_id,
    status: input.orderStatus ?? "PendingPayment",
    quantity: 2,
    unitPrice: totalAmount / 2,
    currentPrice: totalAmount / 2,
    stockQuantity: 20,
    paymentGateway: input.gateway ?? "payOS",
    paymentStatus: input.paymentStatus ?? "Pending",
    shipmentStatus: input.shipmentStatus ?? null,
  });

  const gatewayResponse =
    input.gatewayResponse === undefined
      ? null
      : JSON.stringify(input.gatewayResponse);
  const payment = await prisma.payment_transactions.update({
    where: { transaction_id: lifecycle.payment.transaction_id },
    data: {
      amount: input.paymentAmount ?? totalAmount,
      transaction_ref: input.transactionRef ?? null,
      gateway_response: gatewayResponse,
      paid_at:
        input.paidAt === undefined
          ? input.paymentStatus === "Success"
            ? new Date("2026-07-20T09:00:00.000Z")
            : null
          : input.paidAt,
    },
  });

  let voucher = null;
  let voucherUsage = null;

  if (input.withVoucher) {
    voucher = await prisma.vouchers.create({
      data: {
        code: `PAY${label}`.toUpperCase().slice(0, 20),
        discount_type: "Fixed",
        discount_value: 200,
        min_order_value: 0,
        max_discount_amount: 200,
        usage_limit: 10,
        used_count: 1,
        start_date: new Date("2026-01-01T00:00:00.000Z"),
        end_date: new Date("2027-01-01T00:00:00.000Z"),
        is_active: true,
      },
    });
    await prisma.orders.update({
      where: { order_id: lifecycle.order.order_id },
      data: {
        voucher_id: voucher.voucher_id,
        discount_amount: 200,
      },
    });
    voucherUsage = await prisma.voucher_usages.create({
      data: {
        voucher_id: voucher.voucher_id,
        user_id: customer.user.user_id,
        order_id: lifecycle.order.order_id,
      },
    });
  }

  let cart = null;
  let cartItem = null;

  if (input.withCartItem) {
    cart = await prisma.carts.create({
      data: { user_id: customer.user.user_id },
    });
    cartItem = await prisma.cart_items.create({
      data: {
        cart_id: cart.cart_id,
        variant_id: lifecycle.variant.variant_id,
        quantity: 1,
        selected: true,
      },
    });
  }

  return {
    label,
    customer,
    ...lifecycle,
    payment,
    voucher,
    voucherUsage,
    cart,
    cartItem,
    expected: {
      ...lifecycle.expected,
      totalAmount,
      paymentAmount: input.paymentAmount ?? totalAmount,
    },
  };
}

function sortObjectKeys(value: Record<string, unknown>) {
  return Object.keys(value)
    .sort()
    .reduce<Record<string, unknown>>((output, key) => {
      output[key] = value[key];
      return output;
    }, {});
}

function signatureValue(value: unknown) {
  if (
    value === null ||
    value === undefined ||
    value === "null" ||
    value === "undefined"
  ) {
    return "";
  }

  if (Array.isArray(value)) {
    return JSON.stringify(
      value.map((item) =>
        typeof item === "object" && item !== null && !Array.isArray(item)
          ? sortObjectKeys(item as Record<string, unknown>)
          : item,
      ),
    );
  }

  return String(value);
}

export function signPayOSWebhookData(
  data: Record<string, unknown>,
  checksumKey = process.env.PAYOS_CHECKSUM_KEY,
) {
  if (!checksumKey) {
    throw new Error("PAYOS_CHECKSUM_KEY is required for payment tests");
  }

  const canonicalPayload = Object.keys(data)
    .sort()
    .filter((key) => data[key] !== undefined)
    .map((key) => `${key}=${signatureValue(data[key])}`)
    .join("&");

  return createHmac("sha256", checksumKey)
    .update(canonicalPayload)
    .digest("hex");
}

export function createSignedPayOSWebhook(input: {
  orderId: number;
  amount: unknown;
  reference?: string;
  paymentLinkId?: string;
  currency?: string;
  dataCode?: string;
  dataDescription?: string;
  extraData?: Record<string, unknown>;
  outerCode?: string;
  outerDescription?: string;
  outerSuccess?: boolean;
}) {
  const data: Record<string, unknown> = {
    orderCode: input.orderId,
    amount: input.amount,
    description: `DH${input.orderId}`,
    accountNumber: "12345678",
    reference: input.reference ?? `PAY-REF-${input.orderId}`,
    transactionDateTime: "2026-07-20 09:00:00",
    currency: input.currency ?? "VND",
    paymentLinkId: input.paymentLinkId ?? `pay-link-${input.orderId}`,
    code: input.dataCode ?? "00",
    desc: input.dataDescription ?? "Thành công",
    counterAccountBankId: "",
    counterAccountBankName: "",
    counterAccountName: "",
    counterAccountNumber: "",
    virtualAccountName: "",
    virtualAccountNumber: "",
    ...input.extraData,
  };

  return {
    code: input.outerCode ?? "00",
    desc: input.outerDescription ?? "success",
    success: input.outerSuccess ?? true,
    data,
    signature: signPayOSWebhookData(data),
  };
}

export async function snapshotPaymentIntegrity(
  prisma: PrismaClient,
  orderId: number,
  variantId: number,
) {
  const [order, payments, histories, audits, variant, voucherUsage, cartItems] =
    await Promise.all([
      prisma.orders.findUnique({
        where: { order_id: orderId },
        select: {
          order_id: true,
          order_status: true,
          total_amount: true,
          updated_at: true,
        },
      }),
      prisma.payment_transactions.findMany({
        where: { order_id: orderId },
        orderBy: { transaction_id: "asc" },
        select: {
          transaction_id: true,
          transaction_ref: true,
          amount: true,
          status: true,
          paid_at: true,
          gateway_response: true,
          updated_at: true,
        },
      }),
      prisma.order_status_history.findMany({
        where: { order_id: orderId },
        orderBy: { history_id: "asc" },
        select: {
          history_id: true,
          old_status: true,
          new_status: true,
          changed_by: true,
          note: true,
        },
      }),
      prisma.audit_logs.findMany({
        where: {
          entity_type: "payment_transactions",
          action: "PAYOS_WEBHOOK_PAYMENT_SUCCESS",
        },
        orderBy: { log_id: "asc" },
        select: {
          log_id: true,
          action: true,
          entity_id: true,
        },
      }),
      prisma.product_variants.findUnique({
        where: { variant_id: variantId },
        select: {
          variant_id: true,
          stock_quantity: true,
          price: true,
        },
      }),
      prisma.voucher_usages.findUnique({
        where: { order_id: orderId },
        select: {
          voucher_usage_id: true,
          voucher_id: true,
          user_id: true,
          order_id: true,
        },
      }),
      prisma.cart_items.findMany({
        where: {
          carts: {
            is: {
              user_id: (
                await prisma.orders.findUnique({
                  where: { order_id: orderId },
                  select: { user_id: true },
                })
              )?.user_id,
            },
          },
        },
        orderBy: { cart_item_id: "asc" },
        select: {
          cart_item_id: true,
          variant_id: true,
          quantity: true,
          selected: true,
        },
      }),
    ]);

  const transactionIds = payments.map((payment) => payment.transaction_id);

  return {
    order: order
      ? {
          ...order,
          total_amount: Number(order.total_amount),
          updated_at: order.updated_at.toISOString(),
        }
      : null,
    payments: payments.map((payment) => ({
      ...payment,
      amount: Number(payment.amount),
      paid_at: payment.paid_at?.toISOString() ?? null,
      updated_at: payment.updated_at?.toISOString() ?? null,
    })),
    histories,
    audits: audits.filter(
      (audit) =>
        audit.entity_id !== null && transactionIds.includes(audit.entity_id),
    ),
    variant: variant
      ? {
          ...variant,
          price: Number(variant.price),
        }
      : null,
    voucherUsage,
    cartItems,
  };
}

export async function installPaymentHistoryFailureTrigger(
  prisma: PrismaClient,
  orderId: number,
) {
  if (!Number.isInteger(orderId) || orderId <= 0) {
    throw new Error("A positive orderId is required for the failure trigger");
  }

  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION test_fail_payos_history_${orderId}()
    RETURNS trigger AS $$
    BEGIN
      IF NEW.order_id = ${orderId}
         AND NEW.note = 'PayOS xác nhận thanh toán thành công' THEN
        RAISE EXCEPTION 'controlled payos history failure';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER test_fail_payos_history_${orderId}
    BEFORE INSERT ON order_status_history
    FOR EACH ROW EXECUTE FUNCTION test_fail_payos_history_${orderId}()
  `);
}

export async function removePaymentHistoryFailureTrigger(
  prisma: PrismaClient,
  orderId: number,
) {
  if (!Number.isInteger(orderId) || orderId <= 0) {
    throw new Error("A positive orderId is required for trigger cleanup");
  }

  await prisma.$executeRawUnsafe(
    `DROP TRIGGER IF EXISTS test_fail_payos_history_${orderId} ON order_status_history`,
  );
  await prisma.$executeRawUnsafe(
    `DROP FUNCTION IF EXISTS test_fail_payos_history_${orderId}()`,
  );
}
