# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **Safety:** a `401` on a trading write (any request not marked
  `safeToRetry: true` — order place/modify/cancel/slice, super, forever,
  conditional and Global Stocks orders, exit-all, P&L exit, kill switch, IP
  setup) no longer replays the request after token renewal. The token is
  still renewed via `onTokenExpired`; the request is sent exactly once and an
  `AuthenticationError` (`status: 401`, `cause`: the `ApiResponseError`) is
  thrown. Read-only requests keep the renew-and-retry-once behaviour.
- `Charts.intraday`, `Charts.historical`, `Charts.option` and
  `Funds.calculateMargin` are now `safeToRetry: true`, so they recover from a
  `401` by renewing the token and retrying once. eDIS form submissions stay
  non-replayable.

### Added

- `OptionLeg.average_price` (Option Chain v2.5) and v2.5 response-contract
  regression tests.

### Changed

- Docs: `correlationId` is described as a correlation/lookup tag, not an
  idempotency key, with the timeout → lookup → no-replay recovery flow.

## [1.1.0] - 2026-08-24

### Added

- `ApiResponseError` and `RateLimitError` now parse Dhan's
  `{errorType, errorCode, errorMessage}` response envelope and expose it as
  typed `errorCode`/`errorType`/`errorMessage` fields.

### Changed

- A `429` response (or a `DH-904` `errorCode` on any status) from the REST
  API is now classified as `RateLimitError` instead of a generic
  `ApiResponseError`. `HttpClient` reads the response's `Retry-After` header
  into `retryAfterMs` and honors that delay before retrying a
  safe-to-retry `GET`, mirroring the existing 5xx retry path.

## [1.0.0] - 2026-08-19

### Changed

- **Package renamed to `@nemesis-oss/dhanhq-sdk`.** The SDK now publishes
  under the `@nemesis-oss` scope instead of `@shubhamtaywade82`. All imports,
  the `npx`/MCP invocation, and the `/browser` and `/mcp` subpath exports
  move to the new scope; the API surface is otherwise unchanged from
  `0.4.2`. `@shubhamtaywade82/dhanhq-ts` is deprecated on npm in favor of
  this package — existing installs keep working, but new installs and
  updates should target `@nemesis-oss/dhanhq-sdk`.

## [0.4.2] - 2026-08-17

### Changed

- **`alerts`, `charts`, `funds`, `marginCalculator`, and `positions` now
  accept plain string literals** (`exchangeSegment: "NSE_EQ"`,
  `productType: "INTRADAY"`, `interval: "5"`), completing the enum-to-literal
  transition across all SDK resources. New request interfaces
  (`PlaceAlertRequest`, `ModifyAlertRequest`, `IntradayChartsInput`,
  `HistoricalChartsInput`, `OptionChartInput`, `KnowYourMarginInput`,
  `MultiScripMarginInput`, `MarginScriptItem`, `ConvertPositionRequest`)
  derive literal unions via `` `${Enum}` `` template-literal types for zero
  maintenance drift. Fixes #21. 5 new tests.
- **`foreverOrders`, `conditionalTriggers`, and `edis` now accept plain
  string literals** (`transactionType: "BUY"`), matching every other
  resource in the SDK. Their request shapes previously passed the raw
  OpenAPI-generated types straight through, and those use TS `enum`s rather
  than string-literal unions, so `"BUY"` didn't type-check —
  `Generated.GTTOrderModel.transactionType.BUY` was required instead. New
  request interfaces (`PlaceForeverOrderRequest`, `AlertConditionInput`,
  `AlertOrderInput`, `EdisFormInput`, etc.) derive their literal unions from
  the generated enums via `` `${Enum}` `` template-literal types, so they
  can't drift out of sync with `npm run generate` and nothing had to be
  hand-transcribed (`indicatorName` alone has 20+ members). Fully backward
  compatible — the old `Generated.*` enum-member workaround still
  type-checks and behaves identically, since an enum member's runtime value
  *is* the same string literal. `ConditionalTriggers.buildPriceCondition()`/
  `buildTechnicalCondition()` simplified accordingly — they no longer need
  internal `as Enum` casts. Fixes #19. 7 new tests.

### Added

