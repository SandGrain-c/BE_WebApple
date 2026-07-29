# ORDER LIFECYCLE CONTRACT

Ngày đối chiếu: 2026-07-29  
Branch: `test/backend-order-lifecycle`  
Baseline commit: `0a4421512b34ba65f9514b2af3e3f09570533acb`

Tài liệu này phân biệt ba lớp:

- **Current implementation**: hành vi source/runtime hiện tại.
- **Expected secure contract**: hành vi an toàn mà test đang yêu cầu.
- **Known contract drift**: chênh lệch đã được static trace hoặc execution xác nhận.

## 1. Endpoint và quyền truy cập

| Chức năng | Method | Route | Authentication | RBAC hiện tại |
| --- | --- | --- | --- | --- |
| Customer order list | `GET` | `/api/orders` | `authMiddleware` | Không có Customer role middleware |
| Customer order detail | `GET` | `/api/orders/:orderId` | `authMiddleware` | Ownership bằng authenticated `userId` |
| Customer cancel | `PATCH` | `/api/orders/:orderId/cancel` | `authMiddleware` | Ownership bằng authenticated `userId` |
| Admin order list | `GET` | `/api/admin/orders` | `authMiddleware` | `Admin`, `Staff`, `SaleStaff` |
| Admin order detail | `GET` | `/api/admin/orders/:orderId` | `authMiddleware` | `Admin`, `Staff`, `SaleStaff` |
| Admin update status | `PATCH` | `/api/admin/orders/:orderId/status` | `authMiddleware` | `Admin`, `Staff`, `SaleStaff` |

`authMiddleware` verify JWT, lấy `userId`, query lại user cùng role từ PostgreSQL
và từ chối user không tồn tại/inactive bằng HTTP 401. Role từ JWT không phải
nguồn quyền cuối cùng.

Admin router chạy auth trước `requireRoles`. `Customer`, `WarehouseStaff` và
unknown role bị từ chối 403. `SaleStaff` vẫn có trong source router dù
`TEST_DECISIONS.md` coi role này ngoài release hiện tại.

### Expected secure contract

- Owner Customer luôn lấy từ authenticated request, không từ body/query.
- Customer khác không thể list/detail/cancel order.
- Resource không tồn tại và resource của Customer khác cùng trả 404.
- Admin/Staff được quản lý Order; WarehouseStaff thay đổi shipment qua Shipment
  API.
- Unknown/inactive role deny mặc định.
- Việc Customer router có bắt buộc explicit role `Customer` hay không còn cần
  quyết định; ownership vẫn là điều kiện bắt buộc.

## 2. Customer order list

### Current implementation

`GET /api/orders` gọi `getMyOrdersService(userId)` và trả:

```json
{
  "success": true,
  "message": "Lấy danh sách đơn hàng thành công",
  "data": {
    "items": []
  }
}
```

Service query `orders.user_id = userId`, include order details/product/variant
và luôn sort `created_at DESC`.

Controller không truyền `req.query`. Vì vậy các query sau đều bị bỏ qua:

```text
status
page
limit
sort
```

Known query sai kiểu, invalid enum và unknown query đều nhận 200. Response
không có pagination metadata.

### Expected secure contract

- Hỗ trợ `status`, `page`, `limit`, `sort`.
- Sort canonical: `newest`, `oldest`, `total_asc`, `total_desc`.
- Filter, ordering, offset, limit và count thực hiện trong PostgreSQL.
- Known query sai kiểu hoặc enum không hợp lệ trả controlled 400.
- Response data:

  ```json
  {
    "items": [],
    "pagination": {
      "page": 1,
      "limit": 10,
      "totalItems": 0,
      "totalPages": 0
    }
  }
  ```

- Unknown query có thể bị bỏ qua nhưng không được thay đổi owner hoặc gây
  mutation.
- Default/max limit và secondary deterministic tie-breaker chưa được quyết định
  rõ.

## 3. Customer order detail

### Current implementation

`GET /api/orders/:orderId` convert param bằng `Number(...)`, sau đó
`findFirst` với cả:

