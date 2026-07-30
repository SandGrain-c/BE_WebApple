# Shipment, Delivery and Fulfillment Contract

## Scope and evidence

This document reconstructs the current backend behavior from the Prisma schema,
the mounted Customer/Admin composition roots, shipment route/controller/service/
DTO/mapper code, order, payment and inventory services, `TEST_DECISIONS.md`, and
the integration tests added on branch `test/backend-shipment-delivery-integrity`.
Runtime observations use PostgreSQL 16 Testcontainers; they do not use a
development database or external carrier/payment account.

The terms below are deliberate:

- **Current implementation**: behavior present in the current source.
- **Expected secure contract**: invariant or HTTP contract established by
  `TEST_DECISIONS.md` or by the task's explicit security requirements.
- **Known drift/gap**: a mismatch or missing implementation. A gap is not
  treated as an endpoint or field that already exists.

## Current implementation

### Models and relations

| Concern | Current implementation |
| --- | --- |
| Shipment | `shipments` with `shipment_id`, `order_id`, nullable `shipping_provider`, nullable `tracking_code`, string `status`, and `created_at`. |
| Order relation | Every shipment has one required `order_id`; `orders` exposes `shipments[]`. |
| Shipment cardinality | The service performs a pre-read and rejects an already-shipped order. The schema has no unique constraint on `shipments.order_id`, so concurrent requests can create multiple rows. |
| Split shipment | No ShipmentItem/allocation model or API. Split fulfillment is not supported by the service. |
| Carrier | No Carrier model or enum. `shipping_provider` is a nullable client-supplied string up to 100 characters. |
| Tracking | `tracking_code` is a nullable client-supplied string up to 100 characters. PostgreSQL has a partial unique index for non-null values. The server does not generate it. |
| History | `shipment_status_history` stores status, nullable location/note and timestamp. |
| Delivery | No separate Delivery model or route. Delivery is represented by shipment status `Delivered`. |
| Warehouse | Shipment has no warehouse relation. |
| Shipment items | No `shipment_items` table or route. |
| Serial/IMEI | `product_items` can be assigned to an `order_detail`, but there is no relation from a product item/serial to a shipment. |
| Completion timestamps | Shipment has no `delivered_at` or `cancelled_at`. |
| Callback state | No callback event, signature, carrier payload or idempotency model. |

The tracking unique index is
`ux_shipments_tracking_code_not_null`. There is no database constraint enforcing
one shipment per order.

### Mounted routes, authentication and RBAC

All routes use the current Customer/Admin composition roots; no legacy app or
port is involved.

| Application | Method and route | Authentication/RBAC | Current purpose |
| --- | --- | --- | --- |
| Customer | `GET /api/shipments/orders/:orderId` | `authMiddleware`; ownership is enforced in the database query | Read the current customer's shipment by order. |
| Customer | `GET /api/shipments/:shipmentId` | `authMiddleware`; ownership is enforced in the database query | Read the current customer's shipment by shipment ID. |
| Admin | `GET /api/admin/shipments` | `authMiddleware`, then `Admin`, `Staff`, `SaleStaff`, or `WarehouseStaff` | Paginated/filterable shipment list. |
| Admin | `GET /api/admin/shipments/:shipmentId` | Same role middleware | Shipment detail. |
| Admin | `POST /api/admin/shipments` | Same role middleware | Create shipment. |
| Admin | `PATCH /api/admin/shipments/:shipmentId` | Same role middleware | Change provider/tracking. |
| Admin | `PATCH /api/admin/shipments/:shipmentId/status` | Same role middleware | Apply a shipment state transition. |
| Admin | `DELETE /api/admin/shipments/:shipmentId` | Same role middleware | Soft-cancel by setting status `Cancelled`. |

`SaleStaff` is accepted by the route source, although the current release roles
documented in `TEST_DECISIONS.md` are `Admin`, `Staff`, and `WarehouseStaff`.
Unknown roles are denied by the shared role middleware.

There is no customer lookup by tracking number, carrier callback/webhook route,
ShipmentItem route, or shipment-serial route.

### Request DTOs

`POST /api/admin/shipments` currently consumes:

```text
orderId (declared number)
shippingProvider? (declared string)
trackingCode? (declared string)
status? (declared ShipmentStatus)
location? (declared string)
note? (declared string)
```

`PATCH /api/admin/shipments/:shipmentId` consumes:

```text
shippingProvider?: string | null
trackingCode?: string | null
```

`PATCH /api/admin/shipments/:shipmentId/status` consumes:

```text
status: ShipmentStatus
location?: string
note?: string
```

The declarations are compile-time only. There is no runtime request schema.
Controllers coerce IDs/page/limit with `Number(...)`, cast enum-like query
fields, and pass request bodies directly to the service. Text normalization
calls `.trim()` before proving that a value is a string.

