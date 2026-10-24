import axios, {
  AxiosError,
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
} from "axios";
import Bottleneck from "bottleneck";

import { AuthResolver } from "../auth";
import type { ApiTier } from "../constants";
import { TradingErrorCode } from "../constants";
import {
  ApiResponseError,
  AuthenticationError,
  NetworkError,
  RateLimitError,
  SandboxUnsupportedError,
} from "../errors";
import { parseDhanErrorBody } from "../errors/ApiResponseError";
import type { DhanClientConfig } from "../types/common.types";
import type { Logger } from "../types/logger.types";
import {
  CircuitBreaker,
  type CircuitBreakerOptions,
  type CircuitState,
} from "./CircuitBreaker";
import {
  type DhanEnvironment,
  type DhanMode,
  SANDBOX_BASE_URL,
  environmentFor,
  sandboxSupports,
} from "./Environment";
import { RateLimiter } from "./RateLimiter";

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

export interface RequestOptions<TBody = unknown> {
  method: HttpMethod;
  url: string;
  data?: TBody;
  params?: Record<string, unknown>;
  headers?: Record<string, string>;
  /**
   * `true` only for requests with no side effects. Anything else — including
   * omitting the flag — is never replayed by the transport: not after a
   * timeout, not after a 5xx, and not after a 401 that triggered token
   * renewal. Trading writes must leave this `false`.
   */
  safeToRetry?: boolean;
  /**
   * Enforces the documented Dhan rate limit for this endpoint (`RATE_LIMITS`)
   * in addition to the generic read/write queue. Omit for endpoints without a
   * documented tier-specific limit narrower than the generic default.
   */
  tier?: ApiTier;
}

export interface HttpClientDependencies {
  axiosInstance?: AxiosInstance;
  rateLimiter?: RateLimiter;
  logger?: Logger;
  /** Pass `false` to disable the circuit breaker outright. */
  circuitBreaker?: CircuitBreaker | false;
}

export class HttpClient {
  private readonly axiosInstance: AxiosInstance;
  private readonly rateLimiter: RateLimiter;
  private readonly authResolver: AuthResolver;
  private readonly clientId: string;
  private readonly mode: DhanMode;
  private readonly sandboxBaseURL: string;
  /** Set when dedicated sandbox credentials are configured. */
  private readonly sandboxAuthResolver?: AuthResolver;
  private readonly sandboxClientId?: string;
  private readonly logger?: Logger;
  private readonly circuitBreaker?: CircuitBreaker;

  constructor(
    config: DhanClientConfig,
    dependencies: HttpClientDependencies = {},
  ) {
    this.authResolver = new AuthResolver(config);
    this.clientId = config.clientId;
    this.mode = config.mode ?? "live";
    this.sandboxBaseURL = config.sandboxBaseURL ?? SANDBOX_BASE_URL;
    this.sandboxClientId = config.sandboxClientId;
    if (config.sandboxToken || config.sandboxTokenProvider) {
      this.sandboxAuthResolver = new AuthResolver({
        clientId: config.sandboxClientId ?? config.clientId,
        token: config.sandboxToken,
        tokenProvider: config.sandboxTokenProvider,
      });
    }
    this.logger = dependencies.logger;
    this.rateLimiter =
      dependencies.rateLimiter ??
      new RateLimiter({ minTime: config.rateLimitMinTimeMs });
    this.axiosInstance =
      dependencies.axiosInstance ??
      axios.create({
        baseURL: config.baseURL ?? "https://api.dhan.co/v2",
        timeout: config.timeoutMs ?? 5000,
        headers: {
          Accept: "application/json",
        },
      });
    this.circuitBreaker = this.resolveCircuitBreaker(config, dependencies);
  }

  public async request<TResponse, TBody = unknown>(
    options: RequestOptions<TBody>,
  ): Promise<TResponse> {
    // Refused before queueing or the circuit breaker: an unsupported sandbox
    // call is a caller error, never sent anywhere — and never to production.
    if (this.environmentFor(options.url) === "sandbox" && !sandboxSupports(options.method, options.url)) {
      throw new SandboxUnsupportedError(options.method, options.url);
    }

    const run = async (): Promise<TResponse> => {
      const execute = () => this.execute<TResponse, TBody>(options);
      const isWrite = options.method !== "GET";

      try {
        if (options.tier) {
          return await this.rateLimiter.scheduleTier(options.tier, isWrite, execute);
        }

        if (isWrite) {
          return await this.rateLimiter.scheduleWrite(execute);
        }

        return await this.rateLimiter.scheduleRead(execute);
      } catch (error) {
        throw this.normalizeError(error);
      }
    };

    return this.circuitBreaker ? this.circuitBreaker.execute(run) : run();
  }

  /** Current circuit-breaker state, mainly useful for health checks/observability. */
  public getCircuitState(): CircuitState | undefined {
    return this.circuitBreaker?.getState();
  }

