# Shipment, Delivery and Fulfillment Test Report

## Execution summary

Branch: `test/backend-shipment-delivery-integrity`  
Commit before testing: `91212c0`  
Node: `v22.14.0`  
npm: `10.9.2`  
Docker Engine: `28.5.1`  
PostgreSQL: `16.14` (`postgres:16-alpine` via Testcontainers)

No development database, production payment account, production carrier, or
external callback was used.

### Baseline before adding shipment tests

| Gate | Result |
| --- | --- |
| `npm test` | PASS — 23/23 files, 278/278 tests |
| `npm run build` | PASS |
| `npx tsc --noEmit` | PASS |

Baseline database: `webapple_test_3cc9a8be`; its PostgreSQL container was
destroyed. The only non-failing diagnostic was the existing `pg` concurrent
query deprecation warning.

### New suite

| Metric | Run 1 | Run 2 |
| --- | ---: | ---: |
| Database | `webapple_test_387ce8ef` | `webapple_test_b3b88a3f` |
| Test files | 6 | 6 |
| Tests | 41 | 41 |
| Pass | 21 | 21 |
| Fail | 20 | 20 |
| Container cleanup | Destroyed | Destroyed |

The exact `FAIL` lines were compared with:

```bash
diff \
  <(grep '^ FAIL ' /tmp/shipment-delivery-run-1.log) \
  <(grep '^ FAIL ' /tmp/shipment-delivery-run-2.log)
```

The comparison produced no output. The failure set is stable across two fresh
databases.

## Files and coverage

New test files:

- `tests/api/shipment/shipment-query.integration.test.ts`
- `tests/api/shipment/shipment-creation.integration.test.ts`
- `tests/api/shipment/shipment-status.integration.test.ts`
- `tests/api/shipment/order-shipment-sync.integration.test.ts`
- `tests/api/shipment/shipment-tracking.integration.test.ts`
- `tests/api/shipment/shipment-transaction.integration.test.ts`

Support:

- `tests/api/shipment/shipment-test-helpers.ts`
- `tests/factories/shipment-delivery.factory.ts`
- `package.json` adds `test:shipment-delivery`

No ShipmentItem, ShipmentSerial, or callback test file was created because the
corresponding model/API linkage does not exist. Creating such tests would
invent routes or schema.

## Passing coverage

The 21 passing tests execution-confirm:

- authentication on Customer/Admin shipment routes;
- locked-account rejection;
- role enforcement for Admin, Staff, WarehouseStaff, Customer and unknown role;
- customer ownership-safe 404 by shipment ID and order ID;
- no cross-customer disclosure in IDOR responses;
- public customer mapper omits credentials, audit and nonexistent carrier
  internals;
- valid list pagination/filter/order/sort envelope;
- query operations are database read-only;
- valid COD shipment creation, initial history, actor audit and order
  `Confirmed -> Processing` synchronization;
- rejection of cancelled, completed and pre-confirmation orders;
- all documented sequential shipment transitions;
- representative invalid/terminal transitions with no mutation;
- strict rejection of invalid status enum/runtime types;
- authorization runs before status validation/controller mutation;
- `Preparing`, `Shipped`, `InTransit`, and `Delivered` order synchronization;
- COD success/`paid_at` on delivered;
- successful online payment is not rewritten;
- eligible shipment cancellation does not implicitly cancel/refund/restore;
- cancelled/completed order guards;
- valid normalized tracking/provider update and audit;
- customer tracking mutation denial;
- terminal shipment tracking immutability.

## Stable failure table

All expected/actual values below were reproduced in both runs. “Hypothesis”
marks root cause conclusions that are based on a strong static trace but would
need a production fix/regression cycle to close.