```text
order_id
user_id
```

Không tồn tại hoặc cross-customer đều trả 404. Success `data` là order DTO trực
tiếp, gồm:

```text
orderId, orderCode, orderStatus
customerName, customerPhone, shippingAddress
subTotal, shippingFee, discountAmount, totalAmount
createdAt, updatedAt
items[]
```

Mỗi item gồm detail/variant/product IDs, product name/slug, SKU, attributes,
quantity, `unitPrice` và `lineTotal`.

`unitPrice` lấy từ `order_details.unit_price`, nên là snapshot giá. Product
name/SKU được join từ catalog hiện tại; schema không lưu snapshot cho hai field
này. Response không trả payment, shipment, password hash, gateway response hay
internal snake_case field.

### Expected secure contract

- Giữ 404 parity và owner predicate hiện tại.
- Giá luôn lấy từ order-detail snapshot, không từ request/current variant
  price.
- Nếu cần name/SKU bất biến, phải có quyết định/schema riêng; không suy diễn từ
  implementation hiện tại.

## 4. Customer cancel

### Current implementation

`PATCH /api/orders/:orderId/cancel` không đọc body. Customer chỉ được cancel:

```text
PendingPayment
PendingConfirmation
```

Success trả HTTP 200 với Customer order DTO, `orderStatus = Cancelled`.

Trong một Prisma interactive transaction:

1. Query order bằng `order_id + user_id`, include details.
2. Kiểm tra trạng thái cho phép.
3. Increment stock từng variant theo detail quantity.
4. Nếu có voucher: xóa usage và decrement `used_count` khi lớn hơn 0.
5. Tạo một order history `old_status -> Cancelled`.
6. Update order status và `updated_at`.
7. Query và trả order DTO.

Order details và `unit_price` không bị xóa/sửa. Customer cancellation hiện
không cập nhật payment hoặc shipment.

### Expected secure contract

- Cancellation là một atomic transition.
- Stock/voucher chỉ restore một lần.
- Pending payment phải đồng bộ `Cancelled`.
- Nếu tồn tại active shipment trong transition cho phép cancel, shipment và
  shipment history phải đồng bộ atomically.
- Successful payment không được tự đổi thành Cancelled; refund semantics đang
  **Blocked by decision**.

## 5. Admin update status

### Request/response hiện tại

`PATCH /api/admin/orders/:orderId/status` khai báo body:

```json
{
  "status": "string",
  "note": "optional string or null"
}
```

Service chỉ đọc `status` và `note`; unknown/mass-assignment fields bị bỏ qua.
Success trả HTTP 200 với Admin order DTO gồm owner ID, delivery snapshot,
totals, items và `statusHistory`.

Controller cast runtime body thành TypeScript DTO; cast này không validate JSON.
`normalizeText` gọi `.trim()` trước khi kiểm tra runtime type, nên number,
boolean, array và object gây HTTP 500.

### Order status enum

```text
PendingPayment
PendingConfirmation
Confirmed
Processing
Shipping
Completed
Cancelled
```

### State transition hiện tại

```text
PendingPayment -> Cancelled

PendingConfirmation -> Confirmed
PendingConfirmation -> Cancelled

Confirmed -> Processing
Confirmed -> Cancelled

Processing -> Shipping
Processing -> Cancelled

Shipping -> Completed

Completed -> terminal
Cancelled -> terminal
```

`PendingPayment -> PendingConfirmation` thuộc successful PayOS flow, không phải
Admin status endpoint. Same-state, skip, reverse và terminal transition trả 400
trong sequential execution.

Admin update chạy transaction:

1. Read order/details.
2. Validate transition.
3. Nếu Cancelled: restore stock/voucher.
4. Update order status/timestamp.
5. Nếu Confirmed: `findFirst` shipment; nếu chưa có thì tạo shipment Pending và
   initial shipment history.
6. Tạo order status history với Admin/Staff actor.
7. Query Admin order DTO.

Admin cancellation không đồng bộ pending payment hoặc active shipment.

## 6. Stock, payment, shipment và history

### Stock

