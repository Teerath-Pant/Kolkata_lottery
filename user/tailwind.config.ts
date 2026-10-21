import type { Config } from 'tailwindcss';
import { theme } from './src/theme';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: { ...theme.colors },
      borderRadius: theme.radii,
      boxShadow: theme.shadows,
      fontFamily: { sans: [theme.font], script: [theme.fontScript] },
    },
  },
  plugins: [],
} satisfies Config;
