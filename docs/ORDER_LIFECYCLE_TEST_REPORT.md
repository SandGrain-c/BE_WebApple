# ORDER LIFECYCLE TEST REPORT

Ngày báo cáo: 2026-07-29  
Branch: `test/backend-order-lifecycle`  
Baseline commit: `0a4421512b34ba65f9514b2af3e3f09570533acb`

## 1. Evidence

Đã đối chiếu:

- `tests/api/order/customer-order.integration.test.ts`
- `tests/api/order/customer-order-cancellation.integration.test.ts`
- `tests/api/order/admin-order-status.integration.test.ts`
- `tests/factories/order-lifecycle.factory.ts`
- Customer/Admin routes, controllers, DTOs và services liên quan Order.
- `prisma/schema.prisma`.
- `/tmp/order-lifecycle-run-1.log`.
- `/tmp/order-lifecycle-run-2.log`.
- `/tmp/order-lifecycle-full-regression.log`.

Không sửa test expectation hoặc production implementation.

## 2. Test summary

```text
Order lifecycle:
35 total
23 pass
12 fail

Full Backend:
209 total
197 pass
12 fail

Existing baseline:
174/174 pass
```

| Suite file | Total | Pass | Fail |
| --- | ---: | ---: | ---: |
| Customer list/detail | 10 | 5 | 5 |
| Customer cancellation | 9 | 7 | 2 |
| Admin status | 16 | 11 | 5 |
| **Total** | **35** | **23** | **12** |

## 3. Stable runs

| Evidence | Test database | PostgreSQL | Result | Cleanup |
| --- | --- | --- | --- | --- |
| `order-lifecycle-run-1.log` | `webapple_test_072bc734` | 16.14 | 23 pass / 12 fail / 35 | Container destroyed |
| `order-lifecycle-run-2.log` | `webapple_test_d73477bc` | 16.14 | 23 pass / 12 fail / 35 | Container destroyed |
| `order-lifecycle-full-regression.log` | `webapple_test_b1d4463f` | 16.14 | 197 pass / 12 fail / 209 | Container destroyed |

Hai run độc lập fail đúng cùng 12 Test ID với cùng HTTP/DB outcome. Full
regression cũng chỉ fail cùng 12 case mới. Vì 23 test mới pass và full suite có
197 pass, toàn bộ 174 test baseline vẫn pass.

## 4. Full failure table

