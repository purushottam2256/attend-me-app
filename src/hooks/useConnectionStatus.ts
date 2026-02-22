/**
 * useConnectionStatus - Re-exports from ConnectionStatusContext
 *
 * IMPORTANT: This is now a thin re-export. The actual logic lives in
 * ConnectionStatusContext.tsx as a single-instance provider.
 * All screens that call useConnectionStatus() read from the shared context
 * instead of creating their own NetInfo listeners.
 */

export { useConnectionStatus, ConnectionStatusProvider } from '../contexts/ConnectionStatusContext';
export type { ConnectionStatus } from '../contexts/ConnectionStatusContext';

export default function useConnectionStatusDefault() {
  // Legacy default export — delegates to context
  const { useConnectionStatus: hook } = require('../contexts/ConnectionStatusContext');
  return hook();
}
