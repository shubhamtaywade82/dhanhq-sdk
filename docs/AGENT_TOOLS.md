# Agent Tools and MCP

The SDK exposes itself to LLM clients through a tool registry and an MCP
server. This document covers what exists, how permissions work, and how to add
a tool.

## Permission model

Two independent gates guard every call.

**Scope.** A `Policy` holds a set of scopes. Read tools need only the scope
they declare.

| Scope | Covers |
| --- | --- |
| `portfolio:read` | profile, funds, holdings, positions |
| `market:read` | instruments, quotes, option chains, charts, technicals |
| `orders:read` | orders, trades, order preview, margin requirement |
| `orders:write` | placing and modifying orders |
| `orders:cancel` | cancelling orders |
| `alerts:write` | conditional triggers |
| `risk:write` | kill switch and P&L exit controls |

Scopes come from `DHANHQ_AGENT_SCOPES` (comma or space separated), defaulting
to the three read scopes when unset.

**Live-trading gate.** Any tool whose risk level ends in `write` additionally
requires *both* `DHANHQ_MCP_ENABLE_WRITES=true` and `LIVE_TRADING=true`. Holding
`orders:write` is not enough on its own — an agent handed full scopes still
cannot trade until an operator opens the gate.

## Risk levels

| Level | Meaning |
| --- | --- |
| `read_only` | No account state read or changed beyond public market data |
| `trade_adjacent_read` | Reads that inform trading (preview, margin, structures) |
| `live_write` | Places or modifies real orders |
| `destructive_write` | Cancels orders or exits positions |

## Tools

**Portfolio** — `dhan_profile`, `dhan_funds`, `dhan_holdings`,
`dhan_positions`, `dhan_orders`, `dhan_trades`

**Market data** — `dhan_search_instruments`, `dhan_ltp`, `dhan_ohlc`,
`dhan_quote`, `dhan_option_chain`, `dhan_option_expiries`,
`dhan_historical_data`, `dhan_intraday_data`, `dhan_expired_options`

**Analysis** — `dhan_technical_analysis`, `dhan_market_bias`,
`dhan_margin_requirement`

**Orders** — `dhan_order_preview`, `dhan_place_order`, `dhan_modify_order`,
`dhan_cancel_order`

**Trader controls** — `dhan_kill_switch_status`, `dhan_kill_switch`,
`dhan_pnl_exit_status`, `dhan_set_pnl_exit`, `dhan_stop_pnl_exit`

**Global Stocks (US equities)** — `dhan_global_holdings`, `dhan_global_funds`,
`dhan_global_orders`, `dhan_global_trades`, `dhan_global_market_status`,
`dhan_global_order_estimate`, `dhan_global_place_order`,
`dhan_global_modify_order`, `dhan_global_cancel_order`

**Skills** — one `dhan_skill_<name>` per registered skill, gated by the risk
and scope the skill itself declares.

The `risk:write` scope covers only the kill switch and P&L exit controls, and
is deliberately separate from `orders:write`: an agent permitted to trade
should not be able to disarm the account's own safety rails as a side effect.

Global Stocks gets its own tools rather than extra flags on the domestic ones,
so an agent asked for "my holdings" cannot silently blend USD positions into
the INR book. `dhan_global_place_order` runs no risk pipeline — those checks
resolve instruments from the Indian scrip master and encode NSE/BSE rules —
but the scope gate, the live-trading gate and the Global Stocks order contract
all still apply.

`dhan_place_order` refuses any order whose instrument cannot be resolved from
the scrip master. That is deliberate: without instrument metadata the
surveillance, product-support and permission checks cannot run at all, so the
order would go out unchecked.

## MCP server

`dhanhq-mcp` builds its client with `DhanClient.fromEnv()`, so it honours
`DHAN_MODE` (run agents against the sandbox with `hybrid`), PIN/TOTP login with
the token cache (`DHAN_PIN` + `DHAN_TOTP_SECRET`) and the sandbox credentials.
A tool the sandbox does not serve fails in-band with the
`SandboxUnsupportedError` message.

`dhanhq-mcp` speaks JSON-RPC 2.0 over stdio and supports protocol versions
`2025-06-18` and `2024-11-05`.

Methods: `initialize`, `ping`, `tools/list`, `tools/call`, `resources/list`,
`resources/read`, `prompts/list`, `prompts/get`.

Resources: `dhanhq://account/{profile,funds,holdings,positions,orders}` and
`dhanhq://market/capabilities`.

Prompts: `system_prompt`, `portfolio_summary`, `market_analysis`,
`risk_report`, `order_preview`.

Tool failures are reported in-band as `isError` with the message as text
content, rather than as JSON-RPC errors — the model needs to see why a call was
refused in order to react to it. Protocol-level problems (unknown method,
invalid params) still return JSON-RPC errors.

Every tool call is bounded by `toolCallTimeoutMs` (15s by default) so a
rate-limit backoff cannot hang the client indefinitely.

## Adding a tool

1. Add an input schema to `src/agent/schemas.ts`.
2. Add an entry to the relevant group in `src/agent/catalogue.ts`, giving it a
   scope, a risk level and a handler.

Handlers contain no permission logic. Enforcement happens once, in
`AgentToolRegistry.execute`, so there is exactly one place where an agent call
can be refused.