- **Browser-safe entry point**, `@shubhamtaywade82/dhanhq-ts/browser`. Built
  as its own tsup entry (mirroring the existing `/mcp` subpath) re-exporting
  `src/ta` (minus the network-fetching `TechnicalAnalysis` class),
  `src/analytics`, `src/risk` (including `Pipeline`), `src/execution`, and
  `src/contracts` — `src/client`/`src/resources`/`src/ws` are structurally
  absent from this entry's module graph, not just tree-shaken away by a
  cooperative bundler. `docs/BROWSER.md` updated to import from it directly.
  Verified against the actual published tarball (CJS + ESM), and wired into
  CI's tarball-install check.
- **`PositionLedger`** (`src/execution`) — derives open positions, fill
  history, realized P&L, and mark-to-market exposure from fills, via
  `recordFill()`. `applyFill()`, the pure add/reduce/close/flip state
  machine underneath it, is exported standalone. Doesn't listen to the
  order-update WebSocket directly — `OrderState`'s typed fields don't carry
  `exchangeSegment`/`transactionType`, and `tradedQty` is cumulative per
  order rather than a per-event delta, so the class-level JSDoc documents
  bridging it from an `OrderTracker` `filled` handler instead, using the
  fields your own place-order request already had. `exposure()` marks
  against the latest `onTick()` price per symbol, falling back to cost
  basis before one arrives. No persistence — in-memory, resets on restart
  or `reset()`. 17 new tests; 268 total.
- **Generated API reference.** `npm run docs:api` (`typedoc` +
  `typedoc-plugin-markdown`) renders every exported class, interface, and
  type into `website/reference/`, wired into `docs:dev`/`docs:build` so the
  existing VitePress site — not a disconnected `docs/api` folder — gets a
  new "Full Reference" nav entry alongside the hand-written guides.
  `src/generated/**` (OpenAPI codegen output) is excluded from the crawl;
  `GeneratedClient`'s own page already documents that escape hatch. Output
  is gitignored and regenerated on every build, not committed.
- **Backtesting harness** (`src/backtest`). `new Backtester().run(config)`
  replays a `Strategy` bar-by-bar over historical `Candle[]`: the strategy
  reacts to a closed bar and returns `enter`/`exit`/`hold`, fills always
  happen at the *next* bar's open (never the deciding bar, so there's no
  lookahead bias), stops/targets are checked intrabar, and at most one
  position is open at a time. Multi-timeframe from the start —
  `higherTimeframesMinutes` resamples the base series once and a two-pointer
  cursor per timeframe guarantees a higher-timeframe bar is only visible
  after it has fully closed, so `indicators.timeframe(60).rsi(14)` and
  `indicators.bias()` (the same blend `analyzeMultiTimeframe()` produces
  live) cost O(n) total, not O(n²), with no lookahead risk. Entries
  optionally gate through the existing `Pipeline.report()` — the same risk
  checks that already run pre-trade in live code, not a parallel model — and
  `CostModel.slippage()`/`fees()` are optional pure-function hooks for
  frictionless-by-default fills. 11 new tests; 257 total.
- **Circuit breaker on `HttpClient`.** After 5 consecutive network/5xx
  failures, `HttpClient` stops issuing new requests for 30s and rejects
  immediately with `CircuitOpenError` instead of queuing behind the rate
  limiter — a struggling backend no longer gets hammered by every in-flight
  caller. Only transport failures (`NetworkError`, `ApiResponseError` with
  status ≥ 500) count toward the threshold; validation errors, 4xx
  responses, and rate-limit throttling do not. Configurable via
  `DhanClientConfig.circuitBreaker` (or disable with `circuitBreaker:
  false`). 8 new tests; 246 total.
- **Jest coverage thresholds.** `jest.config.js` now fails the run if
  statement/line coverage drops below 70%, branch coverage below 55%, or
  function coverage below 62% (floors set a few points under the measured
  baseline). CI now runs `npm test -- --coverage` to enforce it.

### Fixed

- **`Pipeline` resolved to `undefined` when imported from the new
  `/browser` entry, though it worked fine from the main entry.** tsup's
  `splitting: true` let a chunk shared across the four build entries carry
  a lazy `__esm`-wrapped initializer that never ran on `browser.cjs`'s
  access path specifically. `splitting: false` trades per-entry bundle
  size (no more cross-entry dedup) for actually working.
