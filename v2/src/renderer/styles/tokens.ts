/**
 * Design tokens — single source of truth for visual constants.
 * Mirror the same values declared as CSS variables in styles.css so they
 * can be used both inline and from stylesheets.
 */

export const c = {
  // Neutrals — Slate scale
  bg: '#f8fafc',
  surface: '#ffffff',
  surfaceMuted: '#f1f5f9',
  border: '#e2e8f0',
  borderStrong: '#cbd5e1',
  text: '#0f172a',
  textMuted: '#475569',
  textSubtle: '#94a3b8',

  // Primary — Indigo
  primary: '#4f46e5',
  primaryHover: '#4338ca',
  primaryLight: '#eef2ff',
  primaryBorder: '#c7d2fe',

  // Semantic
  danger: '#dc2626',
  dangerHover: '#b91c1c',
  dangerLight: '#fef2f2',
  dangerBorder: '#fecaca',

  success: '#16a34a',
  successLight: '#f0fdf4',
  successBorder: '#bbf7d0',

  warning: '#d97706',
  warningLight: '#fffbeb',
  warningBorder: '#fde68a'
} as const;

export const s = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48
} as const;

export const r = {
  sm: 4,
  md: 6,
  lg: 8,
  xl: 12,
  full: 9999
} as const;

export const sh = {
  sm: '0 1px 2px rgba(15, 23, 42, 0.04)',
  md: '0 1px 3px rgba(15, 23, 42, 0.06), 0 1px 2px rgba(15, 23, 42, 0.04)',
  lg: '0 4px 6px -1px rgba(15, 23, 42, 0.07), 0 2px 4px -2px rgba(15, 23, 42, 0.04)',
  xl: '0 10px 15px -3px rgba(15, 23, 42, 0.08), 0 4px 6px -4px rgba(15, 23, 42, 0.04)'
} as const;

export const font = {
  sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, "Helvetica Neue", Arial, sans-serif',
  mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace',
  size: { xs: 11, sm: 12, md: 13, lg: 14, xl: 16, xxl: 20, xxxl: 28 }
} as const;
