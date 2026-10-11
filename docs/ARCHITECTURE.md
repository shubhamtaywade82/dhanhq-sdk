# Architecture

The SDK stacks four layers, each depending only on the ones below it.

```text
        mcp/  ·  bin/
             ↑
           agent/                    policy, tool catalogue, registry
             ↑
          skills/                    composable strategies
             ↑
  ta/ · analytics/ · risk/          computation over market data
  execution/ · ai/                  fill tracking, exit signals, prompts
             ↑
  resources/ · contracts/ · ws/      typed API surface
             ↑
        generated/ · client/         transport
```

Nothing below the agent layer knows about permissions or MCP, so the risk
pipeline, indicators and skills are all usable directly from application code.

## Transport layer

- `src/generated` is produced from `openapi.json` and should never be edited by
  hand — regenerate with `npm run generate`.
- `src/client/HttpClient.ts` centralizes auth resolution, rate limiting, error
  normalization and safe-retry behavior. Order placement is never auto-retried.
- `src/client/Environment.ts` decides the host per request from `mode`
  (`live` / `sandbox` / `hybrid`): it classifies each path as public, market
  data, Global Stocks or trading, and holds the allow-list of operations the
  Dhan sandbox serves. `HttpClient` applies it before queueing — a sandbox
  request for an unsupported path throws `SandboxUnsupportedError` without I/O,
  and sandbox requests carry the sandbox credentials.
- `src/auth` holds token generation, renewal and the optional `TokenStore`
  that persists a PIN/TOTP token across restarts.

## Resource layer

- `src/resources` exposes the ergonomic SDK API, one class per endpoint group.
- `src/contracts` validates trading-critical requests before transport.
- `src/ws` carries the binary market feed and order update infrastructure.
- `src/constants.ts` holds the enumerations shared across every layer.

`Instruments` is the one resource with real state: the scrip master arrives as
CSV and a single segment can run to hundreds of thousands of rows, so parsed
segments are cached in memory (one hour by default) and concurrent callers for
a cold segment share one download.

## Computation layer

- `src/ta` — indicators, candle handling, the NSE trading calendar, and a
  multi-timeframe bias engine. Indicator functions are pure and return arrays
  aligned to their input, with `null` in the leading positions.
- `src/analytics` — Black-Scholes pricing, Greeks, implied volatility, max
  pain, put-call ratios and OI concentration.
- `src/risk` — the pre-trade check pipeline plus position sizing, stop
  placement and trailing stop management.
- `src/ai` — prompt construction for LLM assistants. These render state into
  text; they never call the API themselves.
- `src/execution` — `OrderTracker` resolves a placed order to its fill from
  order-update events rather than polling, and `PositionMonitor` turns market
  ticks into exit signals. Both are decision-only: neither places an order, so
  the same instance drives a live exit, a paper log, or an alert.

## Strategy and agent layers

- `src/skills` — a skill is a named sequence of steps over a shared context.
  Structure skills stop at an `intent`: they resolve strikes and premiums but
  never place orders.
- `src/agent` — `Policy` (scopes and the live-trading gate), the tool
  catalogue, and `AgentToolRegistry`, which is the single place permission is
  enforced.
- `src/mcp` and `src/bin` — a JSON-RPC 2.0 stdio server exposing the registry,
  account resources and prompt templates.

## Runtime target

- Primary target: Node-based automation trading
- Secondary target: browser-safe read-only consumers where transport limits allow

The MCP server is Node-only — it reads stdin and writes stdout.

## Public package surface

- `DhanClient` for normal SDK use
- `Generated` namespace for low-level direct access
- `Constants` namespace for exchange and order enumerations
- `client.ws.market` for the binary market feed
- `client.ws.orders` for live order updates
- `AgentToolRegistry` / `McpServer` for agent integrations
