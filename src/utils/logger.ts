/**
 * Logger Utility
 * 
 * Production-safe logging that only outputs in __DEV__ mode.
 * Replaces raw console.log/console.error throughout the app.
 * 
 * In production builds, all log calls become no-ops for:
 * - Security: prevents leaking internal state to device logs
 * - Performance: eliminates string formatting overhead in hot paths
 *
 * In dev mode, log calls are THROTTLED per tag (max 1 per 500ms)
 * to prevent console.log bridge traffic from freezing the UI.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const NOOP = () => {};

// Throttle: max 1 log per tag+level per 500ms to prevent bridge spam
const THROTTLE_MS = 500;
const lastLogTime = new Map<string, number>();

const createLogger = (tag: string) => {
  if (!__DEV__) {
    return {
      debug: NOOP,
      info: NOOP,
      warn: NOOP,
      error: NOOP,
    };
  }

  const format = (level: LogLevel, ...args: any[]) => {
    // Errors always go through — never throttle error messages
    if (level !== 'error') {
      const key = `${tag}:${level}`;
      const now = Date.now();
      const last = lastLogTime.get(key) || 0;
      if (now - last < THROTTLE_MS) return; // skip — too frequent
      lastLogTime.set(key, now);
    }

    const prefix = `[${tag}][${level.toUpperCase()}]`;
    switch (level) {
      case 'debug':
        console.log(prefix, ...args);
        break;
      case 'info':
        console.info(prefix, ...args);
        break;
      case 'warn':
        console.warn(prefix, ...args);
        break;
      case 'error':
        console.error(prefix, ...args);
        break;
    }
  };

  return {
    debug: (...args: any[]) => format('debug', ...args),
    info: (...args: any[]) => format('info', ...args),
    warn: (...args: any[]) => format('warn', ...args),
    error: (...args: any[]) => format('error', ...args),
  };
};

export default createLogger;