  private resolveCircuitBreaker(
    config: DhanClientConfig,
    dependencies: HttpClientDependencies,
  ): CircuitBreaker | undefined {
    if (dependencies.circuitBreaker !== undefined) {
      return dependencies.circuitBreaker === false ? undefined : dependencies.circuitBreaker;
    }

    if (config.circuitBreaker === false) {
      return undefined;
    }

    const options: CircuitBreakerOptions = config.circuitBreaker ?? {};
    return new CircuitBreaker({
      ...options,
      logger: options.logger ?? this.logger,
      isFailure:
        options.isFailure ??
        ((error) =>
          error instanceof NetworkError ||
          (error instanceof ApiResponseError && (error.status ?? 0) >= 500)),
    });
  }

  public getClientId(): string {
    return this.clientId;
  }

  /** The configured mode: `live`, `sandbox` or `hybrid`. */
  public getMode(): DhanMode {
    return this.mode;
  }

  /** The host a request to `url` goes to under the configured mode. */
  public environmentFor(url: string): DhanEnvironment {
    return environmentFor(this.mode, url);
  }

  public async getAccessToken(): Promise<string> {
    return this.authResolver.resolveAccessToken();
  }

  private async execute<TResponse, TBody>(
    options: RequestOptions<TBody>,
  ): Promise<TResponse> {
    try {
      const response = await this.axiosInstance.request<TResponse>(
        await this.toAxiosConfig(options),
      );
      return response.data;
    } catch (error) {
      const normalized = this.normalizeError(error);

      if (this.isAuthenticationFailure(normalized)) {
        if (this.usesDedicatedSandboxCredentials(options.url)) {
          // The production renewal hook cannot fix a sandbox token.
          throw new AuthenticationError(
            `${options.method} ${options.url}`,
            "rejected with 401 by the Dhan sandbox — check sandboxToken / DHAN_SANDBOX_ACCESS_TOKEN " +
              "(sandbox and production tokens are not interchangeable)",
            { status: 401, details: normalized.details, cause: normalized },
          );
        }
        if (options.safeToRetry !== true) {
          throw await this.rejectUnreplayableAfterAuthFailure(options, normalized);
        }

        await this.authResolver.handleTokenExpired(normalized);
        const response = await this.axiosInstance.request<TResponse>(
          await this.toAxiosConfig(options),
        );
        return response.data;
      }

      if (
        options.safeToRetry &&
        this.shouldRetry(normalized) &&
        options.method === "GET"
      ) {
        if (normalized instanceof RateLimitError && normalized.retryAfterMs) {
          await sleep(normalized.retryAfterMs);
        }

        const response = await this.axiosInstance.request<TResponse>(
          await this.toAxiosConfig(options),
        );
        return response.data;
      }

      throw normalized;
    }
  }

  /**
   * A 401 on a non-replayable request (any trading write): renew the token so
   * the *next* call succeeds, but never resend this one. Dhan rejecting an
   * expired token before execution is an implementation detail the SDK does
   * not rely on for duplicate-order safety. The 401 is the outcome reported
   * to the caller, even when renewal itself fails.
   */
  private async rejectUnreplayableAfterAuthFailure<TBody>(
    options: RequestOptions<TBody>,
    error: ApiResponseError,
  ): Promise<AuthenticationError> {
    let tokenRenewalError: unknown;
    try {
      await this.authResolver.handleTokenExpired(error);
    } catch (renewalError) {
      tokenRenewalError = renewalError;
      this.logger?.warn("Token renewal failed after 401 on a non-replayable request", {
        method: options.method,
        url: options.url,
        error: renewalError instanceof Error ? renewalError.message : String(renewalError),
      });
    }

    this.logger?.warn("401 on non-replayable request; token renewed, request NOT resent", {
      method: options.method,
      url: options.url,
      errorCode: error.errorCode,
    });

    return new AuthenticationError(
      `${options.method} ${options.url}`,
      "rejected with 401; request was not resent — retry explicitly once the token is valid",
      {
        status: 401,
        details:
          tokenRenewalError === undefined
            ? error.details
            : { response: error.details, tokenRenewalError },
        cause: error,
      },
    );
  }

  private async toAxiosConfig<TBody>(
    options: RequestOptions<TBody>,
  ): Promise<AxiosRequestConfig<TBody>> {
    if (this.environmentFor(options.url) === "sandbox") {
      const { token, clientId } = await this.sandboxCredentials();

      return {
        baseURL: this.sandboxBaseURL,
        method: options.method,
        url: options.url,
        data: rebindClientId(options.data, this.clientId, clientId),
        params: options.params,
        headers: {
          "access-token": token,
          "client-id": clientId,
          ...options.headers,
        },
      };
    }

    const token = await this.authResolver.resolveAccessToken();

    return {
      method: options.method,
      url: options.url,
      data: options.data,
      params: options.params,
      headers: {
        "access-token": token,
        "client-id": this.clientId,
        ...options.headers,
      },
    };
  }

