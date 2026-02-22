/**
 * useAutoPilot - Background scanning mode until class ends
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';

interface UseAutoPilotOptions {
  endTime: string; // Format: "HH:MM"
  onClassEnd: () => void;
}

interface UseAutoPilotReturn {
  isAutoPilot: boolean;
  enableAutoPilot: () => void;
  disableAutoPilot: () => void;
  toggleAutoPilot: () => void;
  minutesRemaining: number;
  formattedEndTime: string;
}

export const useAutoPilot = (options: UseAutoPilotOptions): UseAutoPilotReturn => {
  const { endTime, onClassEnd } = options;
  
  const [isAutoPilot, setIsAutoPilot] = useState(false);
  const [minutesRemaining, setMinutesRemaining] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Parse end time
  const getEndTimeDate = useCallback(() => {
    const [hours, minutes] = endTime.split(':').map(Number);
    const now = new Date();
    const endDate = new Date(now);
    endDate.setHours(hours, minutes, 0, 0);
    return endDate;
  }, [endTime]);

  // Calculate remaining minutes
  const calculateMinutesRemaining = useCallback(() => {
    const now = new Date();
    const end = getEndTimeDate();
    const diff = end.getTime() - now.getTime();
    return Math.max(0, Math.floor(diff / 60000));
  }, [getEndTimeDate]);

  // Format end time for display
  const formattedEndTime = endTime;

  // Update remaining time
  useEffect(() => {
    if (!isAutoPilot) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Initial calculation
    setMinutesRemaining(calculateMinutesRemaining());

    // Update every minute
    intervalRef.current = setInterval(() => {
      const remaining = calculateMinutesRemaining();
      setMinutesRemaining(remaining);

      if (remaining <= 0) {
        onClassEnd();
        setIsAutoPilot(false);
      }
    }, 60000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isAutoPilot, calculateMinutesRemaining, onClassEnd]);

  // Handle app state changes (keep wake lock concept)
  useEffect(() => {
    if (!isAutoPilot) return;

    const handleAppStateChange = (nextState: AppStateStatus) => {
      // In real implementation, would use expo-keep-awake here
      console.log('App state changed:', nextState);
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [isAutoPilot]);

  const enableAutoPilot = useCallback(() => {
    setIsAutoPilot(true);
    setMinutesRemaining(calculateMinutesRemaining());
  }, [calculateMinutesRemaining]);

  const disableAutoPilot = useCallback(() => {
    setIsAutoPilot(false);
  }, []);

  const toggleAutoPilot = useCallback(() => {
    setIsAutoPilot(prev => {
      if (!prev) {
        setMinutesRemaining(calculateMinutesRemaining());
      }
      return !prev;
    });
  }, [calculateMinutesRemaining]);

  return {
    isAutoPilot,
    enableAutoPilot,
    disableAutoPilot,
    toggleAutoPilot,
    minutesRemaining,
    formattedEndTime,
  };
};

export default useAutoPilot;
