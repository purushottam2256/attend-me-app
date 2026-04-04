/**
 * useIsMounted — Returns a ref that tracks whether the component is still mounted.
 * 
 * Usage:
 *   const isMounted = useIsMounted();
 *   
 *   useEffect(() => {
 *     fetchData().then(data => {
 *       if (isMounted.current) setState(data); // Safe!
 *     });
 *   }, []);
 * 
 * WHY: React Native will warn/crash if you call setState on an unmounted component.
 * This is especially common with async operations (Supabase calls, BLE callbacks, timers).
 */

import { useRef, useEffect } from 'react';

export function useIsMounted(): React.MutableRefObject<boolean> {
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  return isMounted;
}

export default useIsMounted;