| Test ID | Test name | Expected | Actual | Severity | Root-cause hypothesis | Business/security risk |
| --- | --- | --- | --- | --- | --- | --- |
| `ORD-CUS-003` | `pagination is applied server-side with canonical metadata` | Page 2, limit 1 trả một item và metadata `{page:2,limit:1,totalItems:3,totalPages:3}` | HTTP 200 trả cả ba order, không có `pagination`; DB không đổi | High | **Static confirmed:** controller không truyền query; service không offset/limit/count | Order history pagination sai và response có thể tăng không giới hạn |
| `ORD-CUS-004` | `malformed page and limit query values return controlled 400` | Bốn page/limit malformed đều 400 | Cả bốn đều 200; DB không đổi | Medium | **Static confirmed:** Customer list không có query parser/validator | API im lặng chấp nhận client contract sai |
| `ORD-CUS-005` | `valid status filter returns only matching owned orders` | `status=Completed` chỉ trả Completed order | Trả cả Completed và PendingConfirmation | High | **Static confirmed:** status query bị bỏ qua | Filter/tab order hiển thị sai dữ liệu nghiệp vụ |
| `ORD-CUS-006` | `invalid status and sort query values return controlled 400` | Invalid status/sort đều 400 | Cả hai đều 200 | Medium | **Static confirmed:** query không được đọc/validate | Che giấu client defect, contract không predictable |
| `ORD-CUS-007` | `oldest and total ascending sorts use deterministic server ordering` | `oldest` và `total_asc` đúng thứ tự | Cả hai dùng fixed newest order | Medium | **Static confirmed:** hard-code `created_at DESC` | UI sort cho kết quả sai |
| `ORD-CAN-004` | `cancellation marks the still-pending payment as Cancelled atomically` | Order/payment đều Cancelled; stock 22; không shipment | Order Cancelled nhưng payment Pending; stock/history đúng | High | **Static confirmed:** Customer cancel transaction không update payment | Cancelled order vẫn có payment payable |
| `ORD-CAN-007` | `concurrent duplicate cancellation has one winner and no double-restock` | Status 200/400, stock 17, một cancel history | Cả hai 200; stock 22; hai cancel histories | Critical | **Static confirmed:** read-check-write không lock/version/conditional status update | Concurrent request làm tăng tồn kho giả và duplicate side effects |
| `ORD-ADM-006` | `numeric, boolean, array and object status runtime types return controlled 400` | Bốn non-string status đều 400, không mutation | Cả bốn 500; DB không đổi | Medium | **Static confirmed:** `.trim()` chạy trước runtime string check | Malformed JSON gây internal error |
| `ORD-ADM-012` | `concurrent cancellation has one winner, one history and one stock restoration` | Status 200/400, stock 11, một history | Cả hai 200; stock 15; hai histories | Critical | **Static confirmed:** Admin transition có cùng unguarded read-check-write | Privileged concurrency làm sai tồn kho |
| `ORD-ADM-013` | `concurrent divergent updates produce one legal winner and coherent side effects` | Một Confirmed/Cancelled request thắng; side effects nhất quán | Cả hai 200; final Cancelled; stock 11; hai histories; còn một shipment | Critical | **Static confirmed:** hai transaction validate cùng stale old state | Cancelled order vẫn có shipment do competing confirmation tạo |
| `ORD-ADM-015` | `unexpected persistence errors return a sanitized public envelope` | Generic HTTP 500 message | Trả raw `controlled order history failure`; transaction rollback đầy đủ | High | **Static confirmed:** Admin controller trả trực tiếp unexpected `Error.message` | Lộ database/Prisma/internal operational detail |
| `ORD-ADM-016` | `cancellation synchronizes pending payment and active shipment to Cancelled` | Order, pending payment và Preparing shipment đều Cancelled | Order Cancelled; payment Pending; shipment Preparing; stock/history đúng | High | **Static confirmed:** Admin cancel chỉ update stock/voucher/order/history | Payment/fulfilment có thể tiếp tục cho cancelled order |

Không có failure nào trong bảng dựa thuần vào suy đoán. Root cause được ghi
`Static confirmed` khi source path trực tiếp khớp execution. Refund semantics
cho payment đã Success không đủ contract và không bị kết luận trong report này.

## 5. Passing coverage

- Missing/invalid/locked authentication.
- Customer list owner isolation.
- Customer detail 404 parity cho missing/cross-owner ID.
- Response detail dùng order-detail price snapshot.
- Unknown list query không đổi owner hoặc mutate DB.
- Sequential Customer/Admin cancellation rules.
- Sequential duplicate cancellation restore stock/history một lần.
- Admin/Staff allow; Customer/Warehouse/unknown/locked deny.
- Missing/blank/invalid-enum Admin status validation.
- Unknown/mass-assignment body không đổi owner, totals, stock hoặc payment.
- Mọi canonical sequential transition.
- Same-state, skip, reverse và terminal transition rejection.
- Staff actor và `updated_at`.
- Sequential confirmation có tối đa một shipment.
- Transaction rollback và Customer error sanitization.

## 6. IDOR analysis

Execution-confirmed pass:

- Customer A list không chứa order Customer B.
- Customer A detail/cancel order B nhận 404 giống nonexistent ID.
- Cross-owner cancel không đổi order, detail, stock, history, payment hoặc
  shipment.
- Response không lộ foreign order code, phone/address snapshot hay payment/
  shipment data.

Owner predicate hiện tại dùng authenticated `userId`, không tin query/body
`userId`.

## 7. State-machine analysis

Sequential transitions pass:

```text
PendingPayment -> Cancelled
PendingConfirmation -> Confirmed / Cancelled
Confirmed -> Processing / Cancelled
Processing -> Shipping / Cancelled
Shipping -> Completed
```