| Test ID | Expected | Actual | Severity | Likely root cause | Business/security risk |
| --- | --- | --- | --- | --- | --- |
| SHP-CRT-002 | Missing order -> 404; no shipment/history/audit | 400; no mutation | Medium | All Admin shipment errors are flattened to 400 | Unstable API taxonomy; clients cannot distinguish missing resource |
| SHP-CRT-004 | Confirmed online order with Pending payment -> 400; no mutation | 201; shipment/history/order transition created | High | Eligibility checks only order status, not gateway/payment success | Unpaid online order can enter fulfillment |
| SHP-CRT-005 | Existing shipment -> controlled 409; unchanged | 400; unchanged | Medium | Duplicate business error has no typed 409 mapping | Retry/conflict handling is ambiguous |
| SHP-CRT-006 | Duplicate tracking -> controlled 409; no partial mutation | 400; no mutation | Medium | Duplicate pre-check throws generic Error | Conflict contract drift |
| SHP-CRT-007 | Numeric-string `orderId` -> 400; no mutation | 201; shipment/history/order transition created | Medium | `Number(dto.orderId)` coerces runtime type | Weak validation and unintended request acceptance |
| SHP-CRT-008 | Explicit blank tracking -> 400; no mutation | 201; untracked shipment created | Medium | `trim() || null` silently normalizes blank to null | Invalid carrier handoff data can be persisted |
| SHP-CRT-009 | Client terminal initial status/internal fields -> 400; no mutation | 201; shipment is created as `Delivered`; unknown fields ignored | High | Create DTO/service accepts client `status` | State-machine bypass; order/payment synchronization is skipped while shipment is terminal |
| SHP-CON-001 | Concurrent same-order create -> one 201, one controlled 409, one row/history/transition | 201 + 201; duplicate shipments accepted | High | Pre-read race and no unique constraint on `shipments.order_id` | Duplicate fulfillment/tracking and inconsistent order operations |
| SHP-QRY-007 | Invalid/non-positive/decimal/structured/over-limit pagination -> controlled 400 | Every request returned 200 via fallback/default behavior | Medium | `Number(...) > 0 ? value : default`; no integer/type/max checks | Unbounded or misleading queries; validation bypass |
| SHP-QRY-008 | Invalid status/order filter -> 400; query not broadened | Status -> 400; text/decimal order IDs -> 200 broad list | Medium | `NaN` becomes falsy/absent; integer is not required | Invalid scoped query silently becomes a broader data query |
| SHP-STS-003 | Same-state update -> controlled 409/idempotent result; no side effect | 400; no mutation | Low | Generic state errors map to 400 | Retry semantics are not explicit |
| SHP-CON-002 | Concurrent Delivered -> one side-effect winner, one conflict/idempotent response; one history/order/payment completion | 200 + 200; both requests accepted | High | Stale pre-transaction read and unconditional update | Duplicate completion history/audit and repeated side effects |
| SHP-CON-003 | Cancel/deliver race -> one terminal winner; order/payment consistent | 200 + 200; both terminal operations accepted | Critical | Cancel and status update use separate stale reads and unconditional writes | Shipment can be Cancelled while order/payment record Delivered/Completed, or vice versa |
| SHP-TRK-002 | Duplicate tracking update -> controlled 409; both rows unchanged | 400; rows unchanged | Medium | Generic duplicate error mapping | Conflict cannot be handled reliably |
| SHP-TRK-003 | Blank tracking update -> 400; original tracking retained | 200 + 200; persisted tracking cleared to null | Medium | Blank normalization is treated as a valid clear operation | Tracking traceability can be removed accidentally |
| SHP-TRK-004 | Non-string tracking/provider -> sanitized 400; unchanged | 400 with raw `trim is not a function`; unchanged | High | `.trim()` is called without runtime type validation | Internal implementation disclosure and weak validation |
| SHP-TRK-005 | Overlong tracking -> controlled sanitized 400; unchanged | 400 containing Prisma invocation and local source path; transaction rolled back | High | No length validation; controller returns raw persistence message | Database/framework/path information disclosure |
| SHP-TXN-001 | Forced creation-history persistence failure -> sanitized 500; complete rollback | 400 with raw database error; shipment/order/history/audit rollback succeeds | High | Transaction is correct; controller misclassifies/exposes unexpected error | Information disclosure and incorrect retry semantics |
| SHP-TXN-002 | Forced status-history failure -> sanitized 500; complete shipment/order/COD/history rollback | 400 with raw database error; rollback succeeds | High | Same generic catch/raw message path | Operational error leakage; clients may treat server failure as bad input |
| SHP-TXN-003 | Forced audit failure -> sanitized 500; provider/tracking rollback | 400 with raw database error; rollback succeeds | High | Same generic catch/raw message path | Internal failure disclosure despite correct atomicity |

