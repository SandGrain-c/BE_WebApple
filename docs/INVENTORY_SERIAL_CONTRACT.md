# Inventory and Serialized Item Contract

## 1. Scope and evidence

This document reconstructs the current Backend contract from commit `d7e55bd`
on branch `test/backend-inventory-serial-integrity`. It is based on the Prisma
schema and the mounted Admin, Inventory, Product Item, Checkout, Order,
Cancellation, and Shipment code. It does not treat route comments or unused
schema models as runtime behavior.

The secure expectations below follow `docs/TEST_DECISIONS.md`. Where the
repository does not define a behavior, the item is explicitly marked as a
decision gap rather than inferred.

## 2. Current implementation

### 2.1 Data model

| Concern | Current model and fields | Runtime meaning |
| --- | --- | --- |
| Stock counter | `product_variants.stock_quantity` | Authoritative counter used by catalog, cart, checkout, receipt, adjustment, and cancellation. |
| Receipt | `inventory_receipts` | Header with `warehouse_staff_id`, optional supplier reference/name, total amount, and creation time. The staff field identifies the actor; it is not a warehouse location. |
| Receipt line | `inventory_receipt_details` | Variant, quantity, cost price, and receipt relation. |
| Serialized unit | `product_items` | Unique `serial_number`, one `variant_id`, numeric status, optional receipt-detail link, and optional order-detail link. |
| Reservation | `stock_reservations` | Item/user/optional order, reserved/expiry timestamps, and free-form status. The schema exists but no mounted inventory, checkout, order, or shipment flow manages it. |
| Mutation history | `audit_logs` | Receipt and manual adjustment write audit events. There is no dedicated stock-movement ledger. |

There is no `warehouses`, warehouse-bin, warehouse-stock, warehouse-transfer,
or warehouse-location relation in the Prisma schema. There is no IMEI, IMEI1,
IMEI2, or sold timestamp column. Accordingly, the current data model cannot
express stock or a serial at Warehouse A versus Warehouse B.

### 2.2 Serialized item statuses

The API maps the numeric `product_items.status` values as follows:

| DB value | API value |
| --- | --- |
| `1` | `InStock` |
| `2` | `Reserved` |
| `3` | `Sold` |
| `4` | `Warranty` |
| `5` | `Returned` |
| `6` | `Inactive` |

The schema does not enforce this finite set with an enum or check constraint
visible to Prisma. The generic Product Item API accepts the textual statuses.

### 2.3 Mounted routes, authentication, and RBAC

All routes below are mounted by `src/apps/admin/admin.app.ts`.

| Method and route | Current function | Authentication and RBAC |
| --- | --- | --- |
| `GET /api/admin/inventory/variants` | List variant-level inventory | Database-refreshed JWT authentication, then `Admin` or `WarehouseStaff` |
| `GET /api/admin/inventory/receipts` | List receipts | Same |
| `GET /api/admin/inventory/receipts/:receiptId` | Receipt detail | Same |
| `POST /api/admin/inventory/receipts` | Create receipt, lines, optional serials, counter increments, and audit | Same |
| `PATCH /api/admin/inventory/variants/:variantId/stock` | Set, increase, or decrease variant counter and write audit | Same |
| `GET /api/admin/product-items` | List serialized items | Database-refreshed JWT authentication, then `Admin` or `WarehouseStaff` |
| `GET /api/admin/product-items/:productItemId` | Serialized item detail | Same |
| `POST /api/admin/product-items` | Create a standalone serialized item | Same |
| `PATCH /api/admin/product-items/:productItemId` | Change variant, serial, or status | Same |
| `DELETE /api/admin/product-items/:productItemId` | Soft-delete by setting `Inactive` | Same |

`Customer`, ordinary `Staff`, and an unknown role are denied by the role
middleware. An inactive/locked user is denied by authentication before RBAC.

There is no mounted route for warehouse management, transfer, serial
assignment, reservation/release, reconciliation, or inventory history.

### 2.4 Request and response contract

#### Variant inventory query

`GET /api/admin/inventory/variants` currently accepts:

