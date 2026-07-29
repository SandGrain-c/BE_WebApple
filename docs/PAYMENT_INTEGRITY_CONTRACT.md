# Payment Integrity Contract

## 1. Phạm vi và nguồn bằng chứng

Tài liệu này mô tả luồng thanh toán online đang tồn tại trong Backend tại commit `08559ca` trên nhánh `test/backend-payment-integrity`. Nguồn được đối chiếu gồm Customer composition root, checkout/order service, payment routes/controllers/services/DTO/mapper, Prisma schema, frontend payment success/cancel pages và các integration test trong `tests/api/payment/`.

Gateway thực tế là **PayOS**, qua package `@payos/node` phiên bản khai báo `^2.0.5`. Không tìm thấy VNPay, MoMo, Stripe, PayPal hoặc một gateway online khác trong flow được kiểm tra.

Thuật ngữ trong tài liệu:

- **Current implementation**: hành vi code hiện tại thực sự thể hiện hoặc test đã tái hiện.
- **Expected secure contract**: contract an toàn mà integration/security test yêu cầu.
- **Known drift**: chênh lệch đã được static trace hoặc execution xác nhận.

## 2. Current implementation

### 2.1 Khởi tạo Order online

`POST /api/orders/checkout` là điểm tạo Order trước khi khởi tạo link PayOS. Route yêu cầu Customer authentication.

Với `paymentMethod: "OnlineBanking"`:

- Backend lấy owner từ authenticated request.
- Backend lấy address, selected cart items, variant price, stock và voucher từ PostgreSQL.
- Shipping fee hiện được đặt cố định bằng `0`.
- Order được tạo với `order_status = "PendingPayment"`.
- Payment được tạo với `gateway = "payOS"`, `payment_type = "Payment"`, `status = "Pending"`, `paid_at = null`.
- Payment amount bằng authoritative `orders.total_amount`.
- Order detail, stock decrement, voucher usage, payment, status history và xóa selected cart items nằm trong transaction checkout.
- Lời gọi tạo link PayOS xảy ra **sau** transaction checkout, không nằm trong cùng transaction với việc tạo Order.

### 2.2 Endpoint PayOS thực tế

| Method | Endpoint | Authentication | Chức năng hiện tại |
| --- | --- | --- | --- |
| `GET` | `/api/payment-transactions/payos/webhook` | Public | Health response cho webhook URL; không đọc hoặc mutate payment. |
| `POST` | `/api/payment-transactions/payos/webhook` | Public; dự kiến xác thực bằng PayOS signature | Nhận callback và cập nhật payment/order. |
| `POST` | `/api/payment-transactions/payos/orders/:orderId/create-link` | `authMiddleware` | Tạo hoặc trả lại link PayOS cho Order thuộc Customer hiện tại. |
| `GET` | `/api/payment-transactions/payos/orders/:orderId/status` | `authMiddleware` | Đọc trạng thái Order và PayOS payment thuộc Customer hiện tại. |
| `GET` | `/api/payment-transactions/orders/:orderId` | `authMiddleware` | Đọc các payment transaction của owned Order. |
| `GET` | `/api/payment-transactions/:transactionId` | `authMiddleware` | Đọc một owned payment transaction. |

Admin payment routes được mount ở `/api/admin/payment-transactions` và dùng Admin authentication cùng role middleware hiện tại. Luồng đó không phải callback/initiation contract và không bị thay đổi trong giai đoạn test-first này.

### 2.3 Payment initialization

#### Request

`POST /api/payment-transactions/payos/orders/:orderId/create-link`

- `orderId` nằm trong path.
- Controller dùng `Number(req.params.orderId)` rồi từ chối giá trị falsy hoặc `<= 0`.
- Request body không phải input của service; các field như `amount`, `userId`, `status`, `paidAt`, `transactionRef`, `gatewayResponse` và `orderStatus` bị bỏ qua.
- Owner được lấy từ JWT đã được authentication middleware refresh từ database.

Service tìm một Order thỏa cả `order_id = orderId` và `user_id = currentUserId`, sau đó yêu cầu:

- `order_status` phải là `PendingPayment`;
- phải có payment mới nhất với `gateway = "payOS"` và `payment_type = "Payment"`;
- payment chưa ở `Success`.

Gateway request hiện tại chứa:

- `orderCode`: numeric database `order_id`;
- `amount`: `Math.round(Number(order.total_amount))`;
- `description`: `DH{orderId}`;
- `items`: tên variant/product, quantity và rounded unit price từ Order detail;
- `buyerName`, `buyerPhone`: snapshot trên Order;
- `returnUrl`, `cancelUrl`: URL cấu hình cộng query `orderId`.