## Analysis by integrity area

### Shipment creation

The successful path is transactional and correctly sources the actor from the
authenticated request. It leaves stock, assigned serial and payment unchanged.
The primary failures are payment eligibility, runtime coercion, client-selected
initial status, blank tracking, conflict mapping, and same-order concurrency.

The client-supplied `deliveredAt`, `createdBy` and internal-looking metadata are
not persisted because those fields do not exist in the service data object.
That protection does not offset the more important accepted `status:
Delivered` field.

### Item allocation and serialized fulfillment

There is no ShipmentItem model or route. Consequently no runtime path exists
to validate order-detail ownership, per-shipment quantity, split allocation,
or duplicate allocation.

`product_items.order_detail_id` can associate a serial with an order detail,
but no shipment relation exists. Delivery leaves an assigned serial unchanged
(the deterministic fixture remains status 2/Reserved). This is reported as an
implementation gap rather than a fabricated endpoint failure. There is no
test claiming that an absent shipment-serial API works.

### Tracking integrity

PostgreSQL enforces unique non-null tracking codes, and the normal update is
transactional/audited. The API lacks strict type/length/blank validation and
typed conflict mapping. No customer tracking lookup route exists, so tracking-
based IDOR was not tested through a guessed URL. Existing ID- and order-based
customer ownership checks pass.

### State machine

The PATCH state table matches the canonical decisions and all documented
sequential transitions pass. Terminal reversals and skipped transitions are
rejected without mutation.

Drift remains in the generic DELETE cancellation path, which allows every
non-terminal status rather than consulting the same transition map, and in
same-state/concurrency behavior. The critical issue is atomicity of the
state claim, not the transition table itself.

### Order and payment synchronization

Sequential mapping is correct:

```text
Preparing -> Processing
Shipped/InTransit -> Shipping
Delivered -> Completed
Delivered COD Pending -> Success + paidAt
```

Successful online payment is preserved. Shipment cancellation does not
implicitly cancel the order, restore stock, release serial, or refund payment.
Under cancel/deliver races, however, both operations can succeed and the final
shipment state may disagree with the completed order/COD payment.

### IDOR and data exposure

Customer lookups include both shipment/order ID and current authenticated
`user_id` in the Prisma predicate. A foreign shipment and foreign order both
return the same ownership-safe 404 family and do not expose tracking, order
code or customer snapshot data. Authentication and role middleware execute
before controllers.

No carrier payload, signature, warehouse internal field or cost-price field
exists on the model/DTO. Audit metadata and password hashes are not mapped.
There is no privacy classification for shipment history notes, which is a
design limitation rather than an observed cross-customer leak.

### Concurrency

`SHP-CON-001`, `SHP-CON-002`, and `SHP-CON-003` are stable failures:

- two same-order create requests both return 201;
- two Delivered updates both return 200;
- cancel and Delivered both return 200.

The common cause is a read/check outside the write transaction followed by an
unconditional primary-key update/create. There is neither a database
one-shipment constraint nor an atomic old-state predicate.

### Callback and carrier integration

