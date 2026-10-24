import { createInterface, type Interface } from "readline";

import { AgentToolRegistry } from "../agent/ToolRegistry";
import type { DhanClient } from "../client/DhanClient";
import {
  marketAnalysis,
  portfolioSummary,
  riskReport,
  systemPrompt,
} from "../ai/promptHelpers";
import { previewOrder } from "../agent/OrderPreview";
import { analyzeMultiTimeframe } from "../ta/multiTimeframe";
import { TechnicalAnalysis } from "../ta/TechnicalAnalysis";

export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2024-11-05"];
export const DEFAULT_TOOL_CALL_TIMEOUT_MS = 15_000;

/** JSON-RPC error codes used by this server. */
export const ErrorCode = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

/** A well-formed request whose params are invalid — maps to -32602. */
export class InvalidParamsError extends Error {}
/** An unrecognized JSON-RPC method — maps to -32601. */
export class UnknownMethodError extends Error {}

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

export interface ResourceDefinition {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

export const RESOURCES: ResourceDefinition[] = [
  {
    uri: "dhanhq://account/profile",
    name: "Dhan Profile",
    description:
      "Account profile including client id, token validity and active segments",
    mimeType: "application/json",
  },
  {
    uri: "dhanhq://account/funds",
    name: "Fund Limits",
    description: "Available balance, utilized margin and withdrawal capacity",
    mimeType: "application/json",
  },
  {
    uri: "dhanhq://account/holdings",
    name: "Portfolio Holdings",
    description: "Equity holdings with quantity, average price and P&L",
    mimeType: "application/json",
  },
  {
    uri: "dhanhq://account/positions",
    name: "Open Positions",
    description:
      "F&O and equity positions with net quantity and unrealized P&L",
    mimeType: "application/json",
  },
  {
    uri: "dhanhq://account/orders",
    name: "Recent Orders",
    description: "Order history with status, quantity and fill details",
    mimeType: "application/json",
  },
  {
    uri: "dhanhq://market/capabilities",
    name: "Agent Capabilities",
    description:
      "Available tools, scopes, risk levels and the write gate state",
    mimeType: "application/json",
  },
];

export interface PromptDefinition {
  name: string;
  description: string;
  arguments: Array<{ name: string; description: string; required: boolean }>;
}

export const PROMPTS: PromptDefinition[] = [
  {
    name: "system_prompt",
    description: "Base system prompt for a DhanHQ trading assistant",
    arguments: [],
  },
  {
    name: "portfolio_summary",
    description:
      "Human-readable summary of current holdings, positions and funds",
    arguments: [],
  },
  {
    name: "market_analysis",
    description:
      "Multi-timeframe technical bias for a symbol, with supporting rationale",
    arguments: [
      {
        name: "symbol",
        description: "Ticker symbol, e.g. NIFTY or RELIANCE",
        required: false,
      },
    ],
  },
  {
    name: "risk_report",
    description: "Current risk exposure: open positions, P&L and limits",
    arguments: [],
  },
  {
    name: "order_preview",
    description: "Preview an order with contract and risk validation",
    arguments: [
      { name: "transactionType", description: "BUY or SELL", required: true },
      { name: "securityId", description: "Dhan security id", required: true },
      {
        name: "quantity",
        description: "Number of shares or lots",
        required: true,
      },
      {
        name: "exchangeSegment",
        description: "NSE_EQ, NSE_FNO, etc.",
        required: true,
      },
      {
        name: "productType",
        description: "CNC, INTRADAY, MARGIN, MTF, BO or CO",
        required: true,
      },
      { name: "orderType", description: "MARKET or LIMIT", required: true },
      { name: "price", description: "Limit price", required: false },
    ],
  },
];

export interface McpServerOptions {
  client: DhanClient;
  registry?: AgentToolRegistry;
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
  /** Per-call ceiling, so a rate-limit backoff cannot hang the client. */
  toolCallTimeoutMs?: number;
  serverName?: string;
  serverVersion?: string;
}

/**
 * MCP server speaking JSON-RPC 2.0 over stdio.
 *
 * Exposes the agent tool registry as MCP tools, account state as resources,
 * and a handful of prompt templates. Every tool call goes through
 * {@link AgentToolRegistry}, so the scope and live-trading gates apply here
 * exactly as they do to a direct caller.
 */
export class McpServer {
  private readonly client: DhanClient;
  private readonly registry: AgentToolRegistry;
  private readonly input: NodeJS.ReadableStream;
  private readonly output: NodeJS.WritableStream;
  private readonly toolCallTimeoutMs: number;
  private readonly serverName: string;
  private readonly serverVersion: string;
  private reader?: Interface;

