# Inventory and Serialized Item Integration Test Report

## 1. Execution summary

Branch: `test/backend-inventory-serial-integrity`  
Commit before changes: `d7e55bd`

Baseline before the new suite:

| Gate | Result |
| --- | --- |
| Existing Backend tests | `238/238` passed |
| Production build | Passed |
| `npx tsc --noEmit` | Passed |

New test-first suite:

| Run | Test database | Result | Cleanup |
| --- | --- | --- | --- |
| Run 1 | `webapple_test_3cf31cf4` | `22 pass / 18 fail / 40 total` | PostgreSQL container destroyed |
| Run 2 | `webapple_test_9f4f24ec` | `22 pass / 18 fail / 40 total` | PostgreSQL container destroyed |

Both official runs failed on exactly the same 18 test IDs. There was no
failure-set drift. Logs:

- `/tmp/inventory-serial-run-1.log`
- `/tmp/inventory-serial-run-2.log`

The failures are retained intentionally. Production code and test expectations
were not changed to make the suite pass.

## 2. Implementation under test

- Stock is one global `product_variants.stock_quantity` counter.
- Receipt creation may also create `product_items`, but serial input is
  optional.
- A product item has one globally unique serial, one variant, a numeric status,
  and optional receipt/order-detail relations.
- Inventory receipt and counter-adjustment endpoints are mounted under
  `/api/admin/inventory`.
- Generic serialized-item CRUD is mounted under
  `/api/admin/product-items`.
- Both route groups require an active authenticated `Admin` or
  `WarehouseStaff`.
- `stock_reservations` is schema-only.
- Warehouse locations, transfers, IMEI fields, serial assignment routes, and a
  stock movement ledger are not implemented.

The detailed reconstructed contract is in
`docs/INVENTORY_SERIAL_CONTRACT.md`.

## 3. Test artifacts

| Artifact | Coverage |
| --- | --- |
| `tests/factories/inventory-serial.factory.ts` | Deterministic roles, accounts, suppliers, catalog, counter-stock variants, serial statuses, order links, reservations, snapshots, and rollback triggers |
| `tests/api/inventory/inventory-query.integration.test.ts` | Authentication, RBAC, filtering, pagination, query validation, and data exposure |
| `tests/api/inventory/inventory-receipt.integration.test.ts` | Receipt integrity, authoritative fields, validation, serial/counter consistency, concurrency, and rollback |
| `tests/api/inventory/serial-receipt.integration.test.ts` | Serial normalization/uniqueness, status mass assignment, sold immutability, standalone drift, and concurrency |
| `tests/api/inventory/inventory-issue.integration.test.ts` | Manual stock issue/adjustment, non-negative stock, authoritative audit, serialized reconciliation, concurrency, and rollback |
| `tests/api/inventory/order-stock-restoration.integration.test.ts` | Cancellation, serialized release, reservation release, double cancellation, rollback, and completed-order immutability |

No warehouse-transfer, reservation, or serial-assignment endpoint tests were
invented because those runtime APIs do not exist.

## 4. Passing coverage

The following 22 tests passed on both runs:

- `INV-QRY-001` through `INV-QRY-005`, and `INV-QRY-008`.
- `INV-RCV-001` through `INV-RCV-004`, `INV-RCV-007`, and `INV-RCV-008`.
- `SER-RCV-001` through `SER-RCV-003`, and `SER-RCV-007`.
- `INV-ISS-001` through `INV-ISS-003`, and `INV-ISS-005`.
- `INV-RST-003` and `INV-RST-004`.

Confirmed behavior includes:

- authentication, locked-account rejection, and explicit Inventory RBAC;
- valid stock/SKU/product/serial/status filtering and safe response fields;
- valid receipt transaction across receipt, line, counter, serials, and audit;
- actor and computed stock values are server-authoritative;
- unknown receipt/adjustment mass-assignment fields do not override stored
  actor, before/after stock, or timestamps;
- missing or inactive-product variants, zero/negative/fractional quantities,
  serial count mismatch, and exact duplicate serials are rejected;
- one or multiple valid serials are trimmed and linked to their receipt lines;
- valid issue and exact final-unit issue do not produce negative stock;
- deletion of a sold serial is blocked;
- a forced order-history failure rolls back order, payment, counter, serialized
  relations, and history;
- a completed order cannot be cancelled and its sold serial remains unchanged.

## 5. Stable failure table

