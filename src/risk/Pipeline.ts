import type { Instrument } from "../resources/Instruments";
import {
  asmGsmCheck,
  concentrationCheck,
  marketHoursCheck,
  maxLossCheck,
  optionsCheck,
  orderTypeCheck,
  positionLimitsCheck,
  productSupportCheck,
  quantityCheck,
  tradingPermissionCheck,
  instrumentKind,
  isRiskReducing,
} from "./checks";
import {
  DEFAULT_RISK_LIMITS,
  type RiskCheck,
  type RiskContext,
  type RiskDataProvider,
  type RiskFunds,
  type RiskLimits,
  type RiskOrderArgs,
  type RiskPosition,
} from "./types";

export type RiskInstrumentKind = "equity" | "options";

/** Checks every order runs through, in order. */
export const BASE_CHECKS: RiskCheck[] = [
  tradingPermissionCheck,
  asmGsmCheck,
  productSupportCheck,
  orderTypeCheck,
  quantityCheck,
  marketHoursCheck,
  positionLimitsCheck,
  concentrationCheck,
];

/** Additional checks for options orders. */
export const OPTION_CHECKS: RiskCheck[] = [optionsCheck];

/** Account-wide checks, run last so cheaper per-order checks fail first. */
export const DAILY_CHECKS: RiskCheck[] = [maxLossCheck];

export interface PipelineConfig {
  limits?: Partial<RiskLimits>;
  provider?: RiskDataProvider;
  /** Replaces {@link BASE_CHECKS} wholesale when supplied. */
  checks?: RiskCheck[];
}

export interface PipelineRunOptions {
  args: RiskOrderArgs;
  instrument?: Instrument;
  type?: RiskInstrumentKind;
  now?: Date;
}

export interface RiskReport {
  passed: boolean;
  violations: Array<{ check: string; message: string }>;
}

/**
 * Pre-execution risk pipeline.
 *
 * Runs each check in sequence and throws {@link RiskViolationError} on the
 * first failure, so nothing reaches the broker after a rejection. Checks that
 * need account state go through a {@link RiskDataProvider}; without one, those
 * checks pass rather than block, which keeps the pipeline usable offline for
 * order-shape validation.
 *
 * These checks encode NSE/BSE rules and resolve instruments from the Indian
 * scrip master — they do not apply to the Global Stocks (US equities) book.
 */
export class Pipeline {
  private readonly limits: RiskLimits;
  private readonly provider?: RiskDataProvider;
  private readonly checks: RiskCheck[];

  constructor(config: PipelineConfig = {}) {
    this.limits = { ...DEFAULT_RISK_LIMITS, ...config.limits };
    this.provider = config.provider;
    this.checks = config.checks ?? BASE_CHECKS;
  }

  private async buildContext(options: PipelineRunOptions): Promise<RiskContext> {
    const provider = memoizeProvider(this.provider);
    const reducing = provider ? isRiskReducing(options.args, await provider.positions()) : false;

    return {
      args: options.args,
      instrument: options.instrument,
      now: options.now ?? new Date(),
      limits: this.limits,
      provider,
      reducing,
    };
  }

  /** Runs every applicable check. Throws on the first violation. */
  public async run(options: PipelineRunOptions): Promise<true> {
    const context = await this.buildContext(options);

    const applicable = [
      ...this.checks,
      ...(options.type === "options" ? OPTION_CHECKS : []),
      ...DAILY_CHECKS,
    ];

    for (const check of applicable) {
      await check.run(context);
    }

    return true;
  }

  /**
   * Runs every check and collects the failures instead of throwing — for
   * previews and dry runs, where the caller wants the full picture rather
   * than the first problem.
   */
  public async report(options: PipelineRunOptions): Promise<RiskReport> {
    const context = await this.buildContext(options);

    const applicable = [
      ...this.checks,
      ...(options.type === "options" ? OPTION_CHECKS : []),
      ...DAILY_CHECKS,
    ];

    const violations: RiskReport["violations"] = [];

    for (const check of applicable) {
      try {
        await check.run(context);
      } catch (error) {
        violations.push({
          check: check.name,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { passed: violations.length === 0, violations };
  }

  public getLimits(): RiskLimits {
    return this.limits;
  }
}

/**
 * Picks the check set from an instrument's type — anything whose
 * `instrumentType` starts with `OPT` gets the options rules on top.
 */
export function riskTypeFor(instrument?: Instrument): RiskInstrumentKind {
  return instrumentKind(instrument).startsWith("OPT") ? "options" : "equity";
}

/**
 * Wraps a provider so one run fetches positions and funds at most once,
 * however many checks ask for them.
 */
function memoizeProvider(provider?: RiskDataProvider): RiskDataProvider | undefined {
  if (!provider) {
    return undefined;
  }

  let positions: Promise<RiskPosition[]> | undefined;
  let funds: Promise<RiskFunds> | undefined;
  return {
    positions: () => (positions ??= provider.positions()),
    funds: () => (funds ??= provider.funds()),
  };
}
