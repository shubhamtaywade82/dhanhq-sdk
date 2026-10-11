import axios, { type AxiosInstance } from "axios";

import {
  AuthResolver,
  DhanAuth,
  FileTokenStore,
  TokenManager,
  type EnableAutoTokenManagementOptions,
} from "../auth";
import { AuthenticationError } from "../errors";
import { parseMode } from "./Environment";
import { GeneratedClient } from "./GeneratedClient";
import { HttpClient, type HttpClientDependencies } from "./HttpClient";
import type { DhanClientConfig } from "../types/common.types";
import type { Logger } from "../types/logger.types";
import {
  Alerts,
  Charts,
  ConditionalTriggers,
  Edis,
  ExpiredOptionsData,
  ForeverOrders,
  Funds,
  GlobalStocks,
  Instruments,
  IpSetup,
  MarginCalculator,
  MarketFeed,
  OptionChain,
  Orders,
  Positions,
  Profile,
  ScanX,
  Statements,
  SuperOrders,
  TraderControls,
} from "../resources";
import { DhanWS } from "../ws";

export interface DhanClientDependencies extends HttpClientDependencies {
  logger?: Logger;
}

export class DhanClient {
  public readonly generated: GeneratedClient;
  public readonly orders: Orders;
  public readonly superOrders: SuperOrders;
  public readonly positions: Positions;
  public readonly alerts: Alerts;
  public readonly conditionalTriggers: ConditionalTriggers;
  public readonly expiredOptionsData: ExpiredOptionsData;
  public readonly foreverOrders: ForeverOrders;
  public readonly funds: Funds;
  public readonly charts: Charts;
  public readonly edis: Edis;
  public readonly statements: Statements;
  public readonly traderControls: TraderControls;
  public readonly ipSetup: IpSetup;
  public readonly profile: Profile;
  public readonly marketFeed: MarketFeed;
  public readonly optionChain: OptionChain;
  public readonly instruments: Instruments;
  /** The US equities book — a separate namespace so USD and INR never mix. */
  public readonly globalStocks: GlobalStocks;
  public readonly marginCalculator: MarginCalculator;
  /** ScanX market-analytics data APIs (company info, movers, news, technicals). */
  public readonly scanx: ScanX;
  public readonly ws: DhanWS;
  public readonly auth: {
    generateAccessToken: typeof DhanAuth.generateAccessToken;
    generateTotp: typeof DhanAuth.generateTotp;
    renewWebToken: typeof DhanAuth.renewWebToken;
    enableAutoTokenManagement: (
      options: EnableAutoTokenManagementOptions,
    ) => TokenManager;
  };
  private tokenManager?: TokenManager;

  constructor(
    private readonly config: DhanClientConfig,
    dependencies: DhanClientDependencies = {},
  ) {
    const userOnTokenExpired = config.onTokenExpired;
    const httpClient = new HttpClient(config, {
      axiosInstance: dependencies.axiosInstance,
      rateLimiter: dependencies.rateLimiter,
      logger: dependencies.logger,
      circuitBreaker: dependencies.circuitBreaker,
    });

    this.generated = new GeneratedClient(config);
    this.orders = new Orders(httpClient);
    this.superOrders = new SuperOrders(httpClient);
    this.positions = new Positions(httpClient);
    this.alerts = new Alerts(httpClient);
    this.conditionalTriggers = new ConditionalTriggers(httpClient);
    this.expiredOptionsData = new ExpiredOptionsData(httpClient);
    this.foreverOrders = new ForeverOrders(httpClient);
    this.funds = new Funds(httpClient);
    this.charts = new Charts(httpClient);
    this.edis = new Edis(httpClient);
    this.statements = new Statements(httpClient);
    this.traderControls = new TraderControls(httpClient);
    this.ipSetup = new IpSetup(httpClient);
    this.profile = new Profile(httpClient);
    this.marketFeed = new MarketFeed(httpClient);
    this.optionChain = new OptionChain(httpClient);
    this.instruments = new Instruments(httpClient, {
      cacheTtlMs: config.instrumentCacheTtlMs,
    });
    this.globalStocks = new GlobalStocks(httpClient);
    this.marginCalculator = new MarginCalculator(httpClient);
    this.scanx = new ScanX(httpClient);
    // Resolve the WebSocket token from the live config on every (re)connect,
    // so a tokenProvider installed later — enableAutoTokenManagement — and
    // every renewed token reach the sockets, not just the value at startup.
    const wsAuth = new AuthResolver(config);
    this.ws = new DhanWS({
      token: config.token,
      tokenProvider: () => wsAuth.resolveAccessToken(),
      clientId: config.clientId,
      marketFeedUrl: config.marketFeedUrl ?? config.wsUrl,
      orderUpdateUrl: config.orderUpdateUrl,
      reconnectDelayMs: config.wsReconnectDelayMs,
      orderUserType: config.wsOrderUserType,
      partnerId: config.partnerId,
      partnerSecret: config.partnerSecret,
      logger: dependencies.logger,
    });
    this.auth = {
      generateAccessToken: DhanAuth.generateAccessToken,
      generateTotp: DhanAuth.generateTotp,
      renewWebToken: DhanAuth.renewWebToken,
      enableAutoTokenManagement: (options) => {
        if (this.config.mode === "sandbox") {
          // PIN/TOTP login mints production tokens; in sandbox mode the
          // primary credentials go to sandbox.dhan.co, which rejects them.
          throw new AuthenticationError(
            "Configuration",
            "PIN/TOTP token management issues production tokens and cannot be used in sandbox mode — " +
              "use the sandbox token from cloud.dhanhq.co",
          );
        }

        const manager = new TokenManager(this.config, options);
        this.tokenManager = manager;
        this.config.tokenProvider = () => manager.ensureValidToken();
        // A 401 means the broker no longer accepts the token (expired early,
        // or replaced by a login elsewhere): log in again before any replay.
        this.config.onTokenExpired = async (error) => {
          await manager.handleUnauthorized();
          await userOnTokenExpired?.(error);
        };
        return manager;
      },
    };
  }

