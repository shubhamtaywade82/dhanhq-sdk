import { DhanError, LiveTradingDisabledError } from "../errors";

export const READ_SCOPES = [
  "portfolio:read",
  "market:read",
  "orders:read",
] as const;

export const WRITE_SCOPES = [
  "orders:write",
  "orders:cancel",
  "alerts:write",
  "risk:write",
] as const;

export type ReadScope = (typeof READ_SCOPES)[number];
export type WriteScope = (typeof WRITE_SCOPES)[number];
export type AgentScope = ReadScope | WriteScope;

export const ALL_SCOPES: AgentScope[] = [...READ_SCOPES, ...WRITE_SCOPES];

/**
 * How much damage a tool can do.
 *
 * Anything ending in `write` goes through {@link Policy.requireWrite} and so
 * needs the live-trading gate open, not just the scope.
 */
export type ToolRisk =
  "read_only" | "trade_adjacent_read" | "live_write" | "destructive_write";

export interface PolicyOptions {
  scopes?: AgentScope[];
  /**
   * Overrides the `DHANHQ_MCP_ENABLE_WRITES` / `LIVE_TRADING` env gate. Set
   * explicitly only where the caller owns the confirmation flow itself.
   */
  writesEnabled?: boolean;
}

/**
 * Permission policy for the agent and MCP surfaces.
 *
 * Two independent gates guard writes: the caller must hold the scope, *and*
 * live trading must be switched on. Read tools need only the scope.
 */
export class Policy {
  public readonly scopes: readonly AgentScope[];
  private readonly writesEnabledOverride?: boolean;

  constructor(options: PolicyOptions = {}) {
    const scopes = options.scopes ?? [];
    const unknown = scopes.filter((scope) => !ALL_SCOPES.includes(scope));

    if (unknown.length > 0) {
      throw new DhanError(`Unknown agent scopes: ${unknown.join(", ")}`, {
        code: "INVALID_SCOPE",
      });
    }

    this.scopes = Object.freeze([...new Set(scopes)]);
    this.writesEnabledOverride = options.writesEnabled;
  }

  /** Read scopes only — the safe default for an unattended agent. */
  public static readOnly(): Policy {
    return new Policy({ scopes: [...READ_SCOPES] });
  }

  /** Every scope. Writes still require the live-trading gate. */
  public static full(): Policy {
    return new Policy({ scopes: ALL_SCOPES });
  }

  /**
   * Reads `DHANHQ_AGENT_SCOPES` (comma or space separated), defaulting to
   * read-only when unset.
   */
  public static fromEnv(env: NodeJS.ProcessEnv = process.env): Policy {
    const raw = env.DHANHQ_AGENT_SCOPES ?? READ_SCOPES.join(",");
    const scopes = raw
      .split(/[\s,]+/)
      .filter((scope) => scope.length > 0) as AgentScope[];

    return new Policy({ scopes });
  }

  public allows(scope: AgentScope): boolean {
    return this.scopes.includes(scope);
  }

  /** Throws unless the policy holds `scope`. */
  public require(scope: AgentScope): true {
    if (this.allows(scope)) {
      return true;
    }

    throw new DhanError(`Agent scope required: ${scope}`, {
      code: "SCOPE_REQUIRED",
      details: { required: scope, held: this.scopes },
    });
  }

  /** True only when both env flags are set, unless explicitly overridden. */
  public writesEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
    if (this.writesEnabledOverride !== undefined) {
      return this.writesEnabledOverride;
    }

    return (
      env.DHANHQ_MCP_ENABLE_WRITES === "true" && env.LIVE_TRADING === "true"
    );
  }

  /** Throws unless the policy holds `scope` *and* writes are enabled. */
  public requireWrite(
    scope: AgentScope,
    env: NodeJS.ProcessEnv = process.env,
  ): true {
    this.require(scope);

    if (this.writesEnabled(env)) {
      return true;
    }

    throw new LiveTradingDisabledError();
  }
}