  private usesDedicatedSandboxCredentials(url: string): boolean {
    return this.environmentFor(url) === "sandbox" && this.sandboxAuthResolver !== undefined;
  }

  /**
   * Sandbox credentials. Dedicated ones (`sandboxToken`/`sandboxClientId`) win;
   * in full `sandbox` mode the primary pair is used when they are absent, as it
   * always has been. In `hybrid` they are required: Dhan rejects a production
   * token on the sandbox, so sending one would only fail.
   */
  private async sandboxCredentials(): Promise<{ token: string; clientId: string }> {
    if (this.sandboxAuthResolver) {
      return {
        token: await this.sandboxAuthResolver.resolveAccessToken(),
        clientId: this.sandboxClientId ?? this.clientId,
      };
    }

    if (this.mode === "sandbox") {
      return {
        token: await this.authResolver.resolveAccessToken(),
        clientId: this.sandboxClientId ?? this.clientId,
      };
    }

    throw new AuthenticationError(
      "SandboxCredentials",
      `${this.mode} mode routes trading requests to the Dhan sandbox, which rejects production ` +
        "credentials — set sandboxToken and sandboxClientId (DHAN_SANDBOX_ACCESS_TOKEN / " +
        "DHAN_SANDBOX_CLIENT_ID, generated on https://cloud.dhanhq.co)",
    );
  }

  private shouldRetry(error: unknown): boolean {
    return (
      error instanceof NetworkError ||
      error instanceof RateLimitError ||
      (error instanceof ApiResponseError &&
        error.status !== undefined &&
        error.status >= 500)
    );
  }

  private isAuthenticationFailure(error: unknown): error is ApiResponseError {
    return (
      error instanceof ApiResponseError &&
      error.status !== undefined &&
      error.status === 401
    );
  }

  private normalizeError(error: unknown): Error {
    if (error instanceof Error && !(error instanceof AxiosError)) {
      return error;
    }

    if (error instanceof AxiosError || isAxiosLikeError(error)) {
      const axiosError = error as AxiosError;

      if (axiosError.response) {
        const status = axiosError.response.status;
        const payload = this.extractErrorPayload(axiosError.response);
        const { errorCode } = parseDhanErrorBody(payload);

        if (status === 429 || errorCode === TradingErrorCode.RATE_LIMIT) {
          return new RateLimitError(
            `Dhan API rate limit exceeded (status ${status})`,
            {
              status,
              details: payload,
              cause: error,
              retryAfterMs: this.extractRetryAfterHeader(axiosError.response),
            },
          );
        }

        return new ApiResponseError(
          `Dhan API request failed with status ${status}`,
          status,
          payload,
          error,
        );
      }

      if (axiosError.request) {
        return new NetworkError(
          `Network request failed: ${axiosError.message}`,
          error,
        );
      }
    }

    if (error instanceof Bottleneck.BottleneckError) {
      this.logger?.warn('Rate limit exceeded', {
        message: error.message,
        retryAfterMs: this.extractRetryAfter(error)
      });
      return new RateLimitError(
        `Rate limit exceeded: ${error.message}`,
        { cause: error, retryAfterMs: this.extractRetryAfter(error) }
      );
    }

    return new NetworkError("Unexpected request failure", error);
  }

  private extractRetryAfter(error: Bottleneck.BottleneckError): number | undefined {
    // Extract retry-after information from bottleneck error if available
    const { retryAfterMs } = error as Bottleneck.BottleneckError & { retryAfterMs?: number };
    if (retryAfterMs !== undefined) {
      return retryAfterMs;
    }
    // Default to 1 second if not specified
    return 1000;
  }

  private extractErrorPayload(response: AxiosResponse<unknown>): unknown {
    if (response.data === undefined) {
      return {
        status: response.status,
        statusText: response.statusText,
      };
    }

    return response.data;
  }

  /**
   * Reads the standard `Retry-After` header (delay-seconds form — Dhan does
   * not send the HTTP-date form) off a 429 response, in milliseconds.
   */
  private extractRetryAfterHeader(response: AxiosResponse<unknown>): number | undefined {
    const header = response.headers?.["retry-after"];
    const seconds = Number(Array.isArray(header) ? header[0] : header);
    return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : undefined;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAxiosLikeError(error: unknown): error is AxiosError {
  return (
    typeof error === "object" &&
    error !== null &&
    "isAxiosError" in error
  );
}

/**
 * Resources fill `dhanClientId` from the production client id. A sandbox
 * request authenticates with the sandbox client id, so the body must name the
 * same account: a production id is swapped for it; any other value is kept.
 */
function rebindClientId<TBody>(data: TBody, productionId: string, sandboxId: string): TBody {
  if (productionId === sandboxId || data === null || typeof data !== "object" || Array.isArray(data)) {
    return data;
  }

  const body = data as Record<string, unknown>;
  if (body.dhanClientId !== productionId) {
    return data;
  }

  return { ...body, dhanClientId: sandboxId } as TBody;
}