Root causes that are not directly proven by the assertion and static execution
path are identified as hypotheses.

| Test ID | Expected | Actual | Severity | Likely root cause | Business/security risk |
| --- | --- | --- | --- | --- | --- |
| `INV-QRY-006` | Invalid zero, negative, decimal, array/repeated, and boolean pagination returns controlled `400`. | All tested cases returned `200` using a coerced or fallback page/limit. | Medium | `Number(...)`, `||` defaults, and clamps run without strict runtime/query cardinality validation. | Invalid input is silently accepted and API behavior becomes ambiguous. |
| `INV-QRY-007` | Invalid `stockStatus`, sort, product ID, and threshold return controlled `400`. | Status, sort, and product-ID cases returned `200`; invalid threshold returned `400`. | Medium | Unknown enums fall through to default behavior; a coercible/invalid product ID is ignored or accepted. | Filters can broaden a privileged inventory query unexpectedly. |
| `INV-QRY-009` | Invalid Product Item identifiers, pagination, and enum filters return controlled `400`. | Only invalid status returned `400`; the remaining invalid values returned `200` with defaults/omitted filters. | Medium | `parsePositiveInt`, `parsePage`, and `parseLimit` coerce then silently omit/default. | Invalid filter input can return a broader serial data set than requested. |
| `INV-RCV-005` | Numeric string, array, and boolean quantity return `400`; no receipt/counter/item mutation. | Each case returned `201` and created receipt data while changing stock. | High | Receipt `normalizePositiveInteger` calls `Number(value)` before validating. | Weak runtime validation permits unintended stock mutations. |
| `INV-RCV-006` | A serialized iPhone receipt with quantity two and no serials returns `400`; no mutation. | Returned `201`, increased the counter, and created no product items. | Critical | Serial input is optional and no variant/category serialization rule is enforced. | Physical serialized inventory and sellable counter diverge immediately. |
| `INV-RCV-009` | Concurrent receipts for one serial produce one `201`, one sanitized `409`, one receipt/line/item, and one counter increment. | Database state committed exactly once, but statuses were `201` and `500`. | High | Precheck races; the DB unique constraint protects data, but the Prisma unique conflict is not mapped to a typed `409`. | Correct data integrity but unstable API contract and possible internal error disclosure. |
| `INV-RCV-010` | Audit persistence failure returns sanitized `500`; receipt, counter, and serial changes roll back. | Rollback was complete, but public message was `controlled inventory audit failure`. | High | Inventory controller returns unexpected `Error.message`. | Internal operational/database details can be disclosed. |
| `SER-RCV-004` | Non-string serial number/array/boolean/object returns controlled `400`; no receipt mutation. | Returned `500`; database remained unchanged. | High | `normalizeText` invokes optional `.trim()` on a non-string runtime value. | Raw type failures can leak and bypass the normal validation contract. |
| `SER-RCV-005` | Client cannot create a product item as `Sold` or assign order/sold/reservation fields; `400`, no row. | Returned `201` and created a `Sold` item; unsupported relation fields were ignored. | Critical | Generic creation DTO exposes arbitrary item status, including `Sold`. | A privileged client can manufacture sold-state inventory without an order lifecycle. |
| `SER-RCV-006` | A sold serial cannot be returned to `InStock` by generic update. | Returned `200` and changed the persisted status to `InStock`. | Critical | Sold-item guard explicitly permits status-only updates without a transition rule. | The same physical serial can re-enter available stock and be sold again. |
| `SER-RCV-008` | Standalone `InStock` serial creation on a serialized variant is rejected or atomically reconciled; no drift. | Returned `201`; `InStock` item count increased while counter did not. | Critical | Product Item service intentionally does not update the stock counter. | Parallel stock representations diverge and availability is unreliable. |
| `SER-RCV-009` | Concurrent standalone creation of one serial produces one `201`, one sanitized `409`, and one row. | Database committed one row, but statuses were `201` and `500`. | High | Hypothesis confirmed by code path: precheck races and the DB unique exception reaches the global unexpected-error handler. | Conflict leaks as server failure and may expose database details. |
| `INV-ISS-004` | String, array, and boolean adjustment quantity returns `400`; counter/audit unchanged. | Returned `200` and mutated counter/audit for every coercible value. | High | Adjustment normalization uses `Number(value)` before integer validation. | Unintended stock issue or increase through weak runtime validation. |
| `INV-ISS-006` | Concurrent final-unit issues allow one `200`, one controlled `409`, final stock zero, and one audit. | Final stock was zero, but both operations wrote audit events; two successful read-compute-set paths were observed. | Critical | Transaction reads then writes an absolute counter without conditional claim/lock. | Two requests can both report issuing the same last unit; audit and physical fulfillment disagree. |
| `INV-ISS-007` | Counter-only adjustment on a serialized variant is rejected or reconciled; no drift. | Returned `200`; counter became two while `InStock` serial count remained one. | Critical | Adjustment changes only `stock_quantity`. | Sellable stock can exist with no physical serialized device. |
| `INV-ISS-008` | Audit failure returns sanitized `500` and rolls back counter/audit. | Rollback was complete, but public message was `controlled inventory audit failure`. | High | Inventory controller exposes unexpected `Error.message`. | Internal failure details are disclosed. |
| `INV-RST-001` | Cancellation restores counter and, in the same transaction, returns the assigned item to `InStock`, clears its order link, and releases its reservation. | Order cancellation and counter restoration succeeded; item stayed `Reserved` and linked to the order detail, and reservation stayed `Active`. | Critical | Cancellation implements counter/voucher/payment/shipment/history restoration but never updates `product_items` or `stock_reservations`. | Cancelled orders retain ownership of physical units and stale reservations. |
| `INV-RST-002` | Concurrent double cancellation restores counter, serial, and reservation exactly once. | Counter/order double-restock protection worked, but serial stayed `Reserved`/linked and reservation stayed `Active`. | Critical | Atomic order-status claim exists; serialized/reservation release is absent. | Counter is correct while physical/reserved inventory remains unavailable and inconsistent. |

