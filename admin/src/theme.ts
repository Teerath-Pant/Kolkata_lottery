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
  // per-package themes (green = small, red = middle, blue = top, as in the mockup screens 5-7)
  packages: {
    green: { from: '#25a95c', to: '#0a5a2b', soft: '#e7f7ee', text: '#0a5a2b' },
    red: { from: '#e6291f', to: '#8a0c0c', soft: '#fdeaea', text: '#8a0c0c' },
    blue: { from: '#2f64e8', to: '#0a2a84', soft: '#e8efff', text: '#0a2a84' },
  },
} as const;

export type PackageTheme = keyof typeof theme.packages;

export const themeGradient = (t: PackageTheme) => ({
  background: `linear-gradient(160deg, ${theme.packages[t].from} 0%, ${theme.packages[t].to} 100%)`,
});

export const headerGradient = { background: `linear-gradient(180deg, ${theme.colors.brand.DEFAULT}, ${theme.colors.brand.dark})` };