Không có field currency trong request được build ở source. Theo integration hiện tại, amount được xử lý như số nguyên VND.

#### Success response

```json
{
  "success": true,
  "message": "Tạo mã QR thanh toán PayOS thành công",
  "data": {
    "orderId": 1,
    "orderCode": "ORDER-CODE",
    "amount": 2000,
    "paymentLinkId": "gateway-link-id",
    "checkoutUrl": "https://gateway.example/...",
    "qrCode": "...",
    "status": "PENDING"
  }
}
```

Sau khi gateway trả về, service update payment hiện có:

- `transaction_ref = paymentLink.paymentLinkId`, fallback sang string `order_id`;
- `gateway_response = JSON.stringify(paymentLink)`;
- không tạo payment row mới.

Nếu stored `gateway_response` đã parse được và có `checkoutUrl`, request tuần tự tiếp theo trả lại link cũ mà không gọi gateway lần nữa.

#### Error response

Mọi exception trong controller hiện bị map thành HTTP `400`:

```json
{
  "success": false,
  "message": "<raw Error.message>"
}
```

Order không tồn tại và Order của Customer khác cùng trả `400 "Không tìm thấy đơn hàng"` ở endpoint PayOS này. Hai trường hợp không làm lộ dữ liệu khác nhau, nhưng khác canonical 404 đang dùng ở Customer payment read.

### 2.4 Payment status

`GET /api/payment-transactions/payos/orders/:orderId/status` dùng cùng ownership lookup và trả:

```json
{
  "success": true,
  "message": "Lấy trạng thái thanh toán PayOS thành công",
  "data": {
    "orderId": 1,
    "orderCode": "ORDER-CODE",
    "orderStatus": "PendingPayment",
    "paymentStatus": "Pending",
    "amount": 2000,
    "paidAt": null
  }
}
```

Customer khác không đọc được dữ liệu, nhưng actual status là `400` thay vì canonical IDOR-safe `404`.

### 2.5 Return và cancel URL

Environment names được dùng:

- `PAYOS_CLIENT_ID`
- `PAYOS_API_KEY`
- `PAYOS_CHECKSUM_KEY`
- `PAYOS_RETURN_URL`
- `PAYOS_CANCEL_URL`

Không ghi giá trị credential hoặc secret trong tài liệu này.

Fallback browser URLs:

- `http://localhost:3000/checkout/payment-success?orderId={orderId}`
- `http://localhost:3000/checkout/payment-cancel?orderId={orderId}`

Không tìm thấy Backend return handler riêng, redirect handler hoặc endpoint nhận browser query để mutate payment. Frontend success/cancel page chỉ hiển thị trạng thái từ query `orderId`; query browser không tự đánh dấu payment thành công. Vì vậy đây là browser destination, không phải nguồn xác thực payment.

### 2.6 Webhook request và response

`POST /api/payment-transactions/payos/webhook` là public vì PayOS không gửi Customer JWT. Envelope được code/tests sử dụng có dạng:

```json
{
  "code": "00",
  "desc": "success",
  "success": true,
  "data": {
    "orderCode": 1,
    "amount": 2000,
    "description": "DH1",
    "reference": "gateway-reference",
    "paymentLinkId": "gateway-link-id",
    "currency": "VND",
    "code": "00",
    "desc": "success"
  },
  "signature": "<HMAC>"
}
```

Production service thực hiện ý định verify bằng:

```text
payOS.webhooks.verify(payload)
```

PayOS Node SDK v2 trả Promise, nhưng current service không `await` Promise này. Sau đó code fallback về `payload.data`. Kết quả là verification rejection không chặn mutation, như integration test đã xác nhận.

