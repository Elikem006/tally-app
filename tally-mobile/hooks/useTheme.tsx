import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { safeStorage } from '../services/storage';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ThemeType = 'light' | 'dark';

export interface ThemeColors {
  background: string;
  cardBg: string;
  text: string;
  textSecondary: string;
  border: string;
  primary: string;
  accent: string;
  inputBg: string;
  shadowColor: string;
  positive: string;
  negative: string;
  neutralBg: string;
}

export const themes: Record<ThemeType, ThemeColors> = {
  light: {
    background: '#F2F4F7',
    cardBg: '#ffffff',
    text: '#111111',
    textSecondary: '#4A5568',
    border: '#EAEBEF',
    primary: '#8B5CF6',
    accent: '#F59E0B',
    inputBg: '#F9FAFB',
    shadowColor: '#000000',
    positive: '#10B981',
    negative: '#EF4444',
    neutralBg: '#F3F4F6',
  },
  dark: {
    background: '#0F1115',
    cardBg: '#181A22',
    text: '#F3F4F6',
    textSecondary: '#9CA3AF',
    border: '#2E3039',
    primary: '#A78BFA',
    accent: '#FBBF24',
    inputBg: '#111317',
    shadowColor: '#000000',
    positive: '#34D399',
    negative: '#F87171',
    neutralBg: '#1F2937',
  },
};

interface ThemeContextType {
  themeMode: ThemeMode;
  theme: ThemeType;
  colors: ThemeColors;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const systemScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');
  const [theme, setTheme] = useState<ThemeType>('light');

  useEffect(() => {
    async function loadTheme() {
      try {
        const saved = await safeStorage.getItem('app_theme');
        if (saved === 'light' || saved === 'dark' || saved === 'system') {
          setThemeModeState(saved);
        }
      } catch {
        // Fall back to system theme
      }
    }
    loadTheme();
  }, []);

  useEffect(() => {
    if (themeMode === 'system') {
      setTheme(systemScheme === 'dark' ? 'dark' : 'light');
    } else {
      setTheme(themeMode);
    }
  }, [themeMode, systemScheme]);

  const setThemeMode = async (mode: ThemeMode) => {
    setThemeModeState(mode);
    try {
      await safeStorage.setItem('app_theme', mode);
    } catch {
      // Preference just won't persist this time
    }
  };

  const colors = themes[theme];

  return (
    <ThemeContext.Provider value={{ themeMode, theme, colors, setThemeMode }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