### Response DTO

The shared customer/admin mapper returns:

```text
shipmentId
orderId
shippingProvider
trackingCode
status
createdAt
order?:
  orderId, orderCode, orderStatus,
  customerName, customerPhone, shippingAddress,
  totalAmount, createdAt
history?:
  shipmentHistoryId, shipmentId, status,
  location, note, updatedAt
```

Customer ownership queries prevent another customer's shipment/order from
being returned. No carrier secret, webhook signature, warehouse internals,
audit metadata, password hash, cost price, or raw database fields are mapped.
However, the same DTO is used for Customer and Admin; history notes have no
public/private distinction.

### List, filtering and sorting

The Admin list accepts `search`, `status`, `orderId`, `page`, `limit`, and
`sort`. Recognized sort values are:

```text
newest (also the silent default)
oldest
status_asc
status_desc
```

Search spans tracking code, shipping provider, order code, customer name and
customer phone. Status is checked against the shipment statuses. There is no
carrier-specific or tracking-specific filter parameter beyond `search`.

Invalid/non-positive page and limit values silently become 1 and 10. There is
no maximum limit. Invalid sort silently becomes newest. Invalid `orderId`
values can be converted to `NaN` and then treated as an absent filter, which
broadens the query. Decimal page/limit values are not explicitly rejected.

### Creation flow

The service currently:

1. Coerces `orderId` with `Number`.
2. Trims provider/tracking/location/note.
3. Accepts a client-supplied shipment status, defaulting to `Pending`.
4. Loads the order.
5. Rejects `Cancelled`, `Completed`, `PendingPayment`, and
   `PendingConfirmation` orders.
6. Pre-checks for an existing shipment and duplicate tracking code.
7. In one Prisma transaction, creates shipment, initial shipment history,
   changes a `Confirmed` order to `Processing` with order history, and writes
   an audit log.

The actor used by the audit/order history comes from authenticated
`req.user.userId`. Unknown request fields are ignored by the service. Stock,
serial and payment are not changed during shipment creation.

Eligibility is based only on order status. A `Confirmed` online order whose
payment is still `Pending` is accepted. Blank tracking is normalized to null.
Numeric-string order IDs are accepted. A client can create an initial
`Delivered` or `Cancelled` shipment.

### Tracking flow

Provider/tracking updates are permitted until the shipment is `Delivered` or
`Cancelled`. The service pre-checks duplicate non-null tracking, updates the
shipment and audit log in one transaction, and does not add status history.

Blank tracking clears the code to null. Runtime non-string values raise a raw
JavaScript `.trim()` error. Overlong strings reach PostgreSQL. Duplicate
conflicts found by the pre-check are returned as HTTP 400; a concurrent unique
constraint failure is also not mapped to a controlled conflict.

### Shipment state machine

The implemented transition table matches `TEST_DECISIONS.md`:

```text
Pending   -> Preparing | Cancelled
Preparing -> Shipped | Cancelled
Shipped   -> InTransit | Delivered | Failed
InTransit -> Delivered | Failed
Failed    -> InTransit | Cancelled
Delivered -> terminal
Cancelled -> terminal
```

The status PATCH endpoint rejects same-state and invalid transitions. The
separate DELETE cancellation path does not consult the transition table; it
allows cancellation from every non-terminal status, including `Shipped` and
`InTransit`, which is broader than the documented state machine.

Status reads occur before the transaction. The transaction updates shipment,
adds history, synchronizes order/payment when applicable, and writes audit.
The update is unconditional by primary key and does not atomically assert the
old status.

### Order and payment synchronization

The service maps:

```text
Shipment Preparing  -> Order Processing
Shipment Shipped    -> Order Shipping
Shipment InTransit  -> Order Shipping
Shipment Delivered  -> Order Completed
```

It does not change an order already `Cancelled` or `Completed`. A transition
on a shipment whose order is `Cancelled` is rejected.

When a shipment becomes `Delivered`, the transaction finds one pending `COD`
`Payment` transaction and sets it to `Success`, writes `paid_at`, and records
a server-created gateway response. Existing successful online payments are
not rewritten.

### Inventory and serial synchronization

Shipment creation, provider/tracking updates, shipment status changes, and
shipment cancellation do not alter `product_variants.stock_quantity`.
Shipment delivery does not change an assigned `product_items.status`.

Stock is decremented/reserved in earlier checkout/order flows, not in shipment
creation. Order cancellation has separate stock/serial restoration logic.
Because Shipment has no item/serial relation, the shipment service cannot
prove which order detail quantity or serial a shipment fulfills.

### Audit and history

- Creation writes initial shipment history, optional order transition/history,
  and `CREATE_SHIPMENT`.
