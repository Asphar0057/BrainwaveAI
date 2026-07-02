import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'dark' | 'light';

export type ThemeDefinition = {
  id: string;
  name: string;
  mode: ThemeMode;
  accent: string;
  accentHover: string;
};

export type StoredCustomTheme = {
  id: 'custom';
  name: 'Custom Theme';
  mode: ThemeMode;
  primary: string;
  accent: string;
  accentHover?: string;
};

export type MobileTheme = ThemeDefinition & {
  family: 'Dark' | 'Light';
  primary: string;
  bgPrimary: string;
  bgSecondary: string;
  bgTop: string;
  bgBottom: string;
  panel: string;
  panelAlt: string;
  panelMuted: string;
  textPrimary: string;
  textSecondary: string;
  border: string;
  borderStrong: string;
  glow: string;
  success: string;
  warning: string;
  danger: string;
  isLight: boolean;
};

export const THEMES: Record<string, ThemeDefinition> = {
  'gold-dark': { id: 'gold-dark', name: 'Gold Monochrome', mode: 'dark', accent: '#D7B38C', accentHover: '#E5C9A8' },
  'blue-dark': { id: 'blue-dark', name: 'Ocean Blue', mode: 'dark', accent: '#3B82F6', accentHover: '#60A5FA' },
  'green-dark': { id: 'green-dark', name: 'Emerald', mode: 'dark', accent: '#10B981', accentHover: '#34D399' },
  'purple-dark': { id: 'purple-dark', name: 'Royal Purple', mode: 'dark', accent: '#8B5CF6', accentHover: '#A78BFA' },
  'rose-dark': { id: 'rose-dark', name: 'Midnight Rose', mode: 'dark', accent: '#EC4899', accentHover: '#F472B6' },
  'crimson-dark': { id: 'crimson-dark', name: 'Crimson', mode: 'dark', accent: '#DC143C', accentHover: '#EF4444' },
  'gold-light': { id: 'gold-light', name: 'Golden Hour', mode: 'light', accent: '#B8860B', accentHover: '#D4A017' },
  'blue-light': { id: 'blue-light', name: 'Azure Sky', mode: 'light', accent: '#2563EB', accentHover: '#3B82F6' },
  'green-light': { id: 'green-light', name: 'Spring Meadow', mode: 'light', accent: '#059669', accentHover: '#10B981' },
  'purple-light': { id: 'purple-light', name: 'Cotton Candy', mode: 'light', accent: '#7C3AED', accentHover: '#8B5CF6' },
  'rose-light': { id: 'rose-light', name: 'Cherry Blossom', mode: 'light', accent: '#DB2777', accentHover: '#EC4899' },
  'teal-light': { id: 'teal-light', name: 'Teal Breeze', mode: 'light', accent: '#0D9488', accentHover: '#14B8A6' },
};

export const THEME_PROFILES = Object.values(THEMES);

export const COLOR_PALETTE = [
  { name: 'Gold', value: '#D7B38C' },
  { name: 'Blue', value: '#3B82F6' },
  { name: 'Green', value: '#10B981' },
  { name: 'Purple', value: '#8B5CF6' },
  { name: 'Rose', value: '#EC4899' },
  { name: 'Crimson', value: '#DC143C' },
  { name: 'Orange', value: '#F97316' },
  { name: 'Teal', value: '#14B8A6' },
  { name: 'Indigo', value: '#6366F1' },
  { name: 'Amber', value: '#F59E0B' },
  { name: 'Cyan', value: '#06B6D4' },
  { name: 'Lime', value: '#84CC16' },
];

export const PRIMARY_PALETTE: Record<ThemeMode, { name: string; value: string }[]> = {
  dark: [
    { name: 'Midnight', value: '#0a0a0b' },
    { name: 'Charcoal', value: '#1a1a2e' },
    { name: 'Navy', value: '#0f1729' },
    { name: 'Forest', value: '#0d1912' },
    { name: 'Wine', value: '#1a0f14' },
    { name: 'Slate', value: '#1e293b' },
  ],
  light: [
    { name: 'Snow', value: '#fefefe' },
    { name: 'Cream', value: '#faf8f5' },
    { name: 'Ice', value: '#f0f9ff' },
    { name: 'Mint', value: '#f0fdf4' },
    { name: 'Blush', value: '#fdf2f8' },
    { name: 'Pearl', value: '#f8fafc' },
  ],
};

const STORAGE_THEME_KEY = 'mobile.themeProfile';
const STORAGE_CUSTOM_THEME_KEY = 'mobile.customTheme';
const DEFAULT_THEME_ID = 'gold-dark';