- Checkout đã decrement stock.
- Cancel increment đúng tổng detail quantities trong sequential execution.
- Schema unique `(order_id, variant_id)` nên một order không thể có hai detail
  cho cùng variant.
- Không có marker/constraint ghi stock của order đã được restore.

### Payment

- COD checkout: order `PendingConfirmation`, gateway `COD`, payment `Pending`.
- OnlineBanking: order `PendingPayment`, payment `Pending`.
- Shipment Delivered là flow hiện tại đồng bộ COD payment thành `Success` và
  ghi `paid_at`.
- Customer/Admin cancellation hiện để payment `Pending`.

### Shipment

- Confirm sequential tạo tối đa một shipment bằng `findFirst` rồi `create`.
- Schema không unique `shipments.order_id`; invariant tối đa một shipment không
  được database enforce khi concurrent.
- Admin cancellation có thể để order Cancelled nhưng shipment vẫn Preparing.

### Order history

- Mỗi sequential transition hợp lệ ghi `old_status`, `new_status`,
  `changed_by`, note và timestamp.
- Schema không unique transition key.
- Concurrent requests có thể ghi hai history từ cùng old state.

## 7. Transaction và rollback

Customer cancel và Admin update status dùng Prisma interactive transaction.
Integration trigger cố ý làm history insert thất bại đã xác nhận rollback toàn
bộ:

```text
order status
history
stock
payment
shipment
order detail
```

Transaction boundary hiện tại hoạt động. Secure fix nên bổ sung atomic state
claim và missing side effects trong transaction hiện có, không cần rewrite toàn
bộ flow.

## 8. Concurrency semantics

### Current implementation

Flow là:

```text
read old state
validate in application
perform side effects
unconditional update
```

Không có:

```text
row lock
version column
conditional update WHERE order_status = oldStatus
serializable transaction
unique history transition
unique shipment per order
```

Runtime đã xác nhận:

- Hai Customer cancel đồng thời đều 200, double-restock và ghi hai history.
- Hai Admin cancel đồng thời đều 200, double-restock và ghi hai history.
- Confirmed/Cancelled đồng thời đều thành công; final order Cancelled nhưng còn
  shipment do competing confirmation tạo.

### Expected secure contract

- Chỉ một request claim được transition từ old state.
- Stale request trả controlled conflict. Test hiện dùng 400; dùng 409 cần quyết
  định contract riêng.
- Chỉ winner được apply stock/payment/shipment/voucher/history side effects.
- Final order/payment/shipment/history phải là một trạng thái nhất quán.

## 9. Error contract

| Tình huống | Current behavior |
| --- | --- |
| Missing/invalid/expired token hoặc inactive account | 401 |
| Role không được phép ở Admin API | 403 |
| Typed malformed request/invalid transition | 400 |
| Customer missing/foreign order | 404 |
| Concurrent stale transition | Không xử lý riêng; có thể cùng 200 |
| Unexpected Customer error | Generic sanitized 500 |
| Unexpected Admin error | 500 với raw `Error.message` |

Expected unexpected envelope:

```json
{
  "success": false,
  "message": "Xử lý đơn hàng thất bại"
}
```

Response không được lộ Prisma/SQL, stack, local path, secret hoặc raw database
message.

## 10. Known contract drift

| ID | Drift |
| --- | --- |
| `OL-CD-01` | Customer Frontend/list contract có query và pagination; Backend bỏ qua query và thiếu metadata |
| `OL-CD-02` | Known list query không có runtime validation |
| `OL-CD-03` | Admin status TypeScript DTO không bảo vệ runtime type |
| `OL-CD-04` | Customer/Admin cancellation để pending payment hoạt động |
| `OL-CD-05` | Admin cancellation để active shipment trên cancelled order |
| `OL-CD-06` | Transition không có concurrency guard, gây duplicate side effects |
| `OL-CD-07` | Admin unexpected error trả raw internal message |
| `OL-CD-08` | `SaleStaff` còn trong route dù ngoài canonical release role |
| `OL-CD-09` | Product name/SKU là current join, không phải immutable order snapshot |
