/**
 * Logger Utility
 * 
 * Production-safe logging that only outputs in __DEV__ mode.
 * Replaces raw console.log/console.error throughout the app.
 * 
 * In production builds, all log calls become no-ops for:
 * - Security: prevents leaking internal state to device logs
 * - Performance: eliminates string formatting overhead in hot paths
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const NOOP = () => {};

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