- `search`: matched case-insensitively against SKU, variant name, or product name.
- `productId`: positive integer query string.
- `stockStatus`: recognizes `out-of-stock`, `low-stock`, and `in-stock`.
- `lowStockThreshold`: non-negative integer query string; default `5`.
- `page`: positive integer query string; default `1`.
- `limit`: positive integer query string; default `10` and capped at `100`.
- `sort`: recognizes `newest`, `oldest`, `stock_asc`, `stock_desc`, `sku_asc`,
  and `sku_desc`. Invalid values return controlled `400`.

Success uses the standard envelope:

```json
{
  "success": true,
  "message": "Lấy danh sách tồn kho thành công",
  "data": {
    "items": [
      {
        "variantId": 1,
        "productId": 1,
        "productName": "Example",
        "productSlug": "example",
        "sku": "SKU",
        "variantName": null,
        "color": null,
        "capacity": null,
        "ram": null,
        "country": null,
        "price": 1000,
        "stockQuantity": 1,
        "stockStatus": "low-stock",
        "totalProductItems": 1,
        "inStockItems": 1
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "totalItems": 1,
      "totalPages": 1
    }
  }
}
```

The stock status is computed exclusively from `stock_quantity`; the response
also exposes total and `InStock` item counts, which can reveal counter drift.

#### Receipt query and detail

`GET /api/admin/inventory/receipts` accepts `search`, `dateFrom`, `dateTo`,
`page`, `limit`, and sort values `newest`, `oldest`, `amount_asc`, or
`amount_desc`. Invalid sort, pagination, or dates return controlled `400`.

The list returns receipt ID, staff ID/name, supplier ID/name, total amount,
total quantity, creation time, and pagination. The detail additionally returns
line IDs, product and variant summary, quantity, cost price, line total, and
the line's serial numbers.

#### Receipt creation

`POST /api/admin/inventory/receipts` currently accepts:

```text
supplierName?: string | null
supplierId?: number | null
items: [
  {
    variantId: number
    quantity: number
    costPrice: number
    serialNumbers?: string[]
  }
]
```

`items` must be a non-empty array. Variant ID and quantity are passed through
`Number`; quantity must then be a positive integer. Cost price is also
coerced, must be numeric and non-negative, but is not required to be an
integer. When serials are provided, blank normalized values are removed, the
remaining count must equal quantity, and exact duplicates in the line,
receipt, or database are rejected.

The authenticated user's ID is always stored as `warehouse_staff_id`.
Client-supplied actor, stock-before/after, timestamp, and other unknown fields
are ignored. A valid receipt transaction creates the header and details,
increments each variant counter, optionally creates `InStock` product items,
and writes one `CREATE_INVENTORY_RECEIPT` audit event.

It is not currently mandatory to provide serials for iPhone or another
serialized category. Therefore a counter-only receipt is accepted even where
the required invariant says that the category is serialized.

#### Manual stock adjustment

`PATCH /api/admin/inventory/variants/:variantId/stock` accepts:

```text
type: "set" | "increase" | "decrease"
quantity: number
reason: string
```

`quantity` is coerced with `Number`, must then be a non-negative integer, and
`reason` must normalize to non-empty text. The service reads the counter,
computes the replacement value, rejects a negative result, writes the counter,
and creates one `ADJUST_STOCK` audit event inside a transaction. Actor and
before/after values are server-derived.

The operation does not update or reconcile serialized units. A manual
adjustment can therefore make a serialized variant counter differ from its
number of `InStock` items. The read-compute-set mutation has no conditional
database claim, so concurrent decrements can both succeed and both write audit
events.

#### Product Item query and mutation

`GET /api/admin/product-items` accepts:

- `q`: case-insensitive serial, SKU, or product-name search.
- `status`: one of the six textual statuses.
- `variantId`, `productId`, `page`, and `limit`: parsed through numeric
  coercion; invalid identifiers are silently omitted and invalid pagination
  silently falls back.

The response contains the item ID, variant ID, serial, textual status,
product/category summary, variant summary including the counter, and a
nullable `createdAt` field. The schema has no item creation timestamp, so the
mapper returns no stored creation time.

`POST /api/admin/product-items` accepts `variantId`, `serialNumber`, and
optional `status` (default `InStock`). It creates only a product item and
deliberately does not change the stock counter. Unknown order, reservation,
warehouse, IMEI, and sold timestamp fields are ignored.

`PATCH /api/admin/product-items/:productItemId` accepts any subset of
`variantId`, `serialNumber`, and `status`. A `Sold` item blocks variant/serial
changes, but a status-only update is allowed, including `Sold` back to
`InStock`. `DELETE` changes a non-sold item to `Inactive`; deletion of a
`Sold` item is rejected.

