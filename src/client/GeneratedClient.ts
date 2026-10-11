import { OpenAPI } from "../generated";
import type { DhanClientConfig } from "../types/common.types";
import { LIVE_BASE_URL, SANDBOX_BASE_URL } from "./Environment";

/**
 * Raw access to the OpenAPI-codegen services (`client.generated.*`) for
 * endpoints not yet wrapped by a hand-written resource class.
 *
 * Unlike every `client.<resource>` call, these bypass {@link HttpClient} —
 * and with it the tiered {@link RateLimiter} — entirely. Each generated
 * service method calls the codegen's own `request()` against the default
 * `axios` export directly, with no interceptor hook and no way to pass a
 * custom axios instance without editing files under `src/generated` (which
 * `npm run generate` overwrites). Patching the global `axios` singleton from
 * here was considered and rejected: it would throttle any other code in the
 * host process that happens to import the raw `axios` package, which is
 * exactly the kind of surprising action-at-a-distance a library must not do.
 *
 * Prefer the wrapped resource classes (`client.optionChain`, `client.orders`,
 * etc.) for anything rate-sensitive. If you call `client.generated.*`
 * directly — especially the option-chain or order endpoints — you are
 * responsible for spacing your own calls to Dhan's documented limits.
 */
export class GeneratedClient {
  constructor(config: DhanClientConfig) {
    OpenAPI.TOKEN = undefined;

    // The generated services cannot route per call. Outside `live` mode they
    // point at the sandbox with sandbox credentials, so a raw generated call
    // can never place a real order from a `sandbox` or `hybrid` client — at
    // worst a market-data call fails on the sandbox. Use the wrapped resources
    // for hybrid routing.
    if ((config.mode ?? "live") !== "live") {
      const token =
        config.sandboxToken ?? (config.mode === "sandbox" ? config.token : undefined);
      OpenAPI.BASE = config.sandboxBaseURL ?? SANDBOX_BASE_URL;
      OpenAPI.HEADERS = token ? { "access-token": token } : undefined;
      return;
    }

    OpenAPI.BASE = config.baseURL ?? LIVE_BASE_URL;
    OpenAPI.HEADERS = config.token
      ? {
          "access-token": config.token,
        }
      : undefined;
  }
}
