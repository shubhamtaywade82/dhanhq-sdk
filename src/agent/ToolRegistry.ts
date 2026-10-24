import type { DhanClient } from "../client/DhanClient";
import { DhanError } from "../errors";
import { Pipeline } from "../risk/Pipeline";
import type { RiskLimits } from "../risk/types";
import { createSkillRegistry, SkillRegistry } from "../skills";
import { buildCatalogue } from "./catalogue";
import { ALL_SCOPES, Policy } from "./Policy";
import {
  describeTool,
  isWriteTool,
  type Tool,
  type ToolDescriptor,
} from "./Tool";

export interface ToolRegistryOptions {
  client: DhanClient;
  policy?: Policy;
  skills?: SkillRegistry;
  pipeline?: Pipeline;
  riskLimits?: Partial<RiskLimits>;
}

export interface Capabilities {
  toolCount: number;
  tools: ToolDescriptor[];
  scopes: string[];
  riskLevels: string[];
  writeEnabled: boolean;
  skills: string[];
}

/**
 * Registry and dispatcher for the tools exposed to MCP clients and agents.
 *
 * Holds the catalogue and enforces {@link Policy} on every call — a write tool
 * is checked against the live-trading gate as well as its scope. Handlers
 * themselves contain no permission logic, so there is exactly one place where
 * an agent call can be refused.
 */
export class AgentToolRegistry {
  private readonly tools: Map<string, Tool>;
  private readonly policy: Policy;
  private readonly skills: SkillRegistry;

  constructor(options: ToolRegistryOptions) {
    this.policy = options.policy ?? Policy.fromEnv();
    this.skills = options.skills ?? createSkillRegistry();

    const pipeline =
      options.pipeline ??
      new Pipeline({
        limits: options.riskLimits,
        provider: riskProviderFor(options.client),
      });

    const catalogue = buildCatalogue({
      client: options.client,
      skills: this.skills,
      pipeline,
    });

    this.tools = new Map(catalogue.map((entry) => [entry.name, entry]));
  }

  public list(): ToolDescriptor[] {
    return [...this.tools.values()].map(describeTool);
  }

  public names(): string[] {
    return [...this.tools.keys()];
  }

  public find(name: string): Tool {
    const found = this.tools.get(name);

    if (!found) {
      throw new DhanError(`Unknown DhanHQ agent tool: ${name}`, {
        code: "TOOL_NOT_FOUND",
        details: { name },
      });
    }

    return found;
  }

  /** Checks policy, then dispatches to the tool's handler. */
  public async execute(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<unknown> {
    const found = this.find(name);

    if (isWriteTool(found)) {
      this.policy.requireWrite(found.scope);
    } else {
      this.policy.require(found.scope);
    }

    return found.handler(args);
  }

  /** Tools this policy may call right now, write gate included. */
  public availableTools(): ToolDescriptor[] {
    const writesEnabled = this.policy.writesEnabled();

    return this.list().filter((entry) => {
      if (!this.policy.allows(entry.scope)) {
        return false;
      }

      return isWriteTool(entry) ? writesEnabled : true;
    });
  }

  /** Capability manifest for an agent runtime. */
  public capabilities(): Capabilities {
    const tools = this.list();

    return {
      toolCount: tools.length,
      tools,
      scopes: [...ALL_SCOPES],
      riskLevels: [...new Set(tools.map((entry) => entry.risk))].sort(),
      writeEnabled: this.policy.writesEnabled(),
      skills: this.skills.names(),
    };
  }

  public getPolicy(): Policy {
    return this.policy;
  }

  public getSkills(): SkillRegistry {
    return this.skills;
  }
}

/** Adapts a {@link DhanClient} to the risk layer's data provider interface. */
export function riskProviderFor(client: DhanClient) {
  return {
    positions: async () =>
      (await client.positions.list()) as Array<Record<string, unknown>>,
    funds: async () =>
      (await client.funds.getLimit()) as Record<string, unknown>,
  };
}
