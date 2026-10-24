// Design tokens extracted from the reference mockup. Single source of truth for Tailwind and inline gradients.
export const theme = {
  colors: {
    brand: { DEFAULT: '#1e56c8', dark: '#0b1f55', light: '#eaf1ff' },
    gold: { DEFAULT: '#f7c948', dark: '#c98a0b', light: '#fff4cc' },
    page: '#f2f5fb',
    ink: '#14213d',
    muted: '#6b7a99',
    line: '#e3e9f5',
    good: '#16a34a',
    bad: '#dc2626',
  },
  radii: { card: '18px', btn: '14px', pill: '999px' },
  shadows: {
    card: '0 6px 18px rgba(15, 35, 90, 0.14)',
    glow: '0 0 0 3px rgba(247, 201, 72, 0.45)',
    bar: '0 -4px 16px rgba(15, 35, 90, 0.12)',
  },
  font: "'Poppins', system-ui, sans-serif",
  fontScript: "'Dancing Script', cursive",
  // per-package themes (green = small, red = middle, blue = top, as in the mockup screens 5-7)
  packages: {
    green: { from: '#25a95c', to: '#0a5a2b', soft: '#e7f7ee', text: '#0a5a2b' },
    red: { from: '#e6291f', to: '#8a0c0c', soft: '#fdeaea', text: '#8a0c0c' },
    blue: { from: '#2f64e8', to: '#0a2a84', soft: '#e8efff', text: '#0a2a84' },
    purple: { from: '#8e3ee0', to: '#4a1587', soft: '#f1e8fd', text: '#4a1587' },
    pink: { from: '#ec3f9a', to: '#a3125f', soft: '#fde8f3', text: '#a3125f' },
    orange: { from: '#f7811e', to: '#a4410a', soft: '#fff0e3', text: '#a4410a' },
    yellow: { from: '#f2c418', to: '#a67c00', soft: '#fff8d9', text: '#7a5b00' },
    teal: { from: '#14b8a6', to: '#0b5f57', soft: '#e3f8f5', text: '#0b5f57' },
    cyan: { from: '#22b8e0', to: '#0b5e80', soft: '#e3f6fc', text: '#0b5e80' },
    indigo: { from: '#5b5ef0', to: '#2a2a8f', soft: '#ebebfe', text: '#2a2a8f' },
    maroon: { from: '#a8243f', to: '#55091c', soft: '#f9e6ea', text: '#55091c' },
    brown: { from: '#a0673a', to: '#5a3416', soft: '#f6ece3', text: '#5a3416' },
    black: { from: '#3d4454', to: '#0d1017', soft: '#eceef2', text: '#1b1f29' },
  },
} as const;

export type PackageTheme = keyof typeof theme.packages;

export const DRAW_PACKAGE_COLORS: Record<string, readonly [string, string, string, string]> = {
  '1 करोड़': ['#ef4444', '#7f1d1d', '#dc2626', '#7f1d1d'],
  '2 करोड़': ['#3b82f6', '#1e3a8a', '#2563eb', '#1e3a8a'],
  '5 लाख': ['#22c55e', '#14532d', '#16a34a', '#14532d'],
  '10 लाख': ['#a855f7', '#4c1d95', '#7c3aed', '#4c1d95'],
  '20 लाख': ['#ec4899', '#831843', '#db2777', '#831843'],
};

export const themeGradient = (t: PackageTheme) => ({
  background: `linear-gradient(160deg, ${theme.packages[t].from} 0%, ${theme.packages[t].to} 100%)`,
});

export const headerGradient = { background: `linear-gradient(180deg, ${theme.colors.brand.DEFAULT}, ${theme.colors.brand.dark})` };
