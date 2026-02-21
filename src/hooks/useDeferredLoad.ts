/**
 * useDeferredLoad - Defers heavy async work until AFTER navigation animations finish
 *
 * WHY THIS FIXES FREEZES:
 * React Navigation animations run on the JS thread. If a screen fires 5+ Supabase
 * calls on mount, those promises compete with the animation for the JS thread,
 * causing janky transitions and full freezes on rapid navigation.
 *
 * HOW IT WORKS:
 * 1. InteractionManager.runAfterInteractions() — waits for the transition to finish
 * 2. Abort check — if the user navigated away before the transition finished, skip the load
 * 3. Returns a cleanup function that sets `cancelled = true` so stale fetches are discarded
 *
 * USAGE:
 *   useDeferredLoad(() => loadSchedule(true), [loadSchedule]);
 *   // or inside useFocusEffect:
 *   useFocusEffect(useCallback(() => deferredLoad(() => loadData()), [loadData]));
 */

import { useEffect, useCallback, useRef } from 'react';
import { InteractionManager } from 'react-native';

/**
 * Hook: runs the loader function AFTER navigation animations complete.
 * Automatically cancels if the component unmounts mid-transition.
 */
export function useDeferredLoad(
  loader: () => void | Promise<void>,
  deps: React.DependencyList = [],
) {
  useEffect(() => {
    let cancelled = false;

    const task = InteractionManager.runAfterInteractions(() => {
      if (!cancelled) {
        loader();
      }
    });

    return () => {
      cancelled = true;
      task.cancel();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/**
 * Standalone function: wraps a callback for use inside useFocusEffect.
 * Returns a cleanup function.
 *
 * Usage:
 *   useFocusEffect(useCallback(() => deferLoad(() => loadData()), [loadData]));
 */
export function deferLoad(loader: () => void | Promise<void>): () => void {
  let cancelled = false;

  const task = InteractionManager.runAfterInteractions(() => {
    if (!cancelled) {
      loader();
    }
  });

  return () => {
    cancelled = true;
    task.cancel();
  };
}
