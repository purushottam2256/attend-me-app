/**
 * useIsMounted.test.ts — Tests for the mount-safety hook
 */

import { renderHook, act } from '@testing-library/react-native';
import { useIsMounted } from '../src/hooks/useIsMounted';

describe('useIsMounted', () => {
  it('returns true while mounted', () => {
    const { result } = renderHook(() => useIsMounted());
    expect(result.current.current).toBe(true);
  });

  it('returns false after unmount', () => {
    const { result, unmount } = renderHook(() => useIsMounted());
    
    expect(result.current.current).toBe(true);
    
    unmount();
    
    expect(result.current.current).toBe(false);
  });

  it('can be used to guard setState calls', async () => {
    const { result, unmount } = renderHook(() => useIsMounted());
    const isMounted = result.current;

    // Simulate an async operation
    const safeSetState = () => {
      if (isMounted.current) {
        return 'safe-update';
      }
      return 'skipped';
    };

    // While mounted
    expect(safeSetState()).toBe('safe-update');

    // After unmount
    unmount();
    expect(safeSetState()).toBe('skipped');
  });
});
