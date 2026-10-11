# WebSocket Protocol

## Streams

- `MarketFeedWS` connects to the Dhan market feed WebSocket (`wss://api-feed.dhan.co`)
- `MarketDepthWS` connects to the 20-level (`wss://depth-api-feed.dhan.co/twentydepth`) or 200-level (`wss://full-depth-api.dhan.co/twohundreddepth`) full market depth WebSocket
- `OrderUpdateWS` connects to the Dhan live order update WebSocket (`wss://api-order-update.dhan.co`)
- `DhanWS` provides a unified entrypoint for managing all three sockets (`market`, `orders`, and optional `depth`).
- All three are **production only** — Dhan has no sandbox WebSocket. In
  `hybrid` mode they stream production data with the primary credentials, and
  sandbox orders never appear on the order-update socket. In `sandbox` mode
  `DhanClient` blocks the sockets (`BaseWS.block`): `connect()` rejects with
  `SandboxUnsupportedError` without opening a connection or retrying.

## Market feed rules (`MarketFeedWS`)

- Request messages are JSON: subscribe with `RequestCode` 15 (Ticker), 17
  (Quote) or 21 (Full); unsubscribe with 16, 18 or 22 respectively.
  `unsubscribe()` sends the request — the server keeps streaming otherwise
- Response messages are binary
- Binary packets are little-endian (8-byte header: packet code, length, segment, security ID)
- A single incoming message may contain multiple packets
- Exchange segment names on inbound packets are resolved from active subscriptions, falling back to the annexure codes:
  0 `IDX_I`, 1 `NSE_EQ`, 2 `NSE_FNO`, 3 `NSE_CURRENCY`, 4 `BSE_EQ`, 5 `MCX_COMM`, 7 `BSE_CURRENCY`, 8 `BSE_FNO`
- Response code 7 (market status) is emitted as a `market-status` event with the raw packet; code 50 (server disconnect) as `disconnect`
- Instrument batching is capped at 100 instruments per subscribe message

## Market depth rules (`MarketDepthWS`)

- **20-Level Depth**: `wss://depth-api-feed.dhan.co/twentydepth` (up to 50 instruments: NSE_EQ and NSE_FNO)
- **200-Level Depth**: `wss://full-depth-api.dhan.co/twohundreddepth` (1 instrument per connection)
- Subscribe with `RequestCode: 23`; unsubscribe with `RequestCode: 24`
  (matching the official DhanHQ-py client — docs.dhanhq.co lists 25)
- 20-level requests carry an `InstrumentList` (batched by 50); 200-level
  requests are flat (`ExchangeSegment`, `SecurityId` at the top level)
- Subscribing beyond the per-connection cap throws `DhanError` with code
  `DEPTH_SUBSCRIPTION_LIMIT`
- Binary response packets use a **12-byte header** + 16-byte level payload:
  - Header: `int16 LE messageLength`, `uint8 responseCode` (41 = Bid, 51 = Ask), `uint8 exchangeSegmentCode`, `int32 LE securityId`, `uint32 LE seq/rowCount`
  - Levels (16 bytes each): `float64 LE price`, `uint32 LE quantity`, `uint32 LE orderCount`
- Response code 50 is a server disconnect for one instrument: a 14-byte
  packet whose last two bytes are an `int16 LE` reason code. Emitted as
  `"disconnect"` (`MarketDepthDisconnectEvent`: `securityId`,
  `exchangeSegment`, `reasonCode`)
- Emits `"depth"`, `"depth20"`, and `"depth200"` events with typed `MarketDepthEvent` payloads.

## Order update rules (`OrderUpdateWS`)

- Auth is a JSON login message sent on socket open
- Incoming order updates are JSON
- Order state is stored in `OrderStore` keyed by order ID and correlation ID

## Reconnect & Resilience

- All WS classes inherit from `BaseWS` and support exponential backoff with jitter (`reconnectDelayMs`, `maxReconnectDelayMs`)
- Optional `maxReconnectAttempts` parameter stops retries when a limit is exceeded and emits a `"reconnect_failed"` event
- The token is resolved from the client on every connect and reconnect, so a
  token from `enableAutoTokenManagement`, or one renewed or replaced after
  startup, reaches the sockets