- `HttpClient.normalizeError()` and `BaseWS.scheduleReconnect()` called
  `logger.warn`/`logger.info` with a stray extra `undefined` argument that
  the `Logger` interface's two-argument signature doesn't accept —
  `tsc --noEmit` (and therefore `npm run build`) failed outright on a clean
  install.
- **`npm run lint` couldn't run at all.** `.eslintrc.json` is the legacy
  format; ESLint 9 dropped support for it and this project pins `^10.8.1`,
  so linting has been silently broken since that dependency bump — nothing
  enforced it because CI never called `npm run lint` either. Replaced with
  `eslint.config.js` (flat config, same rule set) and added a lint step to
  CI. Fixed the 7 real errors this surfaced once lint could actually run:
  3 `let` that should have been `const`, one `!x || x.y !== z` rewritten as
  `x?.y !== z`, and one always-false `else if` branch in
  `getMarketSessionInfo()` — provably dead, not a behavioral bug, since
  `lastTradingDay(X)` and `previousTradingDay(X)` compute identically for
  any non-trading day `X`.
- **`npm run lint` crashed on Node 18 in CI** (`TypeError: util.styleText is
  not a function`, inside `eslint@10.8.1`'s own stylish formatter — an API
  Node added in 20.12/21.7 and never backported to 18). Every ESLint 10
  transitive dependency also declares `engines.node: "^20.19.0 || ^22.13.0 ||
  >=24"`, so this wasn't a fluke — ESLint 10 doesn't support Node 18 at all,
  which stayed invisible right up until this branch was the first to wire
  `npm run lint` into CI. Downgraded to `eslint@^9.39.5` /
  `@eslint/js@^9.39.5` (`engines.node: "^18.18.0 || ^20.9.0 || >=21.1.0"`,
  compatible with the `18`/`20`/`22` CI matrix and the README's stated
  Node ≥18 floor); `eslint.config.js` needed no changes since ESLint 9
  already defaults to flat config.
