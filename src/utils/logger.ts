/**
 * Logger Utility
 *
 * Production-safe logging:
 * - debug/info: dev-only (no-ops in production)
 * - warn/error: ALWAYS log to Sentry in production for crash diagnostics
 *
 * In dev mode, all levels output to console.
 */

import * as Sentry from '@sentry/react-native';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const NOOP = () => {};

const createLogger = (tag: string) => {
  const formatDev = (level: LogLevel, ...args: any[]) => {
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

  if (__DEV__) {
    return {
      debug: (...args: any[]) => formatDev('debug', ...args),
      info: (...args: any[]) => formatDev('info', ...args),
      warn: (...args: any[]) => formatDev('warn', ...args),
      error: (...args: any[]) => formatDev('error', ...args),
    };
  }

  // PRODUCTION: warn/error go to Sentry, debug/info are no-ops
  return {
    debug: NOOP,
    info: NOOP,
    warn: (...args: any[]) => {
      try {
        const message = args.map(a =>
          typeof a === 'object' ? JSON.stringify(a).slice(0, 500) : String(a)
        ).join(' ');
        Sentry.addBreadcrumb({
          category: tag,
          message,
          level: 'warning',
        });
      } catch {
        // Sentry itself failed — swallow silently
      }
    },
    error: (...args: any[]) => {
      try {
        const firstError = args.find(a => a instanceof Error);
        const message = args.map(a =>
          typeof a === 'object' && !(a instanceof Error)
            ? JSON.stringify(a).slice(0, 500)
            : String(a)
        ).join(' ');

        if (firstError) {
          Sentry.captureException(firstError, {
            tags: { logger: tag },
            extra: { message },
          });
        } else {
          Sentry.captureMessage(`[${tag}] ${message}`, 'error');
        }
      } catch {
        // Sentry itself failed — swallow silently
      }
    },
  };
};

export default createLogger;
