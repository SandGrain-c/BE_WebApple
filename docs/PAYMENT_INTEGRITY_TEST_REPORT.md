# Payment Integrity Integration Test Report

## 1. Executive summary

Audit test-first được thực hiện trên nhánh `test/backend-payment-integrity`, commit trước khi thay đổi `08559ca`.

- Gateway phát hiện: **PayOS** (`@payos/node ^2.0.5`).
- Baseline trước test mới: **209/209 pass**, build pass, TypeScript pass.
- Payment integrity suite mới: **29 tests**, **13 pass**, **16 fail**.
- Hai lượt chạy độc lập fail đúng cùng 16 test ID; không có dấu hiệu flaky.
- Full regression: **222 pass / 16 fail / 238 total**.
- Suy ra toàn bộ **209 test cũ vẫn pass** trong full run; các suite cũ cũng pass khi chạy riêng.
- Production source không được sửa trong tác vụ này. Hai file Admin Order đang modified là thay đổi có sẵn trước task và không thuộc payment work.

Các failure mới được giữ đỏ có chủ đích vì tái hiện product/security defects. Không nới expected result, không skip test và không mock Prisma.

## 2. Environment và artifacts

| Item | Value |
| --- | --- |
| Node | `v22.14.0` |
| npm | `10.9.2` |
| Docker | `28.5.1` |
| PostgreSQL test image/runtime | PostgreSQL `16.14`, Testcontainers |
| Branch | `test/backend-payment-integrity` |
| Baseline commit | `08559ca` |

Files của giai đoạn:

- `tests/factories/payment-integrity.factory.ts`
- `tests/api/payment/payment-initialization.integration.test.ts`
- `tests/api/payment/payment-callback.integration.test.ts`
- `docs/PAYMENT_INTEGRITY_CONTRACT.md`
- `docs/PAYMENT_INTEGRITY_TEST_REPORT.md`
- `package.json`: thêm script `test:payment-integrity`

Script:

```text
NODE_ENV=test vitest run tests/api/payment
```

Factory tạo namespace deterministic riêng cho từng scenario và trả manifest ID runtime; không hard-code auto-increment ID, role ID, password, JWT hoặc credential. Test dùng Express Customer app, Prisma thật và một PostgreSQL 16 Testcontainer duy nhất cho mỗi run. Gateway create được thay bằng test boundary spy để không gọi PayOS/external account; Prisma không bị mock.

