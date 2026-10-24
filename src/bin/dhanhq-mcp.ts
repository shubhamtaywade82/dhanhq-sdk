#!/usr/bin/env node
/**
 * MCP server entry point.
 *
 * Reads credentials and scopes from the environment and serves JSON-RPC over
 * stdio. Writes stay closed unless both `DHANHQ_MCP_ENABLE_WRITES=true` and
 * `LIVE_TRADING=true` are set.
 *
 *   DHAN_CLIENT_ID=... DHAN_ACCESS_TOKEN=... npx dhanhq-mcp
 */
import { AgentToolRegistry } from "../agent/ToolRegistry";
import { Policy } from "../agent/Policy";
import { DhanClient } from "../client/DhanClient";
import { McpServer } from "../mcp/Server";

async function main(): Promise<void> {
  let client: DhanClient;

  try {
    client = DhanClient.fromEnv();
  } catch (error) {
    // stderr, not stdout — stdout is the JSON-RPC channel.
    process.stderr.write(
      `dhanhq-mcp: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(1);
    return;
  }

  const server = new McpServer({
    client,
    registry: new AgentToolRegistry({ client, policy: Policy.fromEnv() }),
  });

  await server.run();
}

main().catch((error: unknown) => {
  process.stderr.write(
    `dhanhq-mcp: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exit(1);
});
