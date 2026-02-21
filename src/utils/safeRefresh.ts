/**
 * safeRefresh - Guarantees that any async refresh operation completes
 * within a timeout, preventing stuck spinners forever.
 *
 * Features:
 * - try/finally guarantees setRefreshing(false) ALWAYS runs
 * - Promise.race forces a hard timeout if the network stalls
 * - Catches and logs errors silently to avoid crashes
 */

export async function safeRefresh(
  setRefreshing: (v: boolean) => void,
  action: () => Promise<void>,
  timeoutMs: number = 15000,
): Promise<void> {
  setRefreshing(true);
  try {
    await Promise.race([
      action(),
      new Promise<void>(resolve => setTimeout(resolve, timeoutMs)),
    ]);
  } catch (error) {
    console.error('[safeRefresh] Refresh failed:', error);
  } finally {
    setRefreshing(false);
  }
}
