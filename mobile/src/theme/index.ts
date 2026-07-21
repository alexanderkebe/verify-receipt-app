// Palette mirrored from the web app's globals.css so the two clients look
// like one product.
import { useColorScheme } from 'react-native';

const dark = {
  bg: '#0B0F19',
  bgSecondary: '#141A28',
  bgTertiary: '#1E293B',
  border: '#2A3548',
  text: '#F1F5F9',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  accent: '#F5A623',
  accentText: '#0B0F19',
  green: '#22C55E',
  yellow: '#F5A623',
  red: '#EF4444',
  blue: '#3B82F6',
};

const light = {
  bg: '#F8FAFC',
  bgSecondary: '#FFFFFF',
  bgTertiary: '#F1F5F9',
  border: '#E2E8F0',
  text: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#64748B',
  accent: '#D98700',
  accentText: '#FFFFFF',
  green: '#16A34A',
  yellow: '#D98700',
  red: '#DC2626',
  blue: '#2563EB',
};

export type Colors = typeof dark;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 6, md: 10, lg: 14, pill: 9999 };

export function useTheme(): { colors: Colors; isDark: boolean } {
  const scheme = useColorScheme();
  const isDark = scheme !== 'light';
  return { colors: isDark ? dark : light, isDark };
}

/** Result-level colors, matching the web's GREEN / YELLOW / RED badges. */
export function resultColor(colors: Colors, level: 'GREEN' | 'YELLOW' | 'RED'): string {
  if (level === 'GREEN') return colors.green;
  if (level === 'RED') return colors.red;
  return colors.yellow;
}