No external carrier callback/webhook exists. There is no signature,
carrier/tracking binding, replay protection, event order handling, or callback
error path to execute. This is **Not implemented / No tracking callback**, not
a skipped test.

### Transaction rollback

Controlled PostgreSQL triggers forced failures at:

- initial shipment history creation;
- Delivered shipment history creation;
- tracking-update audit insertion.

Database snapshots confirm rollback of the affected shipment, order,
order/shipment history, COD payment, provider/tracking, stock and assigned
serial state. The transaction should not be rewritten wholesale. The defect is
HTTP mapping/sanitization: unexpected persistence failures are returned as raw
400 responses instead of sanitized 500 responses.

### Validation, filtering and sorting

Valid page/limit/status/order/sort queries pass. Invalid pagination silently
falls back, limit is uncapped, and malformed order filters can broaden to the
unfiltered list. Invalid status is controlled 400. Invalid sort silently maps
to newest. There are no dedicated carrier/tracking filter fields; `search` is
the only implemented text filter.

### Error sanitization

Auth 401, role 403 and customer ownership 404 paths are controlled. Shipment
controllers otherwise catch all errors and return raw messages with HTTP 400.
Execution reproduced:

- JavaScript implementation text (`trim is not a function`);
- Prisma invocation details and local source path;
- controlled PostgreSQL failure text.

Required remediation is typed business errors plus forwarding unexpected
errors to the sanitized global error middleware.

## Missing implementation

| Capability | Finding |
| --- | --- |
| Delivery model/API | Not implemented; represented only by shipment status |
| Carrier model/enum | Not implemented; free-form string |
| ShipmentItem allocation | Not implemented |
| Split shipment | No split-shipment support |
| Shipment–Warehouse | Not implemented |
| Shipment–Serial/IMEI | Not implemented |
| `deliveredAt`/`cancelledAt` | Schema/field absent |
| Carrier callback/webhook | Route missing; no tracking callback |
| Carrier signature/replay protection | Not implemented |
| Atomic same-order creation | No concurrency guard |
| Atomic status transition | No concurrency guard |

## Regression and quality gates

The final regression commands and results after the two stable shipment runs:

| Command | Result |
| --- | --- |
| `npm run test:smoke` | PASS — 6/6 |
| `npm run test:auth` | PASS — 28/28 |
| `npm run test:rbac-idor` | PASS — 45/45 |
| `npm run test:cart-address` | PASS — 21/21 |
| `npm run test:catalog` | PASS — 29/29 |
| `npm run test:checkout-cod` | PASS — 40/40 |
| `npm run test:order-lifecycle` | PASS — 35/35 |
| `npm run test:payment-integrity` | PASS — 29/29 |
| `npm run test:inventory-serial` | PASS — 40/40 |
| `npm run test:security` | First chained run: one 30-second supplier-read timeout; independent fresh-container rerun PASS — 47/47 |
| `npm test` | 29 files; 299 pass / 20 fail / 319 total |
| Existing tests within full run | PASS — 278/278 |
| New shipment tests within full run | 21 pass / 20 fail / 41 total |
| `npm run build` | PASS |
| `npx tsc --noEmit` | PASS |

Full regression database: `webapple_test_f1586ecc`; its container was
destroyed. The standalone security rerun used `webapple_test_5b3928e3` and
also destroyed its container. The chained security timeout was not reproduced
and did not involve an assertion mismatch; it is retained here as execution
history rather than hidden.

The suite intentionally remains red for the 20 product/contract failures above.
No production implementation or existing test expectation was changed.

## Limitations

- No external carrier or callback service exists or was called.
- No split-shipment or shipment-item API exists, so allocation tests were not
  invented.
- No shipment-serial relation exists, so serial claim race tests cannot be
  expressed through the Shipment API.
- No delivered/cancelled timestamp exists, so “written exactly once” cannot be
  asserted.
- Failure-trigger tests use test-only PostgreSQL triggers and remove them in
  `finally` blocks.
