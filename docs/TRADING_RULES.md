# Trading Rules

- All order and super-order placement requests must include `correlationId`
- The SDK may generate `correlationId`, but it must always send one
- `correlationId` is a lookup/correlation tag, not an idempotency key: Dhan does
  not de-duplicate on it. After an uncertain placement (timeout, connection
  reset), recover with `getByCorrelationId` — never re-send the POST
- Do not retry order placement, modification, cancellation, or super-order writes automatically
- Validate trading-critical payloads before transport
- Use WebSocket state for low-latency market and order updates
- Keep LTP data in a single source of truth store
- Generated REST types are not a substitute for runtime validation

Failure to follow these rules creates duplicate-order and stale-state risk.