Signature helper trong factory dùng HMAC-SHA256 độc lập theo [PayOS canonical signature specification](https://payos.vn/docs/tich-hop-webhook/kiem-tra-du-lieu-voi-signature/) với test-only checksum key. Test không gọi production signing helper. Những case invalid signature dùng rejected async SDK boundary có rejection được consume trong test runner để tái hiện lỗi production thiếu `await` mà không tạo unhandled-rejection noise.

## 3. Stable run comparison

| Run | Database | Result | Cleanup |
| --- | --- | --- | --- |
| Payment run 1 | `webapple_test_4a81d6f8` | 13 pass / 16 fail / 29 total | Container destroyed |
| Payment run 2 | `webapple_test_d4eda930` | 13 pass / 16 fail / 29 total | Container destroyed |
| Full regression | `webapple_test_808c76be` | 222 pass / 16 fail / 238 total | Container destroyed |

Logs:

- `/tmp/payment-integrity-run-1.log`
- `/tmp/payment-integrity-run-2.log`
- `/tmp/payment-integrity-full-regression.log`

Hai payment runs có cùng failure IDs:

```text
PAY-INIT-003
PAY-INIT-009
PAY-INIT-010
PAY-INIT-011
PAY-INIT-012
PAY-CBK-001
PAY-CBK-002
PAY-CBK-004
PAY-CBK-006
PAY-CBK-007
PAY-CBK-009
PAY-CBK-011
PAY-CBK-013
PAY-CBK-014
PAY-CBK-016
PAY-CBK-017
```

## 4. Passing coverage

### Initialization

- `PAY-INIT-001`: missing/invalid tokens bị từ chối trước payment lookup.
- `PAY-INIT-002`: locked Customer bị từ chối.
- `PAY-INIT-004`: malformed path IDs trả controlled 400.
- `PAY-INIT-005`: cancelled, completed, COD và non-pending Orders không eligible.
- `PAY-INIT-006`: payment đã Success không được initialize lại.
- `PAY-INIT-007`: authoritative Order/payment amount thắng mọi body mass-assignment field; gateway nhận đúng amount.
- `PAY-INIT-008`: duplicate tuần tự reuse một stored gateway link và không tạo thêm payment.

### Callback

- `PAY-CBK-003`: valid signed success cập nhật payment, `paid_at`, Order, history và audit trong transaction; không lặp stock/voucher/cart/order detail side effect.
- `PAY-CBK-005`: lower/higher/zero/negative/decimal mismatched amount bị từ chối, database không mutate.
- `PAY-CBK-008`: unknown outer envelope field không thay đổi canonical signed data.
- `PAY-CBK-010`: sequential duplicate success callback idempotent.
- `PAY-CBK-012`: Success terminal không bị callback Failed đến sau đảo ngược.
- `PAY-CBK-015`: failure giữa transaction rollback payment, `paid_at`, Order, history, audit và related state.

## 5. Failure findings

| Test ID | Expected | Actual | Severity | Root-cause hypothesis | Business/security risk |
| --- | --- | --- | --- | --- | --- |
| `PAY-INIT-003` | Nonexistent và cross-owner Order cùng trả IDOR-safe 404; không mutation. | Cả hai trả 400; database không mutation. | Medium | Controller map mọi service error thành 400; ownership lookup vẫn ràng buộc user. | Không lộ Order khác, nhưng contract/error semantics không nhất quán và khó phân biệt validation với not-found. |
| `PAY-INIT-009` | Hai concurrent init gọi gateway một lần và giữ một payment/link. | Cả hai trả 200, gateway create được gọi 2 lần; DB vẫn có một payment. | High | Read-before-call không có atomic claim/lock/idempotency key. | Tạo duplicate external payment link/request, trạng thái link lưu cuối cùng không xác định, tăng rủi ro reconciliation. |
| `PAY-INIT-010` | Unexpected gateway failure trả generic HTTP 500; DB không mutation. | HTTP 400 với raw message `controlled gateway credential failure`; DB không mutation. | High | Controller trả raw `Error.message` và hard-code status 400. | Lộ chi tiết dependency/configuration, sai monitoring/retry semantics. |
| `PAY-INIT-011` | Auth failures 401; cross-owner status lookup 404; owner 200. | `[401,401,401,400,200]`; cross-owner là 400. | Medium | Cùng error mapping 400 của PayOS controller. | Ownership được bảo vệ nhưng contract drift làm client/error telemetry sai. |
| `PAY-INIT-012` | Customer payment detail không chứa raw private gateway payload/signature. | HTTP 200 trả `gatewayResponse` chứa `private-gateway-payload` và `private-signature`. | High | Shared mapper expose nguyên `gateway_response`. | Information disclosure cho Customer; payload gateway có thể chứa internal metadata/signature không cần thiết. |
| `PAY-CBK-001` | Empty, `{test:true}` và unsigned nonempty bodies đều 400; không mutation. | Status `[200,200,200]`; unsigned valid-looking payload có thể đưa Payment thành Success và Order thành PendingConfirmation. | Critical | Controller có test bypass; service không await async verification rồi fallback về `payload.data`. | Unauthenticated payment confirmation/state mutation. |
| `PAY-CBK-002` | Blank/wrong signatures trả 400; payment/order không đổi. | Cả hai trả 200 và Payment thành Success. | Critical | `payOS.webhooks.verify()` trả Promise nhưng không được await; rejection không chặn flow. | Signature authentication bị bypass trực tiếp. |
| `PAY-CBK-004` | Payload bị sửa sau ký ở amount/order/reference đều 400, không mutation. | Amount mismatch và nonexistent order trả 400; changed reference trả 200 và mutate. | Critical | Signature không được enforce; amount/order tình cờ bị DB checks chặn, reference hoàn toàn không được bind. | Attacker có thể thay reference hoặc dùng payload không xác thực để xác nhận payment nếu amount/order khớp. |
| `PAY-CBK-006` | Numeric string và array amount trả 400; Payment giữ Pending. | Cả hai trả 200 và Payment thành Success. | High | `Number(webhookData.amount)` coercion trước runtime type validation. | Type confusion làm yếu canonical validation và mở đường cho payload không đúng gateway contract. |
| `PAY-CBK-007` | Signed non-VND callback trả 400, không mutation. | HTTP 200 và Payment thành Success. | High | Currency không được validate hoặc persist/match. | Sai currency/unit có thể được ghi nhận như đã thanh toán đúng số tiền. |
| `PAY-CBK-009` | Gateway Failed/Cancelled map lần lượt sang Payment Failed/Cancelled; Order giữ PendingPayment, `paid_at=null`. | Cả hai trả 200, Payment Success, có `paid_at`, Order PendingConfirmation. | Critical | Service bỏ qua outcome `code`/`success`/data status và xử lý mọi amount-matching callback như success. | Đơn thất bại/hủy tại gateway vẫn được ghi nhận đã thanh toán và tiếp tục fulfillment. |
| `PAY-CBK-011` | Hai callback success đồng thời tạo đúng một transition/history/audit. | Có 2 PendingConfirmation history rows; test dừng tại history assertion, code path cũng cho phép duplicate audit. | High | Idempotency là non-atomic read-before-transaction; update không có conditional status claim. | Duplicate side effects/audit inconsistency khi gateway retry đồng thời. |
| `PAY-CBK-013` | Success callback cho cancelled Order trả 400; Order/payment không đổi. | HTTP 200; Order vẫn Cancelled nhưng Payment thành Success và có `paid_at`. | Critical | Service chỉ conditionalize Order transition, không validate current Order state trước Payment success update. | Financial/order inconsistency; paid cancelled Order không có explicit refund/reconciliation path. |
| `PAY-CBK-014` | Order code của A với paymentLinkId/reference của B trả 400; cả hai payment không đổi. | HTTP 200; Payment của Order A thành Success. | High | Lookup chỉ dựa trên orderCode; latest PayOS payment được chọn mà không match stored `transaction_ref`. | Cross-payment confusion và reconciliation sai; một signed/misbound reference không định danh đúng transaction. |
| `PAY-CBK-016` | Unexpected persistence error trả generic HTTP 500; toàn bộ DB rollback. | HTTP 400 với raw `controlled payos history failure`; rollback vẫn thành công. | High | Transaction đúng nhưng controller map mọi error thành raw 400. | Lộ database/business internals và làm gateway retry/monitoring hiểu sai lỗi transient. |
| `PAY-CBK-017` | Unsigned dashboard sample shape trả 400. | HTTP 200 success envelope. | High | Controller có hard-coded bypass theo orderCode `123`, amount `3000`, reference cố định. | Public unsigned bypass path và contract webhook không fail closed. |

Root cause được ghi là hypothesis khi phụ thuộc gateway behavior bên ngoài; các hành vi HTTP/DB nêu trên là execution confirmed. Đặc biệt, thiếu `await`, fallback unsigned data, runtime coercion, missing reference/currency check và raw error mapping đều được static trace trực tiếp trong source.

## 6. Signature analysis

PayOS SDK v2 cung cấp async `webhooks.verify(payload)`. Current service gán Promise vào `verifiedData` mà không `await`. Optional property reads trên Promise không có `orderCode`/`data`, nên code rơi xuống `payload.data`. Async rejection không đi qua synchronous `try/catch`.

Đây là finding nghiêm trọng nhất:

- missing, blank và wrong signature không fail closed;
- tampering reference sau ký không bị phát hiện;
- unsigned callback có đúng Order ID và amount có thể mutate payment/order;
- dashboard sample còn có bypass riêng.

Secure fix scope nên giới hạn ở việc await SDK verification, chỉ dùng verified data, strict envelope/data validation và xóa business mutation bypass. Không nên viết crypto tùy biến nếu SDK đã cung cấp verifier.

## 7. Amount-authority analysis

Điểm đang đúng:

- Initialization lấy amount từ `orders.total_amount`, bỏ qua body amount.
- Payment row amount không bị request initialization thay đổi.
- Callback so sánh amount với authoritative rounded Order total.
- Lower, higher, zero, negative và mismatched decimal không mutate database.

Drift:

- `Number(...)` chấp nhận numeric string và single-element array.
- Currency không được kiểm tra.
- Callback so với Order total nhưng không đối chiếu stored payment amount và gateway reference đồng thời.

Khuyến nghị: strict number/integer validation trước conversion, xác nhận VND, và bind `orderCode + paymentLinkId/reference + stored payment + amount` trong cùng decision.

## 8. Duplicate, replay và initialization concurrency

Sequential duplicate init và sequential duplicate callback đang hoạt động. Tuy nhiên cả hai dựa trên read-before-write:

- concurrent init gọi external gateway hai lần;
- concurrent callback tạo duplicate status histories/audits.

Unique nullable `transaction_ref` không đủ vì callback không lookup/claim reference. Secure contract cần atomic conditional update hoặc persisted idempotency/event key trong transaction. Không cần rewrite toàn payment flow; cần bảo vệ điểm claim.

## 9. Callback ordering

- Success rồi Failed: pass, vì Success return sớm.
- Success rồi Cancelled: cùng terminal-success guard hiện tại sẽ không đảo ngược.
- Failed/Cancelled payment rồi Success: current code cho phép chuyển Success; chấp nhận hay không phải dựa trên verified final gateway outcome.
- Failed/Cancelled gateway outcome trên Pending payment: đang bị map sai thành Success.
- Cancelled Order rồi Success: tạo `Order=Cancelled, Payment=Success`, không có reconciliation state; fail.

Không có timeout callback mapping riêng được phát hiện trong PayOS webhook service.

## 10. Transaction and rollback analysis

`PAY-CBK-015` xác nhận transaction boundary hiện tại bảo vệ:

- Payment status và `paid_at`;
- Order transition;
- Order history;
- audit log.

Stock, voucher usage, selected cart deletion và Order detail đã được xử lý tại checkout; callback không lặp chúng. Valid success và rollback tests xác nhận các related state không đổi.

Transaction không nên bị viết lại toàn bộ. Scope phù hợp là thêm verified/typed preconditions trước transaction và atomic idempotency claim bên trong transaction.

Initialization có boundary khác: Order/payment checkout commit trước external PayOS create. Nếu gateway create fail, Order PendingPayment vẫn tồn tại để retry; integration test initialization chỉ xác nhận không mutate payment link fields trong request thất bại.

## 11. Error sanitization

Initialization và callback controllers đều trả mọi exception thành HTTP 400 với raw `Error.message`. Test xác nhận:

- gateway dependency error bị lộ;
- controlled persistence error bị lộ;
- unexpected server failures không dùng 500/generic envelope.

Production webhook controller còn log full request body và verified data. Đây là static-confirmed exposure risk vì callback có signature/reference và gateway metadata. Cần typed business errors, generic unexpected 500 response và structured redacted logging.

## 12. Order-payment consistency

Happy path đúng:

```text
Order PendingPayment + Payment Pending
→ verified success
→ Order PendingConfirmation + Payment Success + paid_at + one history/audit
```

Nhưng current implementation chưa bảo đảm:

- verified success thực sự;
- gateway outcome là success;
- currency/reference thuộc đúng payment;
- cancelled Order không bị marked paid;
- concurrent transition chỉ xảy ra một lần.

Vì vậy core success transaction đúng về atomicity nhưng precondition/state-machine integrity chưa an toàn.

## 13. Return URL và missing implementation

Không có Backend return/cancel endpoint. PayOS được cấu hình redirect browser đến frontend success/cancel page với `orderId`. Frontend query không mutate database, nên việc sửa query `status=success` không tự làm Payment thành công.

Các phần chưa tìm thấy:

- server-side return handler;
- active verification/polling từ return page ngoài status endpoint hiện có;
- persisted gateway event ID/replay ledger;
- explicit mapping cho failed/cancelled/pending PayOS outcomes;
- currency persistence/validation;
- refund/reconciliation state cho paid callback đến sau Order cancellation.

Đây không phải lý do phát minh endpoint trong test-first phase; chúng được ghi là implementation gaps.

## 14. Regression results

| Command | Result |
| --- | --- |
| Baseline `npm test` | 209/209 pass |
| Baseline `npm run build` | Pass |
| Baseline `npx tsc --noEmit` | Pass |
| `npm run test:order-lifecycle` | 35/35 pass |
| `npm run test:checkout-cod` | 40/40 pass |
| `npm run test:catalog` | 29/29 pass |
| `npm run test:cart-address` | 21/21 pass |
| `npm run test:auth` | 28/28 pass |
| `npm run test:rbac-idor` | 45/45 pass |
| Full `npm test` sau test mới | 222 pass / 16 fail / 238 total |
| Final `npm run build` | Pass |
| Final `npx tsc --noEmit` | Pass |

Các suite độc lập trên dùng database Testcontainers mới và container được destroy sau run. Full suite chứng minh 209 test cũ vẫn pass; 16 failures đều thuộc hai file payment integrity mới.

## 15. Limitations

- Không gọi PayOS thật và không dùng production account/credential. External `paymentRequests.create` được thay tại gateway boundary bằng deterministic spy; payload gửi tới boundary vẫn được assert.
- Signature valid được tạo độc lập theo documented PayOS HMAC contract bằng test-only secret. Invalid-signature async behavior được mô phỏng ở SDK boundary để không cần network.
- Không kiểm thử gateway delivery infrastructure, DNS/TLS hoặc dashboard configuration.
- Không kiểm thử một Backend return endpoint vì endpoint đó không tồn tại.
- Không thay đổi production implementation; các finding vẫn hiện hữu sau test run.
