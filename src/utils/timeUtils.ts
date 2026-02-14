
/**
 * Utility functions for time and slot management
 */

export const SLOT_TIMINGS: Record<string, string> = {
  '1': '09:30 AM - 10:20 AM',
  '2': '10:20 AM - 11:10 AM',
  '3': '11:10 AM - 12:00 PM',
  '4': '12:00 PM - 12:50 PM', // Lunch? Usually break
  '5': '12:50 PM - 01:40 PM',
  '6': '01:40 PM - 02:30 PM',
  '7': '02:30 PM - 03:20 PM',
  '8': '03:20 PM - 04:10 PM',
};

export const getSlotLabel = (slotId: string | undefined | null): string => {
  if (!slotId) return 'Unknown Slot';
  
  // Handle "mon_1" -> "1"
  const cleanId = slotId.toString().includes('_') ? slotId.toString().split('_')[1] : slotId.toString();
  
  const time = SLOT_TIMINGS[cleanId];
  if (time) {
    return `Period ${cleanId} (${time})`;
  }
  
  return `Period ${cleanId}`;
};

export const formatTime = (date: Date): string => {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};