### 2.5 Stock source of truth and warehouse semantics

The effective stock source of truth is the global integer on the variant:

- checkout tests and code use it for availability and atomically decrement it;
- cart/catalog read it;
- receipt increments it;
- cancellation increments it;
- the manual adjustment replaces it.

`product_items` is a parallel serialized-unit representation, not the source
used to authorize a purchase. The implementation has no warehouse dimension.
The label `warehouse_staff_id` identifies who created a receipt and does not
identify where stock is stored.

### 2.6 Serial and IMEI semantics

Serial numbers are required on a `product_items` row and protected by one
database unique constraint. Receipt and generic item creation trim surrounding
whitespace and precheck an exact match. PostgreSQL's current string equality
means case variants are not normalized into the same logical serial.

No IMEI fields or constraints exist. Controller messages mention
“serial/IMEI,” but only serial data is modeled and returned.

There is no schema field that marks a variant as serialized. Category-based
serialization requirements therefore exist only in the decision document and
cannot be enforced generically from the current model.

### 2.7 Reservation, assignment, sold, and cancellation semantics

- **Reservation — Schema only:** `stock_reservations` can store an active
  reservation, but checkout, order lifecycle, inventory, and shipment code do
  not create, claim, expire, or release it.
- **Assignment — Route missing:** no endpoint claims an `InStock` item for an
  order detail. The generic Product Item DTO also has no order-detail field.
- **Sold — Partial implementation:** the generic Product Item endpoint can set
  `Sold`; checkout, admin order transition, and shipment delivery do not do so.
  There is no `soldAt`.
- **Customer cancellation — Counter-only stock:** one transaction claims the
  order status, increments variant counters, restores voucher/payment/shipment
  relations, and writes order history. It does not release `product_items`,
  clear `order_detail_id`, or release `stock_reservations`.
- **Admin cancellation — Counter-only stock:** it likewise restores variant
  counters and related order state, without serialized-unit/reservation
  restoration.
- **Completion/delivery — No serialized side effect:** neither path assigns or
  marks an item sold.

Concurrent cancellation uses an atomic `updateMany` condition on the current
order status. This prevents a double counter increment. It does not make
serialized restoration correct because that restoration is absent.

### 2.8 Transfer and history semantics

Warehouse transfer is **Not implemented**: there is no warehouse model,
source/destination stock, serial-location relation, route, service, or transfer
event.

Inventory history is **Partial implementation**. Receipt and adjustment audit
logs record the actor and JSON before/after context, but there is no immutable
stock movement ledger, no per-warehouse balance, and no serial state-transition
history. Checkout, cancellation, and shipment do not create inventory audit
events.

### 2.9 Transaction and concurrency handling

| Flow | Current transaction/concurrency behavior |
| --- | --- |
| Receipt | Header, lines, counter, serial rows, and audit are in one Prisma transaction. Preflight duplicate checking is outside it; the database unique key remains the final guard. A concurrent loser is an unexpected Prisma error mapped to `500`, not a controlled conflict. |
| Adjustment | Counter update and audit are transactional, so an audit failure rolls back the counter. The read-compute-set sequence has no compare-and-swap/row lock, so concurrent decrements can both report success and produce duplicate audit effects. |
| Checkout | Conditional `updateMany` on `stock_quantity >= quantity` prevents counter oversell, but no serial or reservation is claimed. |
| Cancellation | Conditional order-status claim prevents double counter restoration; all modeled order restoration steps are transactional. Serialized items and reservation records are outside the flow. |
| Generic product item | A precheck plus DB unique constraint protects exact serial uniqueness. There is no typed handling for the concurrent unique conflict and no counter transaction. |

Unexpected Inventory errors expose `error.message`. Unexpected Product Item
errors reach the global middleware, which also exposes `err.message`. Raw
database or deliberately triggered internal messages can therefore enter the
public response.

## 3. Expected secure contract and required invariants

The following are the secure expectations used by the test-first suite. They
do not imply that a missing endpoint exists.

1. Runtime numeric validation must reject strings, arrays, objects, booleans,
   `null`, non-finite values, fractions where integers are required, and
   out-of-range values with controlled `400`.
