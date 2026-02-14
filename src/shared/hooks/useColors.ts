/**
 * useColors - Theme-aware colors hook
 * 
 * Provides access to the global color system based on current theme (light/dark).
 * Use this instead of defining inline color objects in screens.
 * 
 * @example
 * const colors = useColors();
 * <View style={{ backgroundColor: colors.background }} />
 */

import { useTheme, Theme } from '../../contexts';
import { LightTheme, DarkTheme, Gradients, Shadows, Primary, Accent, Success, Danger, Warning, Info, Neutral } from '../../constants/Theme';

// Extended color type with all theme properties
export type ThemeColors = Theme & {
  // Gradients
  gradients: typeof Gradients;
  // Shadows
  shadows: typeof Shadows;
  // Palette access
  palette: {
    primary: typeof Primary;
    accent: typeof Accent;
    success: typeof Success;
    danger: typeof Danger;
    warning: typeof Warning;
    info: typeof Info;
    neutral: typeof Neutral;
  };
  // Common semantic colors
  inputBg: string;
  cardBorder: string;
  indicator: string;
  textMuted: string;
};

/**
 * Hook that returns theme-aware colors
 * Automatically switches between light and dark theme colors
 */
export const useColors = (): ThemeColors => {
  const { isDark } = useTheme();
  
  const baseColors = isDark ? DarkTheme : LightTheme;
  
  return {
    ...baseColors,
    // Gradients
    gradients: Gradients,
    // Shadows
    shadows: Shadows,
    // Palette access
    palette: {
      primary: Primary,
      accent: Accent,
      success: Success,
      danger: Danger,
      warning: Warning,
      info: Info,
      neutral: Neutral,
    },
    // Common semantic colors (convenience aliases)
    inputBg: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
    cardBorder: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
    indicator: Accent.main,
    textMuted: isDark ? 'rgba(255,255,255,0.4)' : '#94A3B8',
  };
};

/**
 * Hook for getting gradient colors
 * Useful for LinearGradient components
 */
export const useGradients = () => {
  const { isDark } = useTheme();
  
  return {
    header: isDark ? Gradients.headerDark : Gradients.header,
    dock: Gradients.dock,
    radar: Gradients.radar,
    success: Gradients.success,
    premium: Gradients.premiumDark,
    glass: isDark ? Gradients.glassDark : Gradients.glassLight,
    accent: Gradients.accentShimmer,
  };
};

/**
 * Hook for attendance status colors
 */
export const useStatusColors = () => {
  const { isDark } = useTheme();
  const theme = isDark ? DarkTheme : LightTheme;
  
  return {
    present: theme.present,
    absent: theme.absent,
    pending: theme.pending,
    od: theme.od,
    leave: theme.leave,
  };
};

export default useColors;