## 6. Integrity analysis

### 6.1 Stock source of truth

The sellable source of truth is the variant counter, not serialized items.
This is statically confirmed by checkout and dynamically confirmed by query,
receipt, adjustment, and cancellation tests. The suite demonstrates two
independent ways to violate the decision-document invariant:

1. receipt serialized-category quantity without serials; and
2. generic Product Item or manual counter mutation affecting only one side.

This is a Critical integrity gap because checkout can sell counter stock for
which no serialized device exists.

### 6.2 Warehouse consistency and transfer integrity

Warehouse inventory is not implemented. The receipt actor field cannot serve
as location ownership. There is no Warehouse A/B fixture because no schema
record can be created without inventing a model. No transfer endpoint test was
created. Consequently:

- per-warehouse availability cannot be queried or enforced;
- a serial cannot be proved to exist at one warehouse;
- total-stock conservation across transfers cannot be verified;
- concurrent transfer behavior has no runtime surface.

Classification: **Not implemented / Route missing**, not a failed endpoint.

### 6.3 Serial uniqueness

Exact serial uniqueness is strong at the database layer and both normal and
concurrent tests show only one row can commit. Receipt prevalidation also
rejects duplicates within one line, across receipt lines, and already stored
exact serials.

The remaining defects are error mapping during concurrent conflicts and the
absence of case normalization. Whether `abc123` and `ABC123` are the same
logical serial remains blocked by a product decision.

### 6.4 IMEI uniqueness

IMEI is **Not implemented**. There is no IMEI column, DTO, filter, response
field, or unique constraint. It was therefore impossible to test IMEI length,
dual-SIM behavior, or uniqueness without inventing an API.

### 6.5 Assignment integrity

The schema allows `product_items.order_detail_id`, but no mounted endpoint or
service atomically assigns an available serial to an order. Checkout decrements
only the variant counter. The generic Product Item DTO cannot assign an order
relation. Double-claim behavior is therefore not testable through an existing
runtime contract.

Classification: **Schema relation only / Route missing**.

### 6.6 Reservation integrity

`stock_reservations` is **Schema only**. No tested production flow creates,
claims, expires, or releases it. The cancellation tests insert representative
schema data directly and demonstrate that the existing cancellation service
leaves it `Active`. Availability calculations do not subtract reservations.

### 6.7 Cancellation and restock

The existing order-status conditional claim prevents counter double-restock,
including concurrent cancellation. Transaction rollback across modeled order,
payment, counter, and history changes is effective. However, both single and
double-cancellation tests confirm that serialized item state, item-to-order
linkage, and reservation state are never restored.

### 6.8 Concurrency

- Checkout's existing conditional counter decrement continues to protect
  against oversell in the established suites.
