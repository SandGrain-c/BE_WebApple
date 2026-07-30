import dotenv from "dotenv";
import { assertSafeE2EDatabase } from "./e2e-database-safety";

function readOrderId() {
  const rawValue = process.argv
    .slice(2)
    .find((argument) => argument.startsWith("--order-id="))
    ?.split("=")[1];
  const orderId = Number(rawValue);

  if (!Number.isSafeInteger(orderId) || orderId <= 0) {
    throw new Error("[e2e-checkout] --order-id=<positive integer> is required");
  }

  return orderId;
}

async function main() {
  dotenv.config({ quiet: true });

  const safeDatabase = assertSafeE2EDatabase({
    e2eDatabaseUrl: process.env.E2E_DATABASE_URL,
    developmentDatabaseUrl: process.env.DATABASE_URL,
  });
  const orderId = readOrderId();

  process.env.DATABASE_URL = safeDatabase.databaseUrl;
  const [{ default: prisma }, { E2E_FIXTURE }] = await Promise.all([
    import("../../src/utils/prisma"),
    import("./e2e-seed"),
  ]);

  try {
    const order = await prisma.orders.findUnique({
      where: { order_id: orderId },
      include: {
        order_details: true,
        payment_transactions: true,
        voucher_usages: true,
      },
    });

    if (!order) {
      throw new Error(`[e2e-checkout] order ${orderId} was not found`);
    }

    const customer = await prisma.users.findUniqueOrThrow({
      where: { user_name: E2E_FIXTURE.customer.userName },
      include: {
        carts: {
          include: { cart_items: true },
        },
      },
    });
    const variant = await prisma.product_variants.findUniqueOrThrow({
      where: { sku: E2E_FIXTURE.inStockVariant.sku },
    });
    const voucher = await prisma.vouchers.findUniqueOrThrow({
      where: { code: E2E_FIXTURE.voucher.code },
    });

    process.stdout.write(
      JSON.stringify({
        order: {
          id: order.order_id,
          userId: order.user_id,
          status: order.order_status,
          voucherId: order.voucher_id,
          subTotal: Number(order.sub_total),
          discountAmount: Number(order.discount_amount),
          totalAmount: Number(order.total_amount),
        },
        items: order.order_details.map((item) => ({
          variantId: item.variant_id,
          quantity: item.quantity,
          unitPrice: Number(item.unit_price),
        })),
        payments: order.payment_transactions.map((payment) => ({
          gateway: payment.gateway,
          type: payment.payment_type,
          status: payment.status,
          amount: Number(payment.amount),
        })),
        cartItemCount: customer.carts?.cart_items.length ?? 0,
        stockQuantity: variant.stock_quantity,
        voucherUsedCount: voucher.used_count,
        voucherUsageCount: order.voucher_usages ? 1 : 0,
      }),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