export function hexToRgb(hex: string) {
  const normalized = hex.replace('#', '');
  const bigint = parseInt(normalized.length === 3 ? normalized.split('').map((c) => c + c).join('') : normalized, 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255,
  };
}

export function rgbaFromHex(hex: string, alpha: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function lightenColor(hex: string, percent: number) {
  const { r, g, b } = hexToRgb(hex);
  const amount = Math.round(2.55 * percent);
  const nr = Math.min(255, r + amount);
  const ng = Math.min(255, g + amount);
  const nb = Math.min(255, b + amount);
  return `#${((1 << 24) + (nr << 16) + (ng << 8) + nb).toString(16).slice(1)}`;
}

export function darkenColor(hex: string, percent: number) {
  const { r, g, b } = hexToRgb(hex);
  const amount = Math.round(2.55 * percent);
  const nr = Math.max(0, r - amount);
  const ng = Math.max(0, g - amount);
  const nb = Math.max(0, b - amount);
  return `#${((1 << 24) + (nr << 16) + (ng << 8) + nb).toString(16).slice(1)}`;
}

function getRelativeLuminance(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const [rs, gs, bs] = [r, g, b].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

export function buildTheme(definition: ThemeDefinition & { primary?: string }): MobileTheme {
  const isLight = definition.mode === 'light';
  const primary = definition.primary || (isLight ? '#fefefe' : '#0a0a0b');
  const bgPrimary = primary;
  const bgSecondary = isLight ? darkenColor(primary, 2) : '#11100f';
  const panel = isLight ? '#ffffff' : '#121110';
  const panelAlt = isLight ? darkenColor(primary, 1) : '#171513';
  const panelMuted = isLight ? darkenColor(primary, 3) : '#211f1d';
  const textPrimary = isLight ? '#1a1a1a' : '#EAECEF';
  const textSecondary = isLight ? '#666666' : '#9CA3AF';
  const border = isLight ? rgbaFromHex(darkenColor(primary, 20), 0.18) : rgbaFromHex(definition.accent, 0.14);
  const borderStrong = isLight ? rgbaFromHex(darkenColor(primary, 28), 0.28) : rgbaFromHex(definition.accent, 0.24);

  return {
    ...definition,
    primary,
    family: isLight ? 'Light' : 'Dark',
    bgPrimary,
    bgSecondary,
    bgTop: primary,
    bgBottom: isLight ? darkenColor(primary, 4) : '#0f0e0d',
    panel,
    panelAlt,
    panelMuted,
    textPrimary,
    textSecondary,
    border,
    borderStrong,
    glow: rgbaFromHex(definition.accent, 0.35),
    success: isLight ? '#16A34A' : '#10B981',
    warning: isLight ? '#D97706' : '#F59E0B',
    danger: isLight ? '#DC2626' : '#EF4444',
    isLight,
  };
}

export function buildCustomTheme(customTheme: StoredCustomTheme): MobileTheme {
  const accent = customTheme.accent || '#D7B38C';
  const accentHover = customTheme.accentHover || lightenColor(accent, 15);
  const luminance = getRelativeLuminance(customTheme.primary || (customTheme.mode === 'light' ? '#fefefe' : '#0b0b0c'));
  const mode: ThemeMode = luminance > 0.5 ? 'light' : 'dark';

  return buildTheme({
    id: 'custom',
    name: 'Custom Theme',
    mode,
    accent,
    accentHover,
    primary: customTheme.primary,
  });
}

export async function getStoredThemeId() {
  return (await AsyncStorage.getItem(STORAGE_THEME_KEY)) || DEFAULT_THEME_ID;
}

export async function setStoredThemeId(themeId: string) {
  await AsyncStorage.setItem(STORAGE_THEME_KEY, themeId);
}

export async function getStoredCustomTheme() {
  const raw = await AsyncStorage.getItem(STORAGE_CUSTOM_THEME_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredCustomTheme;
  } catch {
    return null;
  }
}

export async function setStoredCustomTheme(primary: string, accent: string, mode: ThemeMode) {
  const customTheme: StoredCustomTheme = {
    id: 'custom',
    name: 'Custom Theme',
    mode,
    primary,
    accent,
    accentHover: lightenColor(accent, 15),
  };
  await AsyncStorage.setItem(STORAGE_CUSTOM_THEME_KEY, JSON.stringify(customTheme));
  return buildCustomTheme(customTheme);
}

export function getThemeById(themeId: string) {
  return buildTheme(THEMES[themeId] || THEMES[DEFAULT_THEME_ID]);
}

export function getDefaultTheme() {
  return getThemeById(DEFAULT_THEME_ID);
}