  constructor(options: McpServerOptions) {
    this.client = options.client;
    this.registry =
      options.registry ?? new AgentToolRegistry({ client: options.client });
    this.input = options.input ?? process.stdin;
    this.output = options.output ?? process.stdout;
    this.toolCallTimeoutMs =
      options.toolCallTimeoutMs ?? DEFAULT_TOOL_CALL_TIMEOUT_MS;
    this.serverName = options.serverName ?? "dhanhq-ts";
    this.serverVersion = options.serverVersion ?? "0.2.0";
  }

  /** Reads newline-delimited JSON-RPC from stdin until the stream closes. */
  public async run(): Promise<void> {
    this.reader = createInterface({ input: this.input, crlfDelay: Infinity });

    for await (const line of this.reader) {
      if (line.trim().length > 0) {
        await this.handleLine(line);
      }
    }
  }

  public close(): void {
    this.reader?.close();
  }

  /** Handles one JSON-RPC line. Exposed for testing. */
  public async handleLine(line: string): Promise<void> {
    let request: JsonRpcRequest;

    try {
      request = JSON.parse(line) as JsonRpcRequest;
    } catch (error) {
      this.respondError(
        null,
        ErrorCode.PARSE_ERROR,
        `Parse error: ${message(error)}`,
      );
      return;
    }

    // A request without an id is a notification, and JSON-RPC forbids
    // responding to one.
    if (request.id === undefined) {
      return;
    }

    try {
      this.respondResult(
        request.id,
        await this.dispatch(request.method ?? "", request.params ?? {}),
      );
    } catch (error) {
      this.respondError(request.id, errorCodeFor(error), message(error));
    }
  }

  private async dispatch(
    method: string,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    switch (method) {
      case "initialize":
        return {
          protocolVersion: this.negotiateVersion(params.protocolVersion),
          serverInfo: { name: this.serverName, version: this.serverVersion },
          capabilities: { tools: {}, resources: {}, prompts: {} },
        };

      case "ping":
        return {};

      case "tools/list":
        return {
          tools: this.registry.list().map((entry) => ({
            name: entry.name,
            description: `[${entry.risk}] ${entry.description}`,
            inputSchema: entry.inputSchema,
          })),
        };

      case "tools/call":
        return this.callTool(params);

      case "resources/list":
        return { resources: RESOURCES };

      case "resources/read":
        return { contents: [await this.readResource(String(params.uri))] };

      case "prompts/list":
        return { prompts: PROMPTS };

      case "prompts/get":
        return this.getPrompt(
          String(params.name),
          (params.arguments as Record<string, unknown>) ?? {},
        );

      default:
        throw new UnknownMethodError(`Unsupported MCP method: ${method}`);
    }
  }

  private async callTool(params: Record<string, unknown>): Promise<unknown> {
    const name = params.name;
    if (typeof name !== "string") {
      throw new InvalidParamsError("tools/call requires a tool name");
    }

    const args = (params.arguments as Record<string, unknown>) ?? {};

    try {
      const result = await withTimeout(
        this.registry.execute(name, args),
        this.toolCallTimeoutMs,
        `Tool call '${name}' timed out after ${this.toolCallTimeoutMs}ms ` +
          "(likely blocked on rate-limit backoff) — retry shortly",
      );

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      // MCP wants tool failures reported in-band as `isError`, not as a
      // JSON-RPC error, so the model can see and react to the message.
      return {
        isError: true,
        content: [{ type: "text", text: message(error) }],
      };
    }
  }

