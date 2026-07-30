import type { PrismaClient } from "../../src/generated/prisma/client";

export async function createOwnershipFixtures(
  prisma: PrismaClient,
  input: {
    customerAId: number;
    customerBId: number;
    productId: number;
    variantId: number;
  },
) {
  const addressA = await prisma.user_addresses.create({
    data: {
      user_id: input.customerAId,
      receiver_name: "Customer A Receiver",
      receiver_phone: "0911000001",
      detailed_address: "A ownership address",
      ward: "Test Ward A",
      city: "Test City",
      is_default: true,
    },
  });
  const addressB = await prisma.user_addresses.create({
    data: {
      user_id: input.customerBId,
      receiver_name: "Customer B Private Receiver",
      receiver_phone: "0911000002",
      detailed_address: "B private ownership address",
      ward: "Test Ward B",
      city: "Test City",
      is_default: true,
    },
  });
  const addressASecondary = await prisma.user_addresses.create({
    data: {
      user_id: input.customerAId,
      receiver_name: "Customer A Secondary Receiver",
      receiver_phone: "0911000011",
      detailed_address: "A secondary ownership address",
      ward: "Test Ward A2",
      city: "Test City",
      is_default: false,
    },
  });

  const cartA = await prisma.carts.create({
    data: {
      user_id: input.customerAId,
    },
  });
  const cartB = await prisma.carts.create({
    data: {
      user_id: input.customerBId,
    },
  });
  const cartItemA = await prisma.cart_items.create({
    data: {
      cart_id: cartA.cart_id,
      variant_id: input.variantId,
      quantity: 1,
      selected: true,
    },
  });
  const cartItemB = await prisma.cart_items.create({
    data: {
      cart_id: cartB.cart_id,
      variant_id: input.variantId,
      quantity: 2,
      selected: false,
    },
  });

  const voucherB = await prisma.vouchers.create({
    data: {
      code: "TSTOWNB",
      discount_type: "Fixed",
      discount_value: 50_000,
      min_order_value: 100_000,
      usage_limit: 10,
      used_count: 1,
      start_date: new Date("2026-01-01T00:00:00.000Z"),
      end_date: new Date("2027-01-01T00:00:00.000Z"),
      is_active: true,
    },
  });

  const orderA = await prisma.orders.create({
    data: {
      user_id: input.customerAId,
      address_id: addressA.address_id,
      order_code: "TST-OWN-A-001",
      sub_total: 20_000_000,
      shipping_fee: 0,
      discount_amount: 0,
      total_amount: 20_000_000,
      order_status: "PendingPayment",
      customer_name: "Customer A Receiver",
      customer_phone: "0911000001",
      shipping_address: "A ownership address",
    },
  });
  const orderB = await prisma.orders.create({
    data: {
      user_id: input.customerBId,
      address_id: addressB.address_id,
      voucher_id: voucherB.voucher_id,
      order_code: "TST-OWN-B-001",
      sub_total: 20_000_000,
      shipping_fee: 0,
      discount_amount: 50_000,
      total_amount: 19_950_000,
      order_status: "PendingPayment",
      customer_name: "Customer B Private Receiver",
      customer_phone: "0911000002",
      shipping_address: "B private ownership address",
    },
  });

  await prisma.order_details.create({
    data: {
      order_id: orderA.order_id,
      variant_id: input.variantId,
      quantity: 1,
      unit_price: 20_000_000,
    },
  });
  const orderDetailB = await prisma.order_details.create({
    data: {
      order_id: orderB.order_id,
      variant_id: input.variantId,
      quantity: 1,
      unit_price: 20_000_000,
    },
  });
  const orderHistoryB = await prisma.order_status_history.create({
    data: {
      order_id: orderB.order_id,
      old_status: null,
      new_status: "PendingPayment",
      changed_by: input.customerBId,
      note: "Ownership fixture",
    },
  });
  await prisma.voucher_usages.create({
    data: {
      voucher_id: voucherB.voucher_id,
      user_id: input.customerBId,
      order_id: orderB.order_id,
    },
  });

  const paymentB = await prisma.payment_transactions.create({
    data: {
      order_id: orderB.order_id,
      gateway: "TestGateway",
      transaction_ref: "TST-PRIVATE-TRANSACTION-B",
      amount: 19_950_000,
      payment_type: "Payment",
      status: "Pending",
    },
  });
  const shipmentB = await prisma.shipments.create({
    data: {
      order_id: orderB.order_id,
      shipping_provider: "Test Carrier",
      tracking_code: "TST-PRIVATE-TRACKING-B",
      status: "Pending",
    },
  });
  const reviewB = await prisma.reviews.create({
    data: {
      user_id: input.customerBId,
      product_id: input.productId,
      order_detail_id: orderDetailB.order_detail_id,
      rating: 4,
      comment: "Customer B private review",
      is_active: true,
    },
  });
  const favoriteB = await prisma.favorite_products.create({
    data: {
      user_id: input.customerBId,
      product_id: input.productId,
    },
  });

  const banner = await prisma.banners.create({
    data: {
      title: "RBAC Test Banner",
      image_url: "https://test.invalid/rbac-banner.png",
      target_url: "/test-rbac",
      position: "home",
      is_active: true,
    },
  });
  const productImage = await prisma.product_images.create({
    data: {
      product_id: input.productId,
      variant_id: input.variantId,
      color: "RBAC Test Black",
      image_url: "https://test.invalid/rbac-product.png",
      alt_text: "RBAC product image",
      is_thumbnail: true,
      sort_order: 1,
      is_active: true,
    },
  });
  const supplier = await prisma.suppliers.create({
    data: {
      supplier_name: "RBAC Test Supplier",
      phone: "0911000003",
      email: "rbac-supplier@test.invalid",
      address: "Test supplier address",
      status: "Active",
    },
  });
  const productItem = await prisma.product_items.create({
    data: {
      variant_id: input.variantId,
      serial_number: "TST-RBAC-SERIAL-001",
      status: 1,
    },
  });

  return {
    addressA,
    addressASecondary,
    addressB,
    cartItemA,
    cartItemB,
    orderA,
    orderB,
    paymentB,
    shipmentB,
    reviewB,
    favoriteB,
    voucherB,
    orderHistoryB,
    banner,
    productImage,
    supplier,
    productItem,
  };
}
