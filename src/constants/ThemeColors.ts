/**
 * Centralized Theme Color Constants
 * 
 * Single source of truth for all colors used across the app.
 * Import from here instead of hardcoding hex values.
 */

export const THEME = {
  // Primary accent — the app's signature green
  accent: '#34C759',
  accentLight: 'rgba(52, 199, 89, 0.1)',
  accentMedium: 'rgba(52, 199, 89, 0.15)',
  accentSubtle: 'rgba(52, 199, 89, 0.05)',
  accentBorder: 'rgba(52, 199, 89, 0.2)',

  // Semantic colors — these convey meaning and should NOT be overridden
  danger: '#EF4444',
  dangerLight: 'rgba(239, 68, 68, 0.1)',
  warning: '#F59E0B',
  warningLight: 'rgba(245, 158, 11, 0.15)',
  success: '#10B981',
  successLight: 'rgba(16, 185, 129, 0.1)',
  info: '#3B82F6',
  infoLight: 'rgba(59, 130, 246, 0.15)',

  // Schedule status colors
  statusLive: '#10B981',
  statusCompleted: '#9CA3AF',
  statusIncomplete: '#F59E0B',
  statusUpcoming: '#34C759',
  statusSwapped: '#F59E0B',
  statusSubstitute: '#A78BFA',

  // Neutrals
  textDark: '#0F172A',
  textLight: '#64748B',
  textMuted: '#94A3B8',
  
  // Dark mode specific
  dark: {
    background: '#000000',
    surface: '#1C1C1E',
    surfaceElevated: '#2C2C2E',
    border: '#38383A',
    textPrimary: '#FFFFFF',
    textSecondary: '#8E8E93',
  },

  // Light mode specific
  light: {
    background: '#F2F2F7',
    surface: '#FFFFFF',
    surfaceElevated: '#F5F5F5',
    border: '#E5E5EA',
    textPrimary: '#000000',
    textSecondary: '#86868B',
  },
} as const;
