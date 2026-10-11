---
title: DhanHQ MCP Server — AI Trading Agent Integration
description: Expose DhanHQ trading APIs as MCP (Model Context Protocol) tools for AI agents. Run the MCP server for Claude, ChatGPT, Cursor, and other LLM clients.
---

# MCP Server & AI Agent Tools

Expose the entire DhanHQ SDK as [Model Context Protocol (MCP)](https://modelcontextprotocol.io) tools for AI trading agents.

## Quick Start

```bash
# Set credentials
export DHAN_CLIENT_ID=your_client_id
export DHAN_ACCESS_TOKEN=your_access_token

# Run the MCP server over stdio
npx dhanhq-mcp
```

The server builds its client with `DhanClient.fromEnv()`, so every variable
from [Getting Started](/getting-started#_4-environment-variables) applies:
`DHAN_PIN` + `DHAN_TOTP_SECRET` for automatic login with a cached token, and
`DHAN_MODE=hybrid` with `DHAN_SANDBOX_CLIENT_ID` / `DHAN_SANDBOX_ACCESS_TOKEN`
to let an agent trade against the sandbox while reading live prices. A tool
the sandbox does not serve returns an in-band error explaining so.

## Claude Desktop Configuration

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "dhanhq": {
      "command": "npx",
      "args": ["-y", "@nemesis-oss/dhanhq-sdk"],
      "env": {
        "DHAN_CLIENT_ID": "YOUR_CLIENT_ID",
        "DHAN_ACCESS_TOKEN": "YOUR_ACCESS_TOKEN",
        "DHANHQ_AGENT_SCOPES": "portfolio:read,market:read,orders:read"
      }
    }
  }
}
```

## Agent Tools

The MCP server exposes tools backed by the SDK (a partial list — see
[`src/agent/catalogue.ts`](https://github.com/shubhamtaywade82/dhanhq-sdk/blob/main/src/agent/catalogue.ts)
for the full set, including the Global Stocks `dhan_global_*` tools):

| Tool | Description | Scope Required |
|------|-------------|----------------|
| `dhan_search_instruments` | Search scrip master | `market:read` |
| `dhan_quote` | Snapshot market data | `market:read` |
| `dhan_option_chain` | Fetch option chain | `market:read` |
| `dhan_technical_analysis` | Compute indicators | `market:read` |
| `dhan_market_bias` | Multi-timeframe bias | `market:read` |
| `dhan_order_preview` | Validate without placing | `orders:read` |
| `dhan_place_order` | Execute a trade | `orders:write` |
| `dhan_positions` | Current positions | `portfolio:read` |
| `dhan_holdings` | Current holdings | `portfolio:read` |
| `dhan_funds` | Available funds | `portfolio:read` |

## Policy Gates

Two independent gates guard writes:

1. **Policy scope** — the agent must hold `orders:write` scope
2. **Environment flags** — both `DHANHQ_MCP_ENABLE_WRITES=true` and `LIVE_TRADING=true`

```ts
import { AgentToolRegistry, Policy } from "@nemesis-oss/dhanhq-sdk";

// Read-only access
const tools = new AgentToolRegistry({
  client,
  policy: Policy.readOnly(),
});

await tools.execute("dhan_search_instruments", { query: "NIFTY" });
await tools.execute("dhan_order_preview", order);
// dhan_place_order would throw — read-only policy
```

## Resources

The server exposes these resources:

| URI | Description |
|-----|-------------|
| `dhanhq://account/profile` | Account profile |
| `dhanhq://account/funds` | Available funds |
| `dhanhq://account/positions` | Current positions |
| `dhanhq://account/holdings` | Current holdings |
| `dhanhq://account/orders` | Recent orders |
| `dhanhq://market/capabilities` | Market status |

## Prompt Templates

Five built-in prompt templates for common trading tasks:
- `system_prompt` — Base system prompt for a DhanHQ trading assistant
- `portfolio_summary` — Human-readable summary of holdings, positions and funds
- `market_analysis` — Multi-timeframe technical bias for a symbol, with rationale
- `risk_report` — Current risk exposure: open positions, P&L and limits
- `order_preview` — Preview an order with contract and risk validation

## Security

- Writes require both policy scope AND environment flags
- Never expose `LIVE_TRADING=true` in non-production environments
- Use `DHANHQ_AGENT_SCOPES` to limit tool availability
- Tokens are bearer credentials — never ship to client-side code

## Programmatic Use

```ts
import { AgentToolRegistry, Policy } from "@nemesis-oss/dhanhq-sdk";

const tools = new AgentToolRegistry({
  client,
  policy: new Policy({
    scopes: ["market:read", "portfolio:read", "orders:read"],
  }),
});

// Execute any tool
const result = await tools.execute("dhan_option_chain", {
  underlyingScrip: 13,
  underlyingSeg: "IDX_I",
  expiry: "2026-08-04",
});
```