2. Invalid enum, identifier, filter, pagination, and sorting inputs must return
   controlled `400` rather than silently broadening a query.
3. Stock must never be negative.
4. A serialized variant must satisfy:
   `product_variants.stock_quantity == count(product_items where status = InStock)`.
5. For serialized iPhone, iPad, MacBook, Apple Watch, and AirPods receipts, the
   receipt quantity must equal the number of valid unique serials.
6. Every serial must be unique and belong to exactly one variant.
7. If IMEI is implemented, each IMEI must be unique. The current schema cannot
   enforce or test this invariant.
8. If warehouses are implemented, each serial must be at exactly one
   warehouse and a transfer must preserve global stock. The current schema
   cannot enforce or test this invariant.
9. A serial may be sold only once and a sold serial must not return to
   `InStock` through generic administration.
10. Actor, stock values, order ownership, sold state, timestamps, and price
    must be server-authoritative.
11. An order cancellation must restore counter, assigned serial, order
    linkage, and reservation exactly once in one transaction.
12. A failed mutation must leave no partial receipt, detail, counter, item,
    order, reservation, or history changes.
13. Concurrent receipt/item creation for one serial must commit once and map
    the loser to a controlled `409` without internal details.
14. Concurrent issue of the last available unit must allow one winner and a
    controlled loser, with one matching audit event.
15. Stock history must match committed mutations and identify the
    authenticated actor; rolled-back or losing operations must not create
    history.
16. Unexpected errors must use a sanitized public envelope such as
    `{ "success": false, "message": "Xử lý tồn kho thất bại" }`.

## 4. Known contract drift

| Area | Classification | Current implementation | Expected secure contract / impact |
| --- | --- | --- | --- |
| Warehouse inventory | **Not implemented** | One global variant counter; no warehouse model | Cannot isolate location stock or prove cross-warehouse conservation. |
| Warehouse transfer | **Route missing** | No route/service/schema relation | Cannot transfer quantity or serials safely. |
| IMEI | **No serialized inventory support for IMEI** | No IMEI field or unique constraint | Cannot register, query, or protect IMEI uniqueness. |
| Variant serialization metadata | **Not implemented** | No `requiresSerial` field/rule in schema | Required category rule is not enforceable by a stable domain attribute. |
| Receipt serial requirement | **Partial implementation** | Serials are optional for every variant | Serialized stock can be received as counter-only stock. |
| Serialized counter invariant | **Counter-only stock** | Receipt can align both, but adjustment and standalone item CRUD mutate only one side | Counter and physical serialized units can drift. |
| Reservation | **Schema only** | Table exists but runtime flows ignore it | Active reservations can become stale and do not prevent sale/transfer. |
| Serial assignment | **Route missing** | Optional order-detail relation exists; no claim workflow | No atomic single-order ownership guarantee. |
| Sold lifecycle | **Partial implementation** | Generic status mutation; no fulfillment transition or timestamp | Sold units can be created manually or reverted. |
| Cancellation release | **Partial implementation** | Counter and order relations restore, but item/reservation do not | Cancelled orders retain stale serial and reservation ownership. |
| Inventory history | **Partial implementation** | Receipt/adjustment audit only | No complete movement ledger or reconciliation trail. |
| Runtime validation | **Partial implementation** | Numeric coercion and silent query defaults | Ambiguous inputs are accepted or queries are unintentionally broadened. |
| Concurrent receipt/item conflict | **Partial implementation** | DB uniqueness preserves data | Conflict is exposed as `500`, with possible internal error disclosure. |
| Concurrent adjustment | **Partial implementation** | Transaction without atomic state claim | Two last-unit issues can both succeed and both audit. |
| Error sanitization | **Partial implementation** | Unexpected `Error.message` is public | Prisma/internal details can be disclosed. |

## 5. Decisions still blocked

The repository does not provide enough evidence to select these contracts:

- whether serial uniqueness is case-insensitive and what canonical
  normalization should be used;
- exact order/shipment transition at which a serialized unit becomes `Sold`;
- how dual-SIM IMEI1/IMEI2 should be modeled;
- whether accessories outside the named categories require serial tracking;
- warehouse identity, allocation policy, and source warehouse selection;
- reservation expiry ownership and release policy;
- the required structure and retention rules for an inventory movement ledger.

These gaps require a product/data-model decision before production
implementation or endpoint-level tests are added.
