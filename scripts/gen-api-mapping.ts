/**
 * Generates docs/API_MAPPING.md from the resource classes, so the mapping is
 * the code rather than a hand-kept table that drifts.
 *
 *   npm run docs:mapping          # rewrite docs/API_MAPPING.md
 *
 * spec/api_mapping.spec.ts fails when the committed file is out of date.
 */
import { readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

import { environmentFor, sandboxSupports } from "../src/client/Environment";

export interface Endpoint {
  resource: string;
  method: string;
  verb: string;
  path: string;
}

const ROOT = join(__dirname, "..");
const RESOURCES = join(ROOT, "src", "resources");

/** `client.<property>` for each resource class, read from DhanClient. */
function clientProperties(): Map<string, string> {
  const source = readFileSync(join(ROOT, "src", "client", "DhanClient.ts"), "utf8");
  const map = new Map<string, string>();
  for (const match of source.matchAll(/this\.(\w+) = new (\w+)\(/g)) {
    map.set(match[2], match[1]);
  }
  return map;
}

function stringConstants(source: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const match of source.matchAll(/const (\w+) = "([^"]+)";/g)) map.set(match[1], match[2]);
  return map;
}

function normalizeUrl(raw: string, constants: Map<string, string>): string {
  return raw.replace(/\$\{([^}]+)\}/g, (_, expression: string) => {
    const name = expression.replace(/\s+/g, "");
    if (constants.has(name)) return constants.get(name) as string;
    const argument = /encodeURIComponent\((?:String\()?([\w.]+)/.exec(name)?.[1] ?? name;
    return `{${argument.split(".").pop()}}`;
  });
}

const REQUEST = /method: "(\w+)",\s*\n\s*url: (?:"([^"]+)"|`([^`]+)`)/g;

interface ClassMember {
  name: string;
  visibility: string;
  body: string;
}

/** Each exported class in a file with its members (methods and accessors). */
function classesIn(source: string): Map<string, ClassMember[]> {
  const classes = new Map<string, ClassMember[]>();
  const classStarts = [...source.matchAll(/^export class (\w+)/gm)];
  classStarts.forEach((cls, i) => {
    const text = source.slice(cls.index, i + 1 < classStarts.length ? classStarts[i + 1].index : source.length);
    const starts = [...text.matchAll(/^ {2}(public|private|protected) (?:async )?(?:readonly )?(\w+)(?:<[^>(]*>)?\(/gm)];
    classes.set(
      cls[1],
      starts.map((m, j) => ({
        visibility: m[1],
        name: m[2],
        body: text.slice(m.index, j + 1 < starts.length ? starts[j + 1].index : text.length),
      })),
    );
  });
  return classes;
}

/** Sub-resources composed inside a class: `this.orders = new GlobalStocksOrders(...)`. */
function composed(source: string, className: string): Array<[string, string]> {
  const body = source.slice(source.indexOf(`export class ${className}`));
  return [...body.matchAll(/this\.(\w+) = new (\w+)\(/g)].map((m) => [m[1], m[2]]);
}

/** Requests a member makes directly, through a `this.helper("/path", ...)`, or via a private method. */
function requestsOf(member: ClassMember, members: ClassMember[], constants: Map<string, string>, depth = 0): Array<[string, string]> {
  const found: Array<[string, string]> = [...member.body.matchAll(REQUEST)].map((r) => [
    r[1],
    normalizeUrl(r[2] ?? r[3], constants),
  ]);
  if (depth > 2) return found;

  for (const helper of members.filter((m) => m.visibility !== "public" && m !== member)) {
    const helperVerb = /method: "(\w+)",\s*\n\s*url,/.exec(helper.body)?.[1];
    for (const call of member.body.matchAll(new RegExp(`this\\.${helper.name}(?:<[^>]*>)?\\(\\s*(?:"([^"]+)"|\`([^\`]+)\`)`, "g"))) {
      if (helperVerb) found.push([helperVerb, normalizeUrl(call[1] ?? call[2], constants)]);
    }
    if (!helperVerb && new RegExp(`this\\.${helper.name}\\(`).test(member.body)) {
      found.push(...requestsOf(helper, members, constants, depth + 1));
    }
  }
  return found;
}

export function extractEndpoints(): Endpoint[] {
  const properties = clientProperties();
  const endpoints: Endpoint[] = [];

  for (const file of readdirSync(RESOURCES).filter((f) => f.endsWith(".ts") && f !== "index.ts").sort()) {
    const source = readFileSync(join(RESOURCES, file), "utf8");
    const constants = stringConstants(source);
    const classes = classesIn(source);

    for (const [className, property] of properties) {
      if (!classes.has(className)) continue;
      const targets: Array<[string, string]> = [[property, className]];
      for (const [sub, subClass] of composed(source, className)) targets.push([`${property}.${sub}`, subClass]);

      for (const [path, cls] of targets) {
        const members = classes.get(cls) ?? [];
        for (const member of members.filter((m) => m.visibility === "public")) {
          const seen = new Set<string>();
          for (const [verb, url] of requestsOf(member, members, constants)) {
            if (seen.has(`${verb} ${url}`)) continue;
            seen.add(`${verb} ${url}`);
            const [resource, ...nested] = path.split(".");
            endpoints.push({ resource, method: [...nested, member.name].join("."), verb, path: url });
          }
        }
      }
    }
  }

  return endpoints;
}

const TITLES: Record<string, string> = {
  orders: "Orders & trades",
  superOrders: "Super orders",
  foreverOrders: "Forever orders (GTT)",
  alerts: "Conditional triggers (alerts)",
  conditionalTriggers: "Conditional triggers (legacy wrapper)",
  positions: "Portfolio",
  funds: "Funds & margin",
  marginCalculator: "Margin calculator",
  statements: "Statements",
  traderControls: "Trader's controls",
  edis: "eDIS",
  ipSetup: "Static IP",
  profile: "Profile",
  marketFeed: "Market quotes",
  optionChain: "Option chain",
  charts: "Charts",
  expiredOptionsData: "Expired options data",
  instruments: "Instruments",
  scanx: "ScanX data",
  globalStocks: "Global Stocks (US equities)",
};

/** Where the call goes in hybrid and in full sandbox mode. */
function hostCell(verb: string, path: string): [string, string] {
  const cell = (mode: "hybrid" | "sandbox") => {
    if (environmentFor(mode, path) === "live") return "production";
    return sandboxSupports(verb, path) ? "sandbox" : "✗ unsupported";
  };
  return [cell("hybrid"), cell("sandbox")];
}

export function renderMapping(endpoints: Endpoint[] = extractEndpoints()): string {
  const groups = new Map<string, Endpoint[]>();
  for (const endpoint of endpoints) groups.set(endpoint.resource, [...(groups.get(endpoint.resource) ?? []), endpoint]);

  const lines = [
    "# DhanHQ v2 REST API Mapping",
    "",
    "<!-- Generated by `npm run docs:mapping` from src/resources — do not edit by hand. -->",
    "",
    "Every REST call the SDK's resource classes make, grouped by `client.<resource>`.",
    "Paths are relative to `https://api.dhan.co/v2` (production) or",
    "`https://sandbox.dhan.co/v2` (sandbox).",
    "",
    "The last two columns say where the call goes with `mode: \"hybrid\"` and",
    "`mode: \"sandbox\"` (`mode: \"live\"`, the default, sends everything to production):",
    "",
    "- **production** / **sandbox** — the host that serves it.",
    "- **✗ unsupported** — the Dhan sandbox does not serve it; the SDK throws",
    "  `SandboxUnsupportedError` before any request, never falling back to production.",
    "",
    "The OpenAPI-generated client (`client.generated.*`) covers the same endpoints",
    "with raw request/response types; see `src/generated/services`.",
    "",
  ];

  const order = Object.keys(TITLES);
  const rank = (resource: string) => (order.includes(resource) ? order.indexOf(resource) : order.length);
  for (const [resource, list] of [...groups].sort(([a], [b]) => rank(a) - rank(b))) {
    lines.push(`## ${TITLES[resource] ?? resource} — \`client.${resource}\``, "");
    lines.push("| Verb | Path | SDK method | Hybrid mode | Sandbox mode |", "|---|---|---|---|---|");
    for (const endpoint of list) {
      const [hybrid, sandbox] = hostCell(endpoint.verb, endpoint.path);
      lines.push(
        `| ${endpoint.verb} | \`${endpoint.path}\` | \`client.${resource}.${endpoint.method}()\` | ${hybrid} | ${sandbox} |`,
      );
    }
    lines.push("");
  }

  lines.push(
    "## Not REST",
    "",
    "| Surface | SDK entry point | Notes |",
    "|---|---|---|",
    "| Token generation (`auth.dhan.co`) | `client.auth.generateAccessToken()`, `client.auth.enableAutoTokenManagement()` | PIN + TOTP; production only — see AUTHENTICATION.md |",
    "| Token renewal (`/RenewToken`) | `client.auth.renewWebToken()` | production only |",
    "| Market feed WebSocket | `client.ws.market` | production only; see WS_PROTOCOL.md |",
    "| Order update WebSocket | `client.ws.orders` | production only; sandbox orders do not appear |",
    "| 20/200-level depth WebSocket | `client.ws.enableDepth()` | production only |",
    "",
  );

  return lines.join("\n");
}

if (require.main === module) {
  const target = join(ROOT, "docs", "API_MAPPING.md");
  writeFileSync(target, renderMapping());
  console.log(`wrote ${target}`);
}