  public getConfig(): DhanClientConfig {
    return this.config;
  }

  /** The PIN/TOTP token manager, once enabled. */
  public getTokenManager(): TokenManager | undefined {
    return this.tokenManager;
  }

  /**
   * Builds a client from the standard environment variables:
   * `DHAN_CLIENT_ID` plus either `DHAN_ACCESS_TOKEN`, or `DHAN_PIN` and
   * `DHAN_TOTP_SECRET` for automatic PIN/TOTP login. Optional: `DHAN_BASE_URL`,
   * `DHAN_MODE` (`live` | `sandbox` | `hybrid`), `DHAN_SANDBOX_CLIENT_ID`,
   * `DHAN_SANDBOX_ACCESS_TOKEN`, `DHAN_SANDBOX_BASE_URL`, `DHAN_PARTNER_ID`,
   * `DHAN_PARTNER_SECRET`, and for PIN/TOTP login `DHAN_TOKEN_CACHE_DIR`
   * (default `~/.dhanhq`) or `DHAN_TOKEN_CACHE=off`.
   *
   * With `DHAN_PIN` + `DHAN_TOTP_SECRET` the token is generated on first use,
   * renewed before expiry, regenerated after a 401, and cached on disk so a
   * restart reuses it instead of logging in again (a fresh login can
   * invalidate the token another process on the same account holds). They
   * take precedence over `DHAN_ACCESS_TOKEN` when both are set, and are
   * ignored in `sandbox` mode, which needs the sandbox's own token.
   *
   * Throws rather than constructing a client that would fail on its first
   * request — a missing credential is a startup problem, not a runtime one.
   */
  public static fromEnv(
    env: NodeJS.ProcessEnv = process.env,
    overrides: Partial<DhanClientConfig> = {},
  ): DhanClient {
    const clientId = env.DHAN_CLIENT_ID;
    const token = env.DHAN_ACCESS_TOKEN;
    const pin = nonEmpty(env.DHAN_PIN);
    const totpSecret = nonEmpty(env.DHAN_TOTP_SECRET);

    if (!clientId) {
      throw new AuthenticationError("Configuration", "DHAN_CLIENT_ID is not set");
    }

    if (Boolean(pin) !== Boolean(totpSecret)) {
      throw new AuthenticationError(
        "Configuration",
        "PIN/TOTP login needs both DHAN_PIN and DHAN_TOTP_SECRET",
      );
    }

    const mode = overrides.mode ?? parseMode(env.DHAN_MODE);
    // Sandbox mode sends the primary credentials to sandbox.dhan.co, which
    // only accepts its own token — PIN/TOTP (production) login does not apply.
    const useTotp =
      Boolean(pin && totpSecret) && mode !== "sandbox" && !overrides.token && !overrides.tokenProvider;

    if (!token && !useTotp && !overrides.token && !overrides.tokenProvider) {
      throw new AuthenticationError(
        "Configuration",
        "DHAN_ACCESS_TOKEN is not set — provide it, set DHAN_PIN and DHAN_TOTP_SECRET, or pass a tokenProvider override",
      );
    }

    const client = new DhanClient({
      clientId,
      token: useTotp ? undefined : token,
      baseURL: env.DHAN_BASE_URL,
      mode,
      sandboxBaseURL: env.DHAN_SANDBOX_BASE_URL,
      sandboxToken: env.DHAN_SANDBOX_ACCESS_TOKEN,
      sandboxClientId: env.DHAN_SANDBOX_CLIENT_ID,
      partnerId: env.DHAN_PARTNER_ID,
      partnerSecret: env.DHAN_PARTNER_SECRET,
      ...overrides,
    });

    if (useTotp) {
      const cacheOff = ["off", "false", "0"].includes((env.DHAN_TOKEN_CACHE ?? "").trim().toLowerCase());
      client.auth.enableAutoTokenManagement({
        clientId,
        pin: pin as string,
        totpSecret: totpSecret as string,
        store: cacheOff ? undefined : new FileTokenStore({ directory: env.DHAN_TOKEN_CACHE_DIR }),
      });
    }

    return client;
  }

  public static async fromTokenEndpoint(options: {
    endpointBaseUrl: string;
    bearerToken: string;
    axiosInstance?: AxiosInstance;
  }): Promise<DhanClient> {
    const client =
      options.axiosInstance ??
      axios.create({
        baseURL: options.endpointBaseUrl,
        timeout: 5000,
      });
    const response = await client.get<{
      access_token?: string;
      client_id?: string;
      base_url?: string;
    }>("/auth/dhan/token", {
      headers: {
        Authorization: `Bearer ${options.bearerToken}`,
        Accept: "application/json",
      },
    });

    return new DhanClient({
      token: response.data.access_token,
      clientId: response.data.client_id ?? "",
      baseURL: response.data.base_url,
    });
  }
}

/** The trimmed value, or `undefined` when unset or blank. */
function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === "" ? undefined : trimmed;
}