  private async readResource(
    uri: string,
  ): Promise<{ uri: string; mimeType: string; text: string }> {
    const data = await this.resourceData(uri);

    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(data, null, 2),
    };
  }

  private async resourceData(uri: string): Promise<unknown> {
    switch (uri) {
      case "dhanhq://account/profile":
        return this.client.profile.get();
      case "dhanhq://account/funds":
        return this.client.funds.getLimit();
      case "dhanhq://account/holdings":
        return this.client.positions.listHoldings();
      case "dhanhq://account/positions":
        return this.client.positions.list();
      case "dhanhq://account/orders":
        return this.client.orders.list();
      case "dhanhq://market/capabilities":
        return this.registry.capabilities();
      default:
        throw new InvalidParamsError(`Unknown resource: ${uri}`);
    }
  }

  private async getPrompt(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ messages: Array<{ role: string; content: unknown }> }> {
    const text = await this.promptText(name, args);

    return {
      messages: [{ role: "user", content: { type: "text", text } }],
    };
  }

  private async promptText(
    name: string,
    args: Record<string, unknown>,
  ): Promise<string> {
    switch (name) {
      case "system_prompt":
        return systemPrompt(this.registry.availableTools().map((t) => t.name));

      case "portfolio_summary": {
        const [holdings, positions, funds] = await Promise.all([
          this.client.positions.listHoldings(),
          this.client.positions.list(),
          this.client.funds.getLimit(),
        ]);

        return portfolioSummary({ holdings, positions, funds });
      }

      case "risk_report":
        return riskReport({ positions: await this.client.positions.list() });

      case "market_analysis":
        return this.marketAnalysisPrompt(String(args.symbol ?? "NIFTY"));

      case "order_preview": {
        const preview = await previewOrder(args);
        return preview.valid
          ? `Order preview: ${preview.summary}`
          : `Validation errors: ${preview.errors.join(", ")}`;
      }

      default:
        throw new InvalidParamsError(`Unknown prompt: ${name}`);
    }
  }

  private async marketAnalysisPrompt(symbol: string): Promise<string> {
    const instrument =
      (await this.client.instruments.find("IDX_I", symbol, {
        exactMatch: true,
      })) ??
      (await this.client.instruments.find("NSE_EQ", symbol, {
        exactMatch: true,
      }));

    if (!instrument) {
      return `Could not resolve symbol ${symbol} to a security id for market data.`;
    }

    const analysis = new TechnicalAnalysis(this.client.charts);
    const result = await analysis.compute({
      securityId: instrument.securityId,
      exchangeSegment: instrument.exchangeSegment ?? "NSE_EQ",
      instrument: instrument.instrument ?? "EQUITY",
      intervals: [15, 60],
    });

    return `${symbol}\n${marketAnalysis(analyzeMultiTimeframe(result))}`;
  }

  private negotiateVersion(requested: unknown): string {
    return typeof requested === "string" &&
      SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
      ? requested
      : SUPPORTED_PROTOCOL_VERSIONS[0];
  }

  private respondResult(id: string | number | null, result: unknown): void {
    this.write({ jsonrpc: "2.0", id, result });
  }

  private respondError(
    id: string | number | null,
    code: number,
    text: string,
  ): void {
    this.write({ jsonrpc: "2.0", id, error: { code, message: text } });
  }

  private write(payload: unknown): void {
    this.output.write(`${JSON.stringify(payload)}\n`);
  }
}

function errorCodeFor(error: unknown): number {
  if (error instanceof UnknownMethodError) return ErrorCode.METHOD_NOT_FOUND;
  if (error instanceof InvalidParamsError) return ErrorCode.INVALID_PARAMS;
  return ErrorCode.INTERNAL_ERROR;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  timeoutMessage: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(timeoutMessage)), ms);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error: unknown) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}
