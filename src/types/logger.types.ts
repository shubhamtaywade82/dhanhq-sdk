/**
 * Logger interface for structured logging throughout the SDK.
 * Implementations should handle log levels, formatting, and output destinations.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  /**
   * Log debug-level messages (only shown in debug mode).
   * @param message - The log message
   * @param context - Optional contextual data for debugging
   */
  debug(message: string, context?: Record<string, unknown>): void;
  
  /**
   * Log info-level messages (normal operational events).
   * @param message - The log message
   * @param context - Optional contextual data
   */
  info(message: string, context?: Record<string, unknown>): void;
  
  /**
   * Log warning-level messages (potential issues).
   * @param message - The log message
   * @param context - Optional contextual data
   */
  warn(message: string, context?: Record<string, unknown>): void;
  
  /**
   * Log error-level messages (errors that need attention).
   * @param message - The log message
   * @param error - Optional Error object
   * @param context - Optional contextual data
   */
  error(message: string, error?: Error, context?: Record<string, unknown>): void;
}

/**
 * Configuration options for ConsoleLogger.
 */
export interface ConsoleLoggerOptions {
  /** Minimum log level to display (default: 'info') */
  level?: LogLevel;
  /** Optional prefix for all log messages */
  prefix?: string;
  /** Enable/disable colors in output (default: true for TTY) */
  colors?: boolean;
}

/**
 * Default console-based logger implementation.
 * Supports log levels, timestamps, and optional prefixes.
 */
export class ConsoleLogger implements Logger {
  private readonly level: LogLevel;
  private readonly prefix?: string;
  private readonly colors: boolean;
  
  private static readonly LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];
  
  constructor(options: ConsoleLoggerOptions = {}) {
    this.level = options.level ?? 'info';
    this.prefix = options.prefix;
    this.colors = options.colors ?? this.isTTY();
  }
  
  debug(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('debug')) {
      // eslint-disable-next-line no-console -- writing to the console is this logger's job
      console.debug(this.format('DEBUG', message, context));
    }
  }
  
  info(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('info')) {
      // eslint-disable-next-line no-console -- writing to the console is this logger's job
      console.info(this.format('INFO', message, context));
    }
  }
  
  warn(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('warn')) {
      console.warn(this.format('WARN', message, context));
    }
  }
  
  error(message: string, error?: Error, context?: Record<string, unknown>): void {
    const ctx = error ? { ...context, error: error.message, stack: error.stack } : context;
    console.error(this.format('ERROR', message, ctx));
  }
  
  private shouldLog(level: LogLevel): boolean {
    const minLevelIndex = ConsoleLogger.LEVELS.indexOf(this.level);
    const currentLevelIndex = ConsoleLogger.LEVELS.indexOf(level);
    return currentLevelIndex >= minLevelIndex;
  }
  
  private format(level: string, message: string, context?: Record<string, unknown>): string {
    const timestamp = new Date().toISOString();
    const prefixStr = this.prefix ? `[${this.prefix}]` : '';
    const levelColor = this.colorize(level, this.getLevelColor(level));
    const contextStr = context && Object.keys(context).length > 0 
      ? ` ${JSON.stringify(context)}` 
      : '';
    
    return `${timestamp} ${prefixStr}[${levelColor}] ${message}${contextStr}`;
  }
  
  private getLevelColor(level: string): string {
    switch (level) {
      case 'DEBUG': return '36'; // Cyan
      case 'INFO': return '32';  // Green
      case 'WARN': return '33';  // Yellow
      case 'ERROR': return '31'; // Red
      default: return '0';
    }
  }
  
  private colorize(text: string, colorCode: string): string {
    if (!this.colors) return text;
    return `\x1b[${colorCode}m${text}\x1b[0m`;
  }
  
  private isTTY(): boolean {
    return typeof process !== 'undefined' && process.stdout?.isTTY === true;
  }
}

/**
 * No-op logger for silent operation.
 */
export class NullLogger implements Logger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}