- `.gitignore` had the whole file wrapped in a stray pair of markdown code
  fences (` ``` `) — inert as gitignore patterns (no file is ever named
  that), but clearly a paste artifact. Removed.
- **`npm test -- --runInBand` never exited — it hung indefinitely after
  every test passed.** `BaseWS.startHeartbeat()`'s ping `setInterval` (and
  the pong-timeout/reconnect `setTimeout`s it schedules) never called
  `.unref()`, unlike `OrderTracker.waitFor()`'s timer, which already does.
  Three `DhanClient.spec.ts` tests connect a `MarketFeedWS`/`OrderUpdateWS`
  against a fake socket and, before this fix, never disconnected it, so the
  live heartbeat interval kept the process alive forever once Jest's normal
  multi-worker pool — which force-kills each worker after its tests finish,
  regardless of open handles — was out of the picture. `--runInBand` runs
  everything in the one main process, so nothing was left to force it shut.
  This is why `npm test` always looked fine locally while CI's
  `npm test -- --runInBand --coverage` step could run for 15+ minutes
  producing no new output before GitHub Actions' silence-based watchdog
  cancelled it — confirmed by reproducing the identical hang against a
  clean `main` checkout with none of this branch's other changes applied.
  Added `.unref()` to all three timers and `disconnect()` calls to the
  three tests that were leaving connections open; added a regression test
  asserting the heartbeat timer is unref'd immediately after connecting.

## [0.4.1] — 2026-08-02

### Fixed

- **`RATE_LIMITS` (option chain 1 req/3s, orders 10/s, quote 1/s, etc.) was
  dead data.** `HttpClient` applied one flat Bottleneck queue per GET/write
  regardless of endpoint, so nothing stopped back-to-back `getOptionChain()`
  calls from blowing through Dhan's real 3-second limit and drawing error
  805 — and `MarketFeed.ltp()`/`ohlc()`/`quote()` could exceed the 1/s quote
  limit the same way. `RateLimiter` now keeps a Bottleneck per tier alongside
  the generic read/write queues; a request layers its tier's stricter spacing
  on top via an optional `tier` field on `RequestOptions`. Wired into
  `OptionChain.fetch()`/`expiryList()` (3s lock), every
  `Orders`/`SuperOrders`/`ForeverOrders` call (10/s), and `MarketFeed`'s three
  quote methods (1/s). `client.generated.*` (the raw OpenAPI-codegen escape
  hatch) bypasses `HttpClient` entirely and is documented as such on
  `GeneratedClient` rather than silently left unprotected — prefer the
  wrapped resource classes for anything rate-sensitive. 9 new tests; 238
  total.

## [0.4.0] — 2026-08-02

### Added

- **Live tick-to-candle aggregator** (`CandleAggregator`, `src/ws`) — builds
  OHLCV bars in real time from `ticker`/`full` WS packets, the missing piece
  between the parsed market feed and the REST-only `candlesFromSeries()`.
  Per-bar volume is derived as a delta against Dhan's cumulative day volume
  and self-corrects (re-bases instead of going negative) on a day rollover or
  feed restart. `seed()` primes a bucket from historical data on connect;
  `flush()`/`flushAll()` close out in-progress bars on the caller's own
  schedule — the aggregator itself holds no timers. 7 new tests; 232 total.
- **Authentication** — `TokenResponse` with `isExpired`, `expiresIn`,
  `needsRefresh` and the account fields (`clientName`, `ucc`,
  `powerOfAttorney`); `AuthenticationError` carrying the broker's own
  `errorMessage`; `DhanClient.fromEnv()`; `totpProvider` for supplying a code
  from a hardware token or MFA service instead of storing a TOTP secret;
  `DhanAuth.totpSecondsRemaining()`; and `TokenManager` gained `getToken()`,
  `clear()` and an `onToken` callback. Documented in `docs/AUTHENTICATION.md`.

### Fixed

- **Concurrent token refresh started one login per caller.** `TokenManager`
  now coalesces in-flight logins. Generating a token can invalidate the
  previous one, so a burst of traffic could leave the SDK holding a token the
  broker had already replaced.
- **Expiry timestamps without a timezone were parsed as local time.** Dhan
  returns IST, and the ECMAScript spec parses an offset-less date-time as
  local — on a UTC server that read an expiry 5.5 hours late, so a token
  looked valid well after the API began rejecting it. Offset-less timestamps
  are now pinned to IST, and an unparseable expiry fails closed.
- **Auth failures threw a raw `AxiosError`.** They now raise
  `AuthenticationError`, consistent with every other path in the SDK, and no
  longer discard the broker's `errorMessage`.

### Added

- **Global Stocks** (`/v2/globalstocks/*`) — the US equities book as
  `client.globalStocks`, with orders, holdings, trades, USD funds, market
  status and a margin/charges estimator. Fractional quantities and `AMOUNT`
  (notional) orders are supported, with a zod contract enforcing the
  quantity-vs-amount rule and bracket levels on the correct side of entry.
  `costSummary()` combines charges and margin into one affordability decision.
  Kept in its own namespace so USD and INR positions never blend.
- **Execution helpers** (`src/execution`) — `OrderTracker` resolves a placed
  order to its fill from order-update events rather than polling, keyed by
  correlation id or order id; `PositionMonitor` turns market ticks into exit
  signals for stop loss, target and an ATR trailing stop. Both are
  decision-only and never place orders.
- **Trader control tools** — `dhan_kill_switch`, `dhan_kill_switch_status`,
  `dhan_set_pnl_exit`, `dhan_stop_pnl_exit`, `dhan_pnl_exit_status`. These are
  the only users of the `risk:write` scope, which is deliberately separate
  from `orders:write`.
- **Global Stocks tools** — nine `dhan_global_*` tools. The registry now
  exposes 46 tools in total.
- `docs/BROWSER.md` covering why browser use fails (credential exposure and
  the absence of CORS headers on `api.dhan.co`), the backend-proxy pattern
  that works, and which modules are genuinely browser-safe.
- Examples: `ws-execution.ts` (fill tracking and tick-driven exits),
  `risk-controls.ts` (pipeline, P&L exit, kill switch) and `global-stocks.ts`.
- 36 further tests; 177 total.

### Changed

- The published `exports` map, `README` and docs reflect the new surface.

> **Note on this section and `0.2.0`/`0.3.0` below:** a `v0.3.0` git tag
> exists but was never given its own dated section here — its tree is
> nearly identical to `v0.2.0`'s, so the auth/Global Stocks/execution-helper
> work above most likely landed as part of one of those two releases rather
> than being genuinely unreleased. `0.3.1` was also published to npm with no
> matching git tag or commit at all (metadata-only: description, keywords,
> homepage, VitePress docs scripts). Reconstructing exactly which change
> shipped in which of those three isn't possible from git history alone, so
> rather than guess, this gap is left as-is: `0.4.0` is the first release
> whose tag and changelog are known to match what's actually on npm.

## [0.2.0] — 2026-07-29

First release published to npm, as `@shubhamtaywade82/dhanhq-ts`.

> This is a community SDK. It is not affiliated with or endorsed by Dhan.
> Dhan publishes its own official clients as `dhanhq` and `dhanhq-ts`.

### Added

- **Resources** — `Profile`, `MarketFeed` (ltp/ohlc/quote), `OptionChain`
  (raw plus a normalized, strike-sorted view) and `Instruments`, which caches
  parsed scrip-master segments in memory and shares one download between
  concurrent cold reads.
- **Constants** — exchange segments, product/order types, feed codes,
  rate-limit tiers and the scrip-master segment map, exported as `Constants`.
- **Technical analysis** (`src/ta`) — SMA, EMA, WMA, RSI, MACD, Bollinger
  Bands, ATR, ADX, Stochastic, Supertrend, VWAP and OBV; candle resampling;
  the NSE trading calendar; and a multi-timeframe bias engine that weights
  higher timeframes more heavily. Indicator output is aligned to its input,
  with `null` in the leading positions.
- **Option analytics** (`src/analytics`) — Black-Scholes pricing, Greeks,
  implied volatility, max pain, put-call ratios and OI concentration.
- **Risk pipeline** (`src/risk`) — pre-trade checks for trading permission,
  ASM/GSM restrictions, product support, order type, quantity and notional,
  market hours, position count, single-symbol concentration, daily loss and
  options-specific rules; plus position sizing, stop placement and a trailing
  stop manager.
- **Skills** (`src/skills`) — eleven composable strategies over a shared
  context. Option structures stop at a reviewable intent and never place
  orders.
- **Agent tools** (`src/agent`) — `Policy`, the tool catalogue and
  `AgentToolRegistry`. Writes require both the declared scope and
  `DHANHQ_MCP_ENABLE_WRITES=true` with `LIVE_TRADING=true`.
- **MCP server** (`src/mcp`, `src/bin`) — JSON-RPC 2.0 over stdio, exposing
  the tool registry, six account resources and five prompt templates.
  Published as the `dhanhq-mcp` binary and importable from
  `@shubhamtaywade82/dhanhq-ts/mcp`.
- **Prompt helpers** (`src/ai`) — portfolio, risk and market-analysis prompts
  for LLM assistants.
- 126 tests across six new spec files.

### Changed

- `Constants` and the agent tool schemas (`ToolSchemas`) are exported under
  namespaces, so the constant enums no longer collide with the string-literal
  types in `types/order.types` and the zod contracts in `contracts/`.
- `DhanClient` gained `profile`, `marketFeed`, `optionChain` and `instruments`.
- `DhanClientConfig` gained `instrumentCacheTtlMs`.

### Removed

- The unused `uuid` dependency. Order correlation ids come from the Node
  built-in `crypto.randomUUID`.

### Fixed

- A stray `examples` entry in `.gitignore` that shadowed the tracked example
  files.

## [0.1.0]

Initial pre-release: REST resources, contracts, WebSocket market feed and
order updates, auth helpers, and the OpenAPI-generated transport layer.

[Unreleased]: https://github.com/shubhamtaywade82/dhanhq-sdk/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/shubhamtaywade82/dhanhq-sdk/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/shubhamtaywade82/dhanhq-sdk/compare/v0.4.2...v1.0.0
[0.4.2]: https://github.com/shubhamtaywade82/dhanhq-sdk/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/shubhamtaywade82/dhanhq-sdk/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/shubhamtaywade82/dhanhq-sdk/compare/v0.2.0...v0.4.0
[0.2.0]: https://github.com/shubhamtaywade82/dhanhq-sdk/releases/tag/v0.2.0
[0.1.0]: https://github.com/shubhamtaywade82/dhanhq-sdk/releases/tag/v0.1.0
