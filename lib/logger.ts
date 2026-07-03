type LogLevel = 'info' | 'warn' | 'error' | 'debug';

type LogContext = Record<string, unknown>;

function formatMessage(level: LogLevel, message: string, context?: LogContext): string {
  const ts = new Date().toISOString();
  const ctx = context ? ` ${JSON.stringify(context)}` : '';
  return `[${ts}] [${level.toUpperCase()}] ${message}${ctx}`;
}

function sanitizeForLog(data: unknown): unknown {
  if (typeof data !== 'object' || data === null) return data;
  const sensitive = new Set(['password', 'token', 'secret', 'key', 'authorization']);
  return Object.fromEntries(
    Object.entries(data as Record<string, unknown>).map(([k, v]) => [
      k,
      sensitive.has(k.toLowerCase()) ? '[REDACTED]' : v,
    ]),
  );
}

export const logger = {
  info(message: string, context?: LogContext): void {
    if (process.env.NODE_ENV !== 'test') {
      process.stdout.write(formatMessage('info', message, context) + '\n');
    }
  },

  warn(message: string, context?: LogContext): void {
    process.stderr.write(formatMessage('warn', message, context) + '\n');
  },

  error(message: string, context?: LogContext & { error?: unknown }): void {
    const safeCtx = context ? (sanitizeForLog(context) as LogContext) : undefined;
    process.stderr.write(formatMessage('error', message, safeCtx) + '\n');
  },

  debug(message: string, context?: LogContext): void {
    if (process.env.NODE_ENV === 'development') {
      process.stdout.write(formatMessage('debug', message, context) + '\n');
    }
  },
};
