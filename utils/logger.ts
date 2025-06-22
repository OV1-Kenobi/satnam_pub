/**
 * Structured Logger Utility
 *
 * Provides structured logging with context, privacy protection, and production-ready features.
 * Replaces direct console usage with proper structured logging for better monitoring and debugging.
 */

export interface LogContext {
  [key: string]: any;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  module?: string;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

export interface LoggerConfig {
  module: string;
  level?: LogLevel;
  enableConsole?: boolean;
  enableStructured?: boolean;
  sanitizeContext?: boolean;
}

/**
 * Privacy-aware context sanitizer
 * Removes or truncates sensitive information from log context
 */
function sanitizeContext(context: LogContext): LogContext {
  const sanitized: LogContext = {};

  for (const [key, value] of Object.entries(context)) {
    const lowerKey = key.toLowerCase();

    // Sanitize truly sensitive keys - be more specific to avoid false positives
    if (
      lowerKey.includes("secret") ||
      lowerKey.includes("private") ||
      lowerKey.endsWith("key") ||
      lowerKey.includes("password") ||
      lowerKey.includes("token") ||
      lowerKey.includes("seed") ||
      lowerKey.includes("mnemonic")
    ) {
      sanitized[key] = "[REDACTED]";
    } else if (lowerKey.includes("npub") && typeof value === "string") {
      // Truncate npub for privacy
      sanitized[key] = value.substring(0, 8) + "...";
    } else if (lowerKey.includes("pubkey") && typeof value === "string") {
      // Truncate pubkey for privacy
      sanitized[key] = value.substring(0, 8) + "...";
    } else if (lowerKey.includes("relay") && typeof value === "string") {
      // Extract hostname only from relay URLs
      try {
        sanitized[key] = new URL(value).hostname;
      } catch {
        sanitized[key] = "invalid-url";
      }
    } else if (lowerKey.includes("ip") && typeof value === "string") {
      // Mask IP addresses for privacy
      const parts = value.split(".");
      if (parts.length === 4) {
        sanitized[key] = `${parts[0]}.${parts[1]}.xxx.xxx`;
      } else {
        sanitized[key] = "masked-ip";
      }
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Logger class providing structured logging capabilities
 */
export class Logger {
  private config: Required<LoggerConfig>;
  private logLevels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
    fatal: 4,
  };

  constructor(config: LoggerConfig) {
    this.config = {
      level: "info",
      enableConsole: true,
      enableStructured: true,
      sanitizeContext: true,
      ...config,
    };
  }

  private shouldLog(level: LogLevel): boolean {
    return this.logLevels[level] >= this.logLevels[this.config.level];
  }

  private formatLogEntry(
    level: LogLevel,
    message: string,
    context?: LogContext,
    error?: Error
  ): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      module: this.config.module,
    };

    if (context) {
      entry.context = this.config.sanitizeContext
        ? sanitizeContext(context)
        : context;
    }

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    return entry;
  }

  private writeLog(entry: LogEntry): void {
    if (this.config.enableConsole) {
      const consoleMethod =
        entry.level === "debug"
          ? console.debug
          : entry.level === "info"
            ? console.info
            : entry.level === "warn"
              ? console.warn
              : console.error;

      if (this.config.enableStructured) {
        consoleMethod(JSON.stringify(entry, null, 2));
      } else {
        const contextStr = entry.context
          ? ` ${JSON.stringify(entry.context)}`
          : "";
        const errorStr = entry.error ? ` Error: ${entry.error.message}` : "";
        consoleMethod(
          `[${entry.timestamp}] ${entry.level.toUpperCase()} [${entry.module}] ${entry.message}${contextStr}${errorStr}`
        );
      }
    }

    // In production, you might want to send logs to external services
    // This is where you'd integrate with services like DataDog, CloudWatch, etc.
  }

  debug(message: string, context?: LogContext): void {
    if (!this.shouldLog("debug")) return;
    const entry = this.formatLogEntry("debug", message, context);
    this.writeLog(entry);
  }

  info(message: string, context?: LogContext): void {
    if (!this.shouldLog("info")) return;
    const entry = this.formatLogEntry("info", message, context);
    this.writeLog(entry);
  }

  warn(message: string, context?: LogContext): void {
    if (!this.shouldLog("warn")) return;
    const entry = this.formatLogEntry("warn", message, context);
    this.writeLog(entry);
  }

  error(message: string, context?: LogContext, error?: Error): void {
    if (!this.shouldLog("error")) return;
    const entry = this.formatLogEntry("error", message, context, error);
    this.writeLog(entry);
  }

  fatal(message: string, context?: LogContext, error?: Error): void {
    if (!this.shouldLog("fatal")) return;
    const entry = this.formatLogEntry("fatal", message, context, error);
    this.writeLog(entry);
  }

  /**
   * Create a child logger with additional context
   */
  child(additionalContext: LogContext): Logger {
    const childLogger = new Logger(this.config);
    const originalWriteLog = childLogger.writeLog.bind(childLogger);

    childLogger.writeLog = (entry: LogEntry) => {
      if (entry.context) {
        entry.context = { ...additionalContext, ...entry.context };
      } else {
        entry.context = additionalContext;
      }
      originalWriteLog(entry);
    };

    return childLogger;
  }
}

/**
 * Create a logger instance for a specific module
 */
export function createLogger(
  module: string,
  config?: Partial<LoggerConfig>
): Logger {
  return new Logger({
    module,
    ...config,
  });
}

/**
 * Default logger instance
 */
export const defaultLogger = createLogger("app");