Completed/Cancelled terminal, reverse, skip và same-state đều bị từ chối 400
không side effect. Transition table đúng trong sequential execution nhưng bị
bypass về mặt single-winner khi concurrent.

## 8. Stock restoration analysis

- Sequential cancellation increment đúng tổng detail quantities.
- Order details và `unit_price` giữ nguyên.
- Sequential retry không double-restock.
- Concurrent Customer cancel quantity 5: expected stock 17, actual 22.
- Concurrent Admin cancel quantity 4: expected stock 11, actual 15.

Đây là repeatable inventory-integrity defect, không phải test flake.

## 9. Double cancellation analysis

Sequential:

```text
request 1 -> 200
request 2 -> 400
stock/history apply một lần
```

Concurrent:

```text
request 1 -> 200
request 2 -> 200
stock/history apply hai lần
```

Direct PostgreSQL assertions chứng minh hai stock increments và hai
cancellation histories. HTTP-only assertion không phải nguồn kết luận duy nhất.

## 10. Concurrency analysis

Không có row lock, version, conditional `WHERE order_status = oldStatus` hoặc
serializable isolation.

Đối với divergent Admin update, cả Confirmed và Cancelled cùng validate
PendingConfirmation. Runtime cuối cùng:

```text
order = Cancelled
transition histories = 2
stock restored
shipment count = 1
```

Minimal secure scope:

1. Atomically claim transition bằng order ID + expected old status hoặc
   equivalent locking/version.
2. Zero affected row trả controlled conflict.
3. Chỉ winner apply side effects.
4. Database-enforce tối đa một shipment/order nếu concurrent confirm có thể xảy
   ra.

## 11. Transaction rollback analysis

Factory cài temporary trigger làm `order_status_history` insert thất bại cho
đúng target order, rồi cleanup trong `finally`.

Customer và Admin rollback tests pass:

```text
status unchanged
no new history
stock unchanged
payment unchanged
shipment unchanged
details unchanged
```

Transaction boundary hiện tại có hiệu lực. Defect nằm ở atomic transition claim
và missing side effects, không cần rewrite transaction toàn bộ.

## 12. Validation analysis

- Auth validation pass.
- Missing/blank/invalid enum Admin status trả 400.
- Number, boolean, array, object status trả 500 vì runtime `.trim()`.
- Customer page/limit/status/sort không được validate vì controller bỏ query.
- Unknown query/body fields không gây mass assignment trong các case đã test.

## 13. Filtering and sorting analysis

`ORD-CUS-003` đến `ORD-CUS-007` execution-confirm:

- Không server pagination/metadata.
- Valid status filter bị bỏ qua.
- `oldest` và `total_asc` bị bỏ qua.
- Invalid page/limit/status/sort được chấp nhận.
- Chỉ có `created_at DESC`.

Owner filtering vẫn đúng; lỗi thuộc list contract, không phải cross-customer
data leak.

## 14. Payment, shipment và history analysis

- Customer cancellation để COD payment Pending.
- Admin cancellation để payment Pending và shipment Preparing.
- Sequential confirmation tạo shipment/history đúng.
- Concurrent divergent update tạo hai order histories và để shipment không
  nhất quán với final Cancelled order.
- Refund behavior cho already-successful payment chưa đủ quyết định và không
  được test.

## 15. Error sanitization analysis

- Customer unexpected persistence error trả generic
  `Xử lý đơn hàng thất bại`.
- Admin unexpected persistence error trả raw database-trigger message.
- Logs có Prisma stack/local path trong test-process stderr cho controlled
  rollback; HTTP Customer response vẫn sanitized.
- Logs/report không chứa secret hoặc database connection string.

## 16. Regression conclusion

```text
New suite: 23 pass / 12 fail / 35
Full suite: 197 pass / 12 fail / 209
Existing baseline: 174/174 pass
```

Hai Testcontainer runs và full regression đều dùng PostgreSQL 16.14, database
`webapple_test_*` riêng và cleanup container thành công.

Không sửa expected để che failure. Không dùng skip/todo/mock Prisma.