Theo [PayOS signature documentation](https://payos.vn/docs/tich-hop-webhook/kiem-tra-du-lieu-voi-signature/), signature dùng HMAC-SHA256 với checksum key, trên canonical `data` có key được sắp xếp alphabetically và ghép dạng `key=value&...`. Test helper tạo signature độc lập theo contract này và dùng test-only checksum key; không gọi production signing helper để tự xác nhận cùng một lỗi.

Current controller còn:

- trả `200` cho body rỗng hoặc `{ "test": true }`;
- trả `200` cho một dashboard sample shape cố định dù signature không hợp lệ;
- log toàn bộ webhook body và “verified data”.

Success response:

```json
{
  "success": true,
  "message": "Xử lý webhook PayOS thành công",
  "data": {
    "received": true,
    "orderId": 1,
    "transactionId": 1,
    "message": "Xử lý webhook PayOS thành công"
  }
}
```

Sequential replay sau khi payment đã `Success` trả `200` với message `"Webhook đã được xử lý trước đó"`.

Error hiện trả HTTP `400` và raw `Error.message`.

### 2.7 Callback lookup, amount và currency

Webhook service:

1. Coerce `orderCode` bằng `Number(...)`.
2. Coerce `amount` bằng `Number(...)`.
3. Tìm Order **chỉ bằng** `orders.order_id = orderCode`.
4. Chọn payment mới nhất của Order có gateway `payOS`, type `Payment`.
5. So sánh coerced amount với `Math.round(Number(order.total_amount))`.

Hệ quả current implementation:

- Amount nhỏ hơn, lớn hơn, zero, negative và decimal khác authoritative total bị từ chối.
- Numeric string và single-element numeric array có thể qua `Number(...)`.
- Currency không được kiểm tra.
- `reference`/`paymentLinkId` không được đối chiếu với stored `transaction_ref`.
- Không có mapping bắt buộc giữa gateway reference, payment và Order.

### 2.8 Payment và Order state

Payment status type ở application layer:

```text
Pending | Success | Failed | Cancelled
```

Relevant Order states:

```text
PendingPayment → PendingConfirmation
```

Current webhook không map gateway failed/cancelled outcome. Mọi callback đi qua validation order/amount đều được xử lý như success:

- payment `status = "Success"`;
- `paid_at = now`;
- raw callback được ghi vào `gateway_response`;
- nếu Order là `PendingPayment`, Order thành `PendingConfirmation`;
- tạo một Order status history;
- tạo audit event `PAYOS_WEBHOOK_PAYMENT_SUCCESS`.

Nếu Order đã `Cancelled`, service vẫn có thể đánh payment thành `Success` và set `paid_at`, nhưng không đổi Order status. Đây là trạng thái payment/order không nhất quán.

Terminal payment `Success` được giữ nguyên trước callback đến trễ vì service return sớm. Failed hoặc Cancelled payment hiện không terminal và callback sau có thể chuyển thành Success.

### 2.9 Transaction, stock và side effect

Payment update, optional Order update, status history và audit log nằm trong một Prisma transaction. Integration test dùng database constraint failure đã xác nhận rollback đồng thời:

- payment status;
- `paid_at`;
- Order status;
- history;
- audit.

Webhook không:

- decrement stock;
- tạo voucher usage;
- xóa cart;
- tạo Order hoặc Order detail;
- mutate shipment.

Các side effect đó đã xảy ra trong checkout transaction. Valid callback test xác nhận chúng không bị lặp.

### 2.10 Duplicate và concurrency

- **Sequential duplicate initialization:** current stored `checkoutUrl` được reuse; pass.
- **Concurrent duplicate initialization:** hai request đều có thể thấy chưa có link và gọi gateway hai lần; payment row vẫn chỉ có một.
- **Sequential duplicate success callback:** return sớm khi status đã Success; không lặp history/audit; pass.
- **Concurrent duplicate success callback:** hai request có thể cùng đọc Pending và cùng thực hiện transition, tạo hai history/audit event.
- Không có gateway event ID hoặc replay key được persist/claim atomically.
- `transaction_ref` có unique constraint khi non-null, nhưng callback không dùng field này để lookup hay claim event.

### 2.11 Customer data exposure

Customer ownership/IDOR lookup cho payment list/detail hiện đúng: query ràng buộc Order owner và trả 404 khi không thuộc Customer.

Tuy nhiên `mapPaymentTransactionToDto` trả nguyên `gateway_response` dưới field `gatewayResponse`. Nếu stored payload có internal trace hoặc signature, Customer nhận được dữ liệu đó. Response còn có Order customer snapshot fields theo mapper hiện tại.

## 3. Expected secure contract

### 3.1 Initialization

- Authentication phải chạy trước lookup.
- Order lookup phải ràng buộc `orderId + currentUserId`.
- Nonexistent và cross-owner nên có cùng IDOR-safe `404`.
- Chỉ OnlineBanking/PayOS Order hợp lệ ở `PendingPayment` được khởi tạo.
- Amount, payment status, transaction reference, gateway response, owner và Order status phải do Backend/database quyết định.
- Gateway amount phải là authoritative integer VND amount từ Order/payment.
- Sequential và concurrent initialization phải không tạo nhiều external payment links cho cùng logical payment; cần atomic claim/idempotency key hoặc gateway-supported uniqueness.
- Unexpected gateway failure phải trả generic `500` và không lộ credential/config/error nội bộ.

### 3.2 Webhook authenticity và validation

- Mọi business webhook phải có signature hợp lệ; không có unsigned mutation path.
- Phải `await payOS.webhooks.verify(payload)` theo SDK v2. Dùng verified result duy nhất; không fallback về unsigned `payload.data`.
- Nếu tự verify, canonicalization phải đúng specification và comparison nên constant-time. Ưu tiên SDK để tránh tự triển khai cryptography.
- Runtime type phải strict trước conversion: `orderCode` và `amount` phải là finite positive integers theo contract; không chấp nhận string, boolean, null, object hoặc array.
- Currency phải là expected currency (`VND`) nếu gateway payload cung cấp/contract yêu cầu.
- `orderCode`, `paymentLinkId`/reference và stored payment phải cùng map về một Order/payment.
- Không tin outer/client-controlled success/status nếu signature hoặc canonical verified data không xác nhận outcome.

### 3.3 State, replay và consistency

- Gateway success mới có thể chuyển Payment sang Success.
- Failed/cancelled outcome phải được map có chủ đích; không tự suy đoán Order cancellation.
- Terminal Success không được đảo ngược bởi callback đến trễ.
- Callback cho Order đã Cancelled phải bị từ chối hoặc đi vào một explicit reconciliation/refund state; không để `Order=Cancelled, Payment=Success` âm thầm.
- Sequential và concurrent replay phải tạo tối đa một success transition, history và audit.
- Idempotency phải được enforce atomically trong database transaction, không chỉ bằng read-before-write ngoài transaction.
- Callback không được lặp checkout side effects.

### 3.4 Error và response exposure

- Business validation errors dùng typed status/message có kiểm soát.
- Unexpected dependency/database errors trả generic `500`, không trả raw exception.
- Không log full callback/signature/credential; structured log phải redact dữ liệu nhạy cảm.
- Customer DTO không trả raw `gateway_response`, signature hoặc private gateway metadata.
- Browser return/cancel query chỉ dùng để hiển thị/refresh server-authoritative status, không được mutate payment.

## 4. Known contract drift

| ID | Drift đã xác nhận | Evidence | Mức ảnh hưởng |
| --- | --- | --- | --- |
| PI-DRIFT-001 | SDK verification Promise không được `await`; unsigned/invalid-signature payload có thể mutate payment/order. | Execution confirmed: PAY-CBK-001/002/004/017. | Critical |
| PI-DRIFT-002 | Controller chấp nhận body rỗng, `{test:true}` và dashboard sample bằng HTTP 200 thay vì tách health verification khỏi business webhook. | Execution confirmed. | High |
| PI-DRIFT-003 | `Number(...)` coercion cho callback amount/orderCode chấp nhận runtime type không hợp lệ. | Execution confirmed: PAY-CBK-006. | High |
| PI-DRIFT-004 | Currency bị bỏ qua. | Execution confirmed: PAY-CBK-007. | High |
| PI-DRIFT-005 | Gateway reference/paymentLinkId không được map với stored payment và Order. | Execution confirmed: PAY-CBK-004/014. | High |
| PI-DRIFT-006 | Failed/cancelled callback bị ghi thành Success và có `paid_at`. | Execution confirmed: PAY-CBK-009. | High |
| PI-DRIFT-007 | Success callback có thể đánh payment của cancelled Order thành Success. | Execution confirmed: PAY-CBK-013. | High |
| PI-DRIFT-008 | Concurrent callback tạo duplicate history/audit; concurrent initialization gọi gateway hai lần. | Execution confirmed: PAY-CBK-011, PAY-INIT-009. | High |
| PI-DRIFT-009 | Unexpected gateway/database errors trả HTTP 400 cùng raw error message. | Execution confirmed: PAY-INIT-010, PAY-CBK-016. | High |
| PI-DRIFT-010 | PayOS initiation/status cross-owner được bảo vệ nhưng trả 400 thay vì canonical IDOR-safe 404. | Execution confirmed: PAY-INIT-003/011. | Medium |
| PI-DRIFT-011 | Customer payment detail trả raw stored gateway response. | Execution confirmed: PAY-INIT-012. | High |
| PI-DRIFT-012 | Production log ghi full webhook body và verified data. | Static confirmed. | High |

## 5. Implementation completeness

Luồng online payment **đã được triển khai một phần đáng kể**: checkout tạo payment, PayOS link initialization, browser return/cancel destination, status lookup, webhook success transaction và customer/admin payment reads đều tồn tại.

Tuy nhiên callback authenticity, outcome mapping, cross-reference binding, concurrent idempotency, error sanitization và response/log redaction chưa đạt secure payment contract. Vì vậy không thể coi online payment integrity là production-ready dù valid happy path và transaction rollback cơ bản đã hoạt động.