- Concurrent exact-serial receipt/item creation commits once because of the
  unique constraint, but the losing request receives `500`.
- Concurrent manual issue uses read-compute-set. Both calls can succeed against
  the same starting unit and create two audits even though final stock happens
  to be zero.
- Concurrent cancellation restores the counter once due to the order-status
  claim, while missing serial/reservation release remains missing for both
  callers.
- Double serial assignment and double transfer cannot be tested because those
  APIs do not exist.

The PostgreSQL driver also emitted a deprecation warning during concurrent test
execution about calling `client.query()` while a client was already executing.
It did not change the stable result, but the harness/runtime should avoid
depending on that deprecated queuing behavior.

### 6.9 Transaction rollback

Receipt and adjustment transactions correctly roll back their mutations when
audit persistence is deliberately failed. Order cancellation correctly rolls
back order, payment, counter, serialized relations present at entry, and
history when order-history insertion fails. The defects do not justify
rewriting these transactions wholesale; missing serialized actions, atomic
claims, typed conflicts, and sanitization are the focused fix areas.

### 6.10 Error sanitization

Expected business errors generally map to controlled `400`, `404`, or `409`.
Unexpected errors are unsafe:

- Inventory sends any `Error.message` directly.
- Product Item forwards unexpected failures to a global handler that also sends
  `err.message`.
- Concurrent DB unique conflicts become `500`.
- Non-string serial values trigger unexpected type failures.

No response should expose a raw Prisma constraint, SQL detail, stack, local
path, or internal trigger/error message.

## 7. Missing implementation

| Capability | Evidence classification |
| --- | --- |
| Warehouse/location inventory | Not implemented |
| Warehouse transfer | Route missing and schema missing |
| Serial-to-warehouse relation | Not implemented |
| IMEI / dual-SIM identifiers | Not implemented |
| Variant-level `requiresSerial` metadata | Not implemented |
| Serial assignment/atomic claim | Route missing |
| Reservation create/release/expiry | Schema only |
| Fulfillment-driven Sold transition and `soldAt` | Partial implementation / schema field missing |
| Serialized cancellation release | Partial implementation |
| Serialized completion/delivery update | Not implemented |
| Dedicated inventory movement history | Not implemented; audit logs only |
| Reconciliation endpoint/job | Not implemented |

## 8. Regression

All focused historical suites passed:

| Command | Test database | Result | Cleanup |
| --- | --- | --- | --- |
| `npm run test:payment-integrity` | `webapple_test_5286ae23` | `29/29` passed | Container destroyed |
| `npm run test:order-lifecycle` | `webapple_test_87e3dc3e` | `35/35` passed | Container destroyed |
| `npm run test:checkout-cod` | `webapple_test_a48571ba` | `40/40` passed | Container destroyed |
| `npm run test:catalog` | `webapple_test_f348bc9c` | `29/29` passed | Container destroyed |
| `npm run test:cart-address` | `webapple_test_5ba783e4` | `21/21` passed | Container destroyed |
| `npm run test:auth` | `webapple_test_69c42d3c` | `28/28` passed | Container destroyed |
| `npm run test:rbac-idor` | `webapple_test_667ecefa` | `45/45` passed | Container destroyed |

Full post-addition regression:

| Command | Test database | Result | Cleanup |
| --- | --- | --- | --- |
| `npm test` | `webapple_test_369fae54` | `260 pass / 18 fail / 278 total` across 23 files | Container destroyed |

The full failure set is exactly the 18 new test-first findings in section 5.
Therefore all `238/238` tests that existed before this phase remain passing.
The full log is `/tmp/inventory-serial-full-regression.log`.

Final quality gates:

| Command | Result |
| --- | --- |
| `npm run build` | Passed |
| `npx tsc --noEmit` | Passed |

## 9. Limitations

- The suite tests only routes mounted by the current Customer/Admin composition
  roots.
- Warehouse, transfer, IMEI, assignment, and reservation API tests were not
  created because the corresponding runtime contracts do not exist.
- The tests use deterministic data but do not assume auto-increment IDs.
- Each Vitest command uses a fresh PostgreSQL 16 Testcontainers database and
  destroys its container during global teardown.
- The test suite does not call production payment, upload, email, or other
  external services.
- Case-insensitive serial normalization and exact sold-transition timing remain
  blocked product decisions.
- Production source, Prisma schema/migrations, and Frontend were not modified.