- Provider/tracking update writes `UPDATE_SHIPMENT`.
- Status update writes shipment history, optional order history/payment update,
  and `UPDATE_SHIPMENT_STATUS`.
- Cancellation writes shipment history and `CANCEL_SHIPMENT`.

The current transaction boundaries correctly roll back these grouped writes
when shipment history or audit persistence is forced to fail.

### Concurrency and idempotency

No row version, conditional status update, advisory lock, serializable
transaction, or `shipments.order_id` unique constraint protects concurrent
creation. Two concurrent requests can both pass the existence check.

Status updates also read before the transaction and then update
unconditionally. Two concurrent `Delivered` requests can both append history
and audit side effects. A cancel/deliver race can accept both terminal
operations and leave shipment, order and COD payment semantically
inconsistent. Same-state sequential updates return HTTP 400 rather than an
idempotent result or controlled 409.

### Error mapping

Every shipment controller catches errors locally. Admin controllers map all
errors to HTTP 400 and return `Error.message`. Customer ownership misses use
404; other customer errors use 400. Because controllers consume unexpected
errors, the application's sanitized global 500 handler is bypassed.

Current behavior therefore does not implement the required mapping:

```text
400 invalid input
401 unauthenticated
403 forbidden
404 missing/ownership-safe resource
409 duplicate, state or concurrency conflict
500 unexpected persistence failure
```

Raw `.trim()` errors, Prisma call sites/local paths, and controlled database
failure text can appear in responses.

## Expected secure contract and required invariants

| Invariant | Expected secure contract | Current status |
| --- | --- | --- |
| One shipment per order | Until split fulfillment exists, sequential and concurrent creation must produce at most one shipment/history/order transition. | **No concurrency guard**; service-only pre-check. |
| Unique tracking | Normalized non-null tracking must be unique; conflict is controlled 409. | Schema unique plus pre-check, but error mapping is 400/raw for persistence races. |
| Shipment ownership | Shipment belongs to exactly one existing order; customer reads must include current user ownership in the database predicate. | Implemented; IDOR tests pass. |
| Item ownership/allocation | Shipment may contain only details of its own order and allocated quantity may not exceed purchased quantity. | **Not implemented**; no ShipmentItem model/API. |
| Serial ownership | Only a serial assigned to the shipment's order may be delivered; one serial may belong to only one active shipment. | **Not implemented**; no shipment-serial relation. |
| Terminal states | `Delivered` and `Cancelled` cannot transition back; cancelled cannot become delivered. | Sequential PATCH enforcement exists; races are not atomic. |
| Order completion | Order completes only when required fulfillment is delivered. | Works for a single sequential shipment; **no split-shipment support** and concurrency unsafe. |
| Ineligible order | No shipment for cancelled, completed, unconfirmed, or payment-ineligible order. | Order status checks are partial; online payment success is not checked. |
| Server authority | Initial shipment status and actor/internal fields are server-controlled. Runtime types must be strict. | Actor is authoritative; initial status and coercible IDs are client-controlled. |
| Atomicity | Shipment/order/payment/history/audit mutations succeed or roll back together. | Transaction rollback is implemented and execution-confirmed. |
| Idempotency | Duplicate create and repeated transition cannot duplicate side effects. | Sequential create pre-check only; state updates are not idempotent under concurrency. |
| Data exposure | Customer receives only owned public shipment/order/history data. | Ownership-safe; no internal carrier model exists. History note visibility is undifferentiated. |

## Implementation gaps

| Area | Label | Evidence |
| --- | --- | --- |
| Carrier registry/rules | **Not implemented** | Only nullable `shipping_provider` string exists. |
| Delivery aggregate | **Not implemented** | Delivery is a shipment status; no separate model or route. |
| Shipment item allocation | **Not implemented** | No ShipmentItem model, relation, DTO, service or route. |
| Split fulfillment | **No split-shipment support** | Service rejects an existing shipment; schema alone does not enforce that rule. |
| Shipment-to-serial/IMEI | **Not implemented** | Product items link to order detail, not shipment. |
| Warehouse-bound fulfillment | **Not implemented** | Shipment has no warehouse field/relation. |
| Carrier webhook | **No tracking callback** / **Route missing** | No callback route, signature validation or event idempotency. |
| Delivery timestamps | **Schema only: absent** | No `delivered_at`/`cancelled_at` field to make timestamp-once assertions. |
| One shipment per order constraint | **No concurrency guard** | No unique index on `order_id`; runtime race reproduced. |
| State transition claim | **No concurrency guard** | Pre-transaction read plus unconditional update. |
| History | Implemented | Shipment and order history exist and are transactional. |
| Error taxonomy/sanitization | **Partial implementation** | Authentication/ownership status is controlled; shipment business/persistence errors are flattened to raw HTTP 400. |

