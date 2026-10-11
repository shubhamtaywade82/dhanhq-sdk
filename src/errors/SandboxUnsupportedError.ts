import { DhanError } from "./DhanError";

/**
 * A request would go to the Dhan sandbox host for an endpoint the sandbox does
 * not serve. Raised before any network I/O. The request is never sent to
 * production instead: in `hybrid` mode that would turn a paper order into a
 * real one.
 */
export class SandboxUnsupportedError extends DhanError {
  constructor(method: string, url: string) {
    super(
      `${method} ${url} is not available on the Dhan sandbox (https://sandbox.dhan.co/v2). ` +
        "It has no sandbox equivalent; use mode \"live\" for it, or keep it out of sandbox runs.",
      { code: "SANDBOX_UNSUPPORTED" },
    );
    this.name = "SandboxUnsupportedError";
  }
}
