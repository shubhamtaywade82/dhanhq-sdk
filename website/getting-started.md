---
title: DhanHQ TypeScript SDK — Installation & Authentication
description: Install and configure the DhanHQ TypeScript SDK for Node.js. Learn authentication methods including static tokens, auto-renewal, and custom token endpoints.
---

# Getting Started

## Installation

```bash
npm install @nemesis-oss/dhanhq-sdk
```

Requires **Node.js 18 or newer**. Ships both ESM and CommonJS builds with TypeScript declarations.

## Quick Start

```ts
import { DhanClient } from "@nemesis-oss/dhanhq-sdk";

const client = new DhanClient({
  token: process.env.DHAN_TOKEN!,
  clientId: process.env.DHAN_CLIENT_ID!,
});

const orderDetail = await client.orders.getById("12345");
console.log(orderDetail);
```

## Authentication

Five ways to supply a token:

### 1. Static Token

```ts
new DhanClient({ clientId, token });
```

### 2. Provider Callback

Re-resolved on every request:

```ts
new DhanClient({
  clientId,
  tokenProvider: () => vault.read("dhan/token"),
});
```

### 3. Auto-Renewal (PIN + TOTP)

Generate from PIN + TOTP secret, renew before expiry, log in again after a
401, and cache the token so a restart reuses it:

```ts
import { DhanClient, FileTokenStore } from "@nemesis-oss/dhanhq-sdk";

const client = new DhanClient({ clientId: process.env.DHAN_CLIENT_ID! });
client.auth.enableAutoTokenManagement({
  clientId: process.env.DHAN_CLIENT_ID!,
  pin: process.env.DHAN_PIN!,
  totpSecret: process.env.DHAN_TOTP_SECRET!,
  store: new FileTokenStore(), // ~/.dhanhq/dhan-token-<clientId>.json, mode 0600
});
```

Without a store every process logs in again — and a fresh login can
invalidate the token another process on the same account holds. REST calls
and all WebSockets use the managed token.

### 4. Environment Variables

```ts
const client = DhanClient.fromEnv();
```

| Variable | Purpose |
|----------|---------|
| `DHAN_CLIENT_ID` | required |
| `DHAN_PIN` + `DHAN_TOTP_SECRET` | PIN/TOTP login with the file token cache (wins over a static token) |
| `DHAN_ACCESS_TOKEN` | static token |
| `DHAN_TOKEN_CACHE_DIR` / `DHAN_TOKEN_CACHE=off` | cache location (default `~/.dhanhq`) / disable |
| `DHAN_MODE` | `live` (default), `sandbox` or `hybrid` — see [Live, Sandbox & Hybrid](/guide/environments) |
| `DHAN_SANDBOX_CLIENT_ID` / `DHAN_SANDBOX_ACCESS_TOKEN` | sandbox credentials (required for `hybrid`) |

`fromEnv` throws at startup when a required variable is missing. A
`.env.example` in the repository lists every variable.

### 5. Custom Token Endpoint

```ts
const client = await DhanClient.fromTokenEndpoint({
  endpointBaseUrl: "https://your-auth-service.com",
  bearerToken: process.env.DHAN_TOKEN_ACCESS_TOKEN!,
});
```

Before trading real money, run the [live test](/guide/live-testing).

See the full [authentication guide](https://github.com/shubhamtaywade82/dhanhq-sdk/blob/main/docs/AUTHENTICATION.md) for details on TOTP generation, SELF vs PARTNER auth, and token lifecycle.
