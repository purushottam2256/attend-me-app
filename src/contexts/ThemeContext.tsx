/**
 * ThemeContext - Global theme provider with light/dark mode support
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LightTheme, DarkTheme } from '../constants/Theme';

// Theme type definition - allow compatible string values
export type Theme = { [K in keyof typeof LightTheme]: string };

// Theme context value
interface ThemeContextValue {
  theme: Theme;
  isDark: boolean;
  toggleTheme: () => void;
  setTheme: (mode: 'light' | 'dark' | 'system') => void;
}

// Export themes for convenience
export const lightTheme = LightTheme;
export const darkTheme = DarkTheme;

// Create context
const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

// Provider component
interface ThemeProviderProps {
  children: React.ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const systemColorScheme = useColorScheme();
  const [mode, setMode] = useState<'light' | 'dark' | 'system'>('system');

  // Determine actual dark mode state
  // Check system preference immediately (default)
  const isDark = mode === 'system' 
    ? systemColorScheme === 'dark' 
    : mode === 'dark';

  // Load saved theme on mount
  useEffect(() => {
    const loadTheme = async () => {
      try {
        const saved = await AsyncStorage.getItem('@attend_me/theme');
        if (saved && (saved === 'light' || saved === 'dark' || saved === 'system')) {
          setMode(saved as any);
        }
      } catch (error) {
        console.log('Error loading theme:', error);
      }
    };
    loadTheme();
  }, []);

  // Save theme on change
  useEffect(() => {
    AsyncStorage.setItem('@attend_me/theme', mode);
  }, [mode]);

  // Get the active theme
  const theme = isDark ? DarkTheme : LightTheme;

  // Toggle between light and dark
  const toggleTheme = useCallback(() => {
    setMode(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      // If currently system, we switch to the OPPOSITE of system
      if (prev === 'system') {
         return systemColorScheme === 'dark' ? 'light' : 'dark';
      }
      return next;
    });
  }, [systemColorScheme]);

  // Set specific theme mode
  const setThemeMode = useCallback((newMode: 'light' | 'dark' | 'system') => {
    setMode(newMode);
  }, []);

  return (
    <ThemeContext.Provider 
      value={{ 
        theme, 
        isDark, 
        toggleTheme, 
        setTheme: setThemeMode 
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

// Hook to use theme
export const useTheme = (): ThemeContextValue => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export default ThemeContext;
