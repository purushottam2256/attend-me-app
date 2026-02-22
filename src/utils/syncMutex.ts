/**
 * SyncMutex — Prevents overlapping sync operations.
 *
 * When the network flips online, multiple sources can try to sync
 * simultaneously (foreground trigger, background task, auto-sync on mount).
 * This mutex ensures only ONE sync runs at a time; the rest are skipped
 * (not queued) to avoid piling up work on the JS thread.
 *
 * Usage:
 *   const result = await syncMutex.run(() => doExpensiveSync());
 *   if (result === null) console.log('Skipped — another sync is running');
 */

import createLogger from './logger';

const log = createLogger('SyncMutex');

class SyncMutex {
  private locked = false;

  /** Run `fn` exclusively. Returns `null` if another call is already running. */
  async run<T>(fn: () => Promise<T>): Promise<T | null> {
    if (this.locked) {
      log.info('Mutex locked — skipping duplicate sync');
      return null;
    }

    this.locked = true;
    try {
      return await fn();
    } finally {
      this.locked = false;
    }
  }

  isLocked(): boolean {
    return this.locked;
  }
}

export const syncMutex = new SyncMutex();
export default syncMutex;
