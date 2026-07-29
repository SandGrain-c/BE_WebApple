import type { Express } from "express";
import request from "supertest";
import {
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { payOS } from "../../../src/config/payos";
import prisma from "../../../src/utils/prisma";
import {
  createPaymentIntegrityScenario,
  createSignedPayOSWebhook,
  installPaymentHistoryFailureTrigger,
  removePaymentHistoryFailureTrigger,
  snapshotPaymentIntegrity,
} from "../../factories/payment-integrity.factory";
import { assertCurrentProcessUsesSafeTestDatabase } from "../../setup/database-safety";

function expectSafeErrorBody(body: unknown) {
  expect(JSON.stringify(body)).not.toMatch(
    /controlled payos history failure|pass_hash|JWT_SECRET|PAYOS_(?:API|CHECKSUM)|postgres(?:ql)?:\/\/|PrismaClient|ConnectorError|SELECT |INSERT |UPDATE |\/Users\//i,
  );
}

function mockRejectedAsyncVerification(message = "Invalid signature") {
  return vi.spyOn(payOS.webhooks, "verify").mockImplementation(() => {
    const rejectedVerification = Promise.reject(new Error(message));
    void rejectedVerification.catch(() => undefined);
    return rejectedVerification as never;
  });
}

function mockResolvedAsyncVerification() {
  return vi.spyOn(payOS.webhooks, "verify").mockImplementation((payload) => {
    const body = payload as { data?: unknown };
    return Promise.resolve(body.data) as never;
  });
}

describe.sequential("PayOS callback integrity integration", () => {
  let customerApp: Express;
  const webhookPath = "/api/payment-transactions/payos/webhook";

  beforeAll(async () => {
    assertCurrentProcessUsesSafeTestDatabase();
    ({ default: customerApp } = await import(
      "../../../src/apps/customer/customer.app"
    ));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("PAY-CBK-001 empty, test-only and unsigned webhook bodies are rejected without mutation", async () => {
    const scenario = await createPaymentIntegrityScenario(prisma, {
      label: "cbkunsigned",
    });
    const before = await snapshotPaymentIntegrity(
      prisma,
      scenario.order.order_id,
      scenario.variant.variant_id,
    );
    const unsignedPayload = createSignedPayOSWebhook({
      orderId: scenario.order.order_id,
      amount: scenario.expected.totalAmount,
    });
    mockRejectedAsyncVerification();
    const responses = [
      await request(customerApp).post(webhookPath).send({}),
      await request(customerApp).post(webhookPath).send({ test: true }),
      await request(customerApp)
        .post(webhookPath)
        .send({
          code: unsignedPayload.code,
          desc: unsignedPayload.desc,
          success: unsignedPayload.success,
          data: unsignedPayload.data,
        }),
    ];

    expect(responses.map((response) => response.status)).toEqual([
      400, 400, 400,
    ]);
    expect(
      await snapshotPaymentIntegrity(
        prisma,
        scenario.order.order_id,
        scenario.variant.variant_id,
      ),
    ).toEqual(before);
  });

  test("PAY-CBK-002 wrong and blank signatures are rejected without mutation", async () => {
    const scenario = await createPaymentIntegrityScenario(prisma, {
      label: "cbkbadsig",
    });
    const before = await snapshotPaymentIntegrity(
      prisma,
      scenario.order.order_id,
      scenario.variant.variant_id,
    );
    const payload = createSignedPayOSWebhook({
      orderId: scenario.order.order_id,
      amount: scenario.expected.totalAmount,
    });
    mockRejectedAsyncVerification();
    const responses = await Promise.all(
      ["", "not-a-valid-signature"].map((signature) =>
        request(customerApp)
          .post(webhookPath)
          .send({ ...payload, signature }),
      ),
    );

    expect(responses.map((response) => response.status)).toEqual([400, 400]);
    expect(
      await snapshotPaymentIntegrity(
        prisma,
        scenario.order.order_id,
        scenario.variant.variant_id,
      ),
    ).toEqual(before);
    responses.forEach((response) => expectSafeErrorBody(response.body));
  });

  test("PAY-CBK-003 a valid signed success atomically updates payment/order/history without repeating checkout side effects", async () => {
    const scenario = await createPaymentIntegrityScenario(prisma, {
      label: "cbksuccess",
      withVoucher: true,
      withCartItem: true,
    });
    const payload = createSignedPayOSWebhook({
      orderId: scenario.order.order_id,
      amount: scenario.expected.totalAmount,
      reference: `bank-ref-${scenario.order.order_id}`,
      paymentLinkId: `pay-link-${scenario.order.order_id}`,
    });
    await prisma.payment_transactions.update({
      where: { transaction_id: scenario.payment.transaction_id },
      data: { transaction_ref: String(payload.data.paymentLinkId) },
    });
    const before = await snapshotPaymentIntegrity(
      prisma,
      scenario.order.order_id,
      scenario.variant.variant_id,
    );
    const response = await request(customerApp)
      .post(webhookPath)
      .send(payload);
    const after = await snapshotPaymentIntegrity(
      prisma,
      scenario.order.order_id,
      scenario.variant.variant_id,
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        received: true,
        orderId: scenario.order.order_id,
        transactionId: scenario.payment.transaction_id,
      },
    });
    expect(after.order?.order_status).toBe("PendingConfirmation");
    expect(after.order?.total_amount).toBe(scenario.expected.totalAmount);
    expect(after.payments).toHaveLength(1);
    expect(after.payments[0]).toMatchObject({
      transaction_id: scenario.payment.transaction_id,
      transaction_ref: `pay-link-${scenario.order.order_id}`,
      amount: scenario.expected.totalAmount,
      status: "Success",
    });
    expect(after.payments[0]?.paid_at).not.toBeNull();
    expect(
      after.histories.filter(
        (history) =>
          history.old_status === "PendingPayment" &&
          history.new_status === "PendingConfirmation",
      ),
    ).toHaveLength(1);
    expect(after.audits).toHaveLength(1);
    expect(after.variant).toEqual(before.variant);
    expect(after.voucherUsage).toEqual(before.voucherUsage);
    expect(after.cartItems).toEqual(before.cartItems);
  });

  test("PAY-CBK-004 payload tampering after signing is rejected for amount, order ID and reference", async () => {
    const scenario = await createPaymentIntegrityScenario(prisma, {
      label: "cbktamper",
    });
    const before = await snapshotPaymentIntegrity(
      prisma,
      scenario.order.order_id,
      scenario.variant.variant_id,
    );
    const payload = createSignedPayOSWebhook({
      orderId: scenario.order.order_id,
      amount: scenario.expected.totalAmount,
    });
    mockRejectedAsyncVerification("Data not integrity");
    const tamperedPayloads = [
      {
        ...payload,
        data: { ...payload.data, amount: scenario.expected.totalAmount + 1 },
      },
      {
        ...payload,
        data: { ...payload.data, orderCode: 2_147_483_647 },
      },
      {
        ...payload,
        data: { ...payload.data, reference: "tampered-reference" },
      },
    ];
    const responses = await Promise.all(
      tamperedPayloads.map((tampered) =>
        request(customerApp).post(webhookPath).send(tampered),
      ),
    );

    expect(responses.map((response) => response.status)).toEqual([
      400, 400, 400,
    ]);
    expect(
      await snapshotPaymentIntegrity(
        prisma,
        scenario.order.order_id,
        scenario.variant.variant_id,
      ),
    ).toEqual(before);
  });

  test("PAY-CBK-005 signed amount mismatches and invalid monetary values never mutate payment state", async () => {
    const scenario = await createPaymentIntegrityScenario(prisma, {
      label: "cbkamountmismatch",
    });
    const before = await snapshotPaymentIntegrity(
      prisma,
      scenario.order.order_id,
      scenario.variant.variant_id,
    );
    const invalidAmounts = [
      scenario.expected.totalAmount - 1,
      scenario.expected.totalAmount + 1,
      0,
      -1,
      scenario.expected.totalAmount * 100,
      1.5,
    ];
    const responses = [];

    for (const amount of invalidAmounts) {
      const payload = createSignedPayOSWebhook({
        orderId: scenario.order.order_id,
        amount,
      });
      responses.push(
        await request(customerApp).post(webhookPath).send(payload),
      );
    }

    expect(responses.map((response) => response.status)).toEqual([
      400, 400, 400, 400, 400, 400,
    ]);
    expect(
      await snapshotPaymentIntegrity(
        prisma,
        scenario.order.order_id,
        scenario.variant.variant_id,
      ),
    ).toEqual(before);
  });

  test("PAY-CBK-006 numeric strings and arrays cannot pass amount runtime validation", async () => {
    const inputs: unknown[] = ["2000", [2000]];
    const statuses: number[] = [];
    const results = [];
    mockResolvedAsyncVerification();

    for (const [index, amount] of inputs.entries()) {
      const scenario = await createPaymentIntegrityScenario(prisma, {
        label: `cbkamounttype${index}`,
      });
      const payload = createSignedPayOSWebhook({
        orderId: scenario.order.order_id,
        amount,
      });
      const response = await request(customerApp)
        .post(webhookPath)
        .send(payload);
      statuses.push(response.status);
      const payment = await prisma.payment_transactions.findUnique({
        where: { transaction_id: scenario.payment.transaction_id },
      });
      results.push({
        httpStatus: response.status,
        paymentStatus: payment?.status,
        paidAt: payment?.paid_at,
      });
    }

    expect(statuses).toEqual([400, 400]);
    expect(results).toEqual([
      { httpStatus: 400, paymentStatus: "Pending", paidAt: null },
      { httpStatus: 400, paymentStatus: "Pending", paidAt: null },
    ]);
  });

  test("PAY-CBK-007 a signed non-VND callback is rejected without mutation", async () => {
    const scenario = await createPaymentIntegrityScenario(prisma, {
      label: "cbkcurrency",
    });
    const before = await snapshotPaymentIntegrity(
      prisma,
      scenario.order.order_id,
      scenario.variant.variant_id,
    );
    const response = await request(customerApp)
      .post(webhookPath)
      .send(
        createSignedPayOSWebhook({
          orderId: scenario.order.order_id,
          amount: scenario.expected.totalAmount,
          currency: "USD",
        }),
      );

    expect(response.status).toBe(400);
    expect(
      await snapshotPaymentIntegrity(
        prisma,
        scenario.order.order_id,
        scenario.variant.variant_id,
      ),
    ).toEqual(before);
  });

  test("PAY-CBK-008 an unknown outer envelope field does not alter canonical data signature", async () => {
    const scenario = await createPaymentIntegrityScenario(prisma, {
      label: "cbkouterfield",
    });
    const payload = createSignedPayOSWebhook({
      orderId: scenario.order.order_id,
      amount: scenario.expected.totalAmount,
    });
    const response = await request(customerApp)
      .post(webhookPath)
      .send({ ...payload, ignoredOuterField: "not-signed-data" });

    expect(response.status).toBe(200);
    expect(
      await prisma.payment_transactions.findUnique({
        where: { transaction_id: scenario.payment.transaction_id },
        select: { status: true },
      }),
    ).toEqual({ status: "Success" });
  });

  test("PAY-CBK-009 signed failed and cancelled gateway outcomes do not become successful payments", async () => {
    const outcomes = [
      {
        code: "01",
        description: "Thất bại",
        outerDescription: "failed",
      },
      {
        code: "CANCELLED",
        description: "Đã hủy",
        outerDescription: "cancelled",
      },
    ];
    const results = [];

    for (const [index, outcome] of outcomes.entries()) {
      const scenario = await createPaymentIntegrityScenario(prisma, {
        label: `cbkoutcome${index}`,
      });
      const response = await request(customerApp)
        .post(webhookPath)
        .send(
          createSignedPayOSWebhook({
            orderId: scenario.order.order_id,
            amount: scenario.expected.totalAmount,
            dataCode: outcome.code,
            dataDescription: outcome.description,
            outerCode: outcome.code,
            outerDescription: outcome.outerDescription,
            outerSuccess: false,
          }),
        );
      const payment = await prisma.payment_transactions.findUnique({
        where: { transaction_id: scenario.payment.transaction_id },
      });
      const order = await prisma.orders.findUnique({
        where: { order_id: scenario.order.order_id },
      });
      results.push({
        httpStatus: response.status,
        paymentStatus: payment?.status,
        paidAt: payment?.paid_at,
        orderStatus: order?.order_status,
      });
    }

    expect(results).toEqual([
      {
        httpStatus: 200,
        paymentStatus: "Failed",
        paidAt: null,
        orderStatus: "PendingPayment",
      },
      {
        httpStatus: 200,
        paymentStatus: "Cancelled",
        paidAt: null,
        orderStatus: "PendingPayment",
      },
    ]);
  });

  test("PAY-CBK-010 sequential duplicate success callbacks are idempotent", async () => {
    const scenario = await createPaymentIntegrityScenario(prisma, {
      label: "cbkduplicate",
    });
    const payload = createSignedPayOSWebhook({
      orderId: scenario.order.order_id,
      amount: scenario.expected.totalAmount,
    });
    const first = await request(customerApp).post(webhookPath).send(payload);
    const firstState = await snapshotPaymentIntegrity(
      prisma,
      scenario.order.order_id,
      scenario.variant.variant_id,
    );
    const second = await request(customerApp).post(webhookPath).send(payload);
    const secondState = await snapshotPaymentIntegrity(
      prisma,
      scenario.order.order_id,
      scenario.variant.variant_id,
    );

    expect([first.status, second.status]).toEqual([200, 200]);
    expect(second.body.data.message).toBe("Webhook đã được xử lý trước đó");
    expect(secondState).toEqual(firstState);
    expect(
      secondState.histories.filter(
        (history) => history.new_status === "PendingConfirmation",
      ),
    ).toHaveLength(1);
    expect(secondState.audits).toHaveLength(1);
  });

  test("PAY-CBK-011 concurrent duplicate success callbacks create one transition and one audit event", async () => {
    const scenario = await createPaymentIntegrityScenario(prisma, {
      label: "cbkconcurrent",
    });
    const payload = createSignedPayOSWebhook({
      orderId: scenario.order.order_id,
      amount: scenario.expected.totalAmount,
    });
    const responses = await Promise.all([
      request(customerApp).post(webhookPath).send(payload),
      request(customerApp).post(webhookPath).send(payload),
    ]);
    const after = await snapshotPaymentIntegrity(
      prisma,
      scenario.order.order_id,
      scenario.variant.variant_id,
    );

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(
      after.histories.filter(
        (history) => history.new_status === "PendingConfirmation",
      ),
    ).toHaveLength(1);
    expect(after.audits).toHaveLength(1);
    expect(after.payments).toHaveLength(1);
    expect(after.payments[0]?.status).toBe("Success");
  });

  test("PAY-CBK-012 terminal success cannot be reversed by a later failed callback", async () => {
    const scenario = await createPaymentIntegrityScenario(prisma, {
      label: "cbkordering",
    });
    const success = createSignedPayOSWebhook({
      orderId: scenario.order.order_id,
      amount: scenario.expected.totalAmount,
    });
    const failed = createSignedPayOSWebhook({
      orderId: scenario.order.order_id,
      amount: scenario.expected.totalAmount,
      dataCode: "01",
      dataDescription: "Thất bại",
      outerCode: "01",
      outerSuccess: false,
    });
    await request(customerApp).post(webhookPath).send(success);
    const successState = await snapshotPaymentIntegrity(
      prisma,
      scenario.order.order_id,
      scenario.variant.variant_id,
    );
    const lateResponse = await request(customerApp)
      .post(webhookPath)
      .send(failed);
    const finalState = await snapshotPaymentIntegrity(
      prisma,
      scenario.order.order_id,
      scenario.variant.variant_id,
    );

    expect(lateResponse.status).toBe(200);
    expect(finalState).toEqual(successState);
    expect(finalState.payments[0]?.status).toBe("Success");
  });

  test("PAY-CBK-013 a success callback cannot revive or mark a cancelled order paid", async () => {
    const scenario = await createPaymentIntegrityScenario(prisma, {
      label: "cbkcancelledorder",
      orderStatus: "Cancelled",
      paymentStatus: "Cancelled",
    });
    const before = await snapshotPaymentIntegrity(
      prisma,
      scenario.order.order_id,
      scenario.variant.variant_id,
    );
    const response = await request(customerApp)
      .post(webhookPath)
      .send(
        createSignedPayOSWebhook({
          orderId: scenario.order.order_id,
          amount: scenario.expected.totalAmount,
        }),
      );

    expect(response.status).toBe(400);
    expect(
      await snapshotPaymentIntegrity(
        prisma,
        scenario.order.order_id,
        scenario.variant.variant_id,
      ),
    ).toEqual(before);
  });

  test("PAY-CBK-014 paymentLinkId/reference must map to the same stored payment and order", async () => {
    const scenarioA = await createPaymentIntegrityScenario(prisma, {
      label: "cbkcrossrefa",
      transactionRef: "payment-link-a",
    });
    const scenarioB = await createPaymentIntegrityScenario(prisma, {
      label: "cbkcrossrefb",
      transactionRef: "payment-link-b",
    });
    const beforeA = await snapshotPaymentIntegrity(
      prisma,
      scenarioA.order.order_id,
      scenarioA.variant.variant_id,
    );
    const response = await request(customerApp)
      .post(webhookPath)
      .send(
        createSignedPayOSWebhook({
          orderId: scenarioA.order.order_id,
          amount: scenarioA.expected.totalAmount,
          reference: "bank-reference-b",
          paymentLinkId: String(scenarioB.payment.transaction_ref),
        }),
      );

    expect(response.status).toBe(400);
    expect(
      await snapshotPaymentIntegrity(
        prisma,
        scenarioA.order.order_id,
        scenarioA.variant.variant_id,
      ),
    ).toEqual(beforeA);
  });

  test("PAY-CBK-015 order-history failure rolls back payment, paidAt, order, audit and related state", async () => {
    const scenario = await createPaymentIntegrityScenario(prisma, {
      label: "cbkrollback",
      withVoucher: true,
      withCartItem: true,
      shipmentStatus: "Pending",
    });
    const before = await snapshotPaymentIntegrity(
      prisma,
      scenario.order.order_id,
      scenario.variant.variant_id,
    );
    await installPaymentHistoryFailureTrigger(
      prisma,
      scenario.order.order_id,
    );

    try {
      const response = await request(customerApp)
        .post(webhookPath)
        .send(
          createSignedPayOSWebhook({
            orderId: scenario.order.order_id,
            amount: scenario.expected.totalAmount,
          }),
        );
      expect(response.status).toBeGreaterThanOrEqual(400);
    } finally {
      await removePaymentHistoryFailureTrigger(
        prisma,
        scenario.order.order_id,
      );
    }

    expect(
      await snapshotPaymentIntegrity(
        prisma,
        scenario.order.order_id,
        scenario.variant.variant_id,
      ),
    ).toEqual(before);
  });

  test("PAY-CBK-016 unexpected persistence errors return a sanitized public envelope", async () => {
    const scenario = await createPaymentIntegrityScenario(prisma, {
      label: "cbksanitize",
    });
    await installPaymentHistoryFailureTrigger(
      prisma,
      scenario.order.order_id,
    );
    let response;

    try {
      response = await request(customerApp)
        .post(webhookPath)
        .send(
          createSignedPayOSWebhook({
            orderId: scenario.order.order_id,
            amount: scenario.expected.totalAmount,
          }),
        );
    } finally {
      await removePaymentHistoryFailureTrigger(
        prisma,
        scenario.order.order_id,
      );
    }

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      success: false,
      message: "Xử lý thanh toán thất bại",
    });
    expectSafeErrorBody(response.body);
  });

  test("PAY-CBK-017 unsigned PayOS dashboard sample shape cannot bypass signature verification", async () => {
    mockRejectedAsyncVerification();
    const response = await request(customerApp)
      .post(webhookPath)
      .send({
        code: "00",
        desc: "success",
        success: true,
        data: {
          orderCode: 123,
          amount: 3000,
          description: "VQRIO123",
          reference: "TF230204212323",
        },
        signature: "invalid-dashboard-signature",
      });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ success: false });
  });
});
