/**
 * Student Utilities
 * Helpers for parsing and identifying student details from their metadata/roll numbers
 */

/**
 * Identifies if a student is a Lateral Entry (LE) student based on their roll number.
 * 
 * Logic handles both explicit 'LE' prefixes and standard JNTUH/University format 
 * where the 5th character (0-indexed 4) is '5' (e.g., 228X5A0501).
 */
export const isLateralEntry = (rollNo: string | undefined | null, isLE?: boolean): boolean => {
  if (isLE !== undefined) return isLE;
  if (!rollNo) return false;
  
  const upper = rollNo.toUpperCase();
  
  // Explicit LE check
  if (upper.startsWith('LE')) return true;
  
  // JNTUH Format Check (typically 10 string length, 5th char indicates type: 1=Regular, 5=Lateral Entry)
  if (upper.length === 10 && upper[4] === '5') {
    return true;
  }
  
  return false;
};

/**
 * Standardizes formatting for roll numbers, specifically transforming LE roll numbers to LE-XX visually.
 */
export const formatShortRollNo = (rollNo: string | undefined | null, isLE?: boolean): string => {
  if (!rollNo) return '??';
  
  const upper = rollNo.toUpperCase();
  const lastTwo = upper.slice(-2);
  
  if (isLateralEntry(upper, isLE)) {
    return `LE-${lastTwo}`;
  }
  
  return lastTwo;
};
