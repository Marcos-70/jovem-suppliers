import type { Config } from 'tailwindcss'

// Identidade Jovem+ SUPPLIERS: azul-marinho profundo, amarelo/dourado de destaque, azul de acção.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: '#0A1E45', 900: '#061231', 800: '#0F2A5E', 700: '#183A7C', 600: '#2A5099' },
        brand: { DEFAULT: '#1D56C9', 700: '#1749A8', 800: '#123A86', 100: '#DCE8FF', 50: '#EEF4FF' },
        gold: { DEFAULT: '#FFC107', 600: '#E5A800', 700: '#9A6F00', 100: '#FFF1BF', 50: '#FFF9E3' },
        surface: '#F4F7FC',
        ink: { DEFAULT: '#1F2A44', soft: '#475775', mute: '#5B6A86' },
        line: { DEFAULT: '#DDE5F0', strong: '#C2CEE0' },
        ok: { DEFAULT: '#15803D', bg: '#DCFCE7' },
        warn: { DEFAULT: '#B45309', bg: '#FEF3C7' },
        danger: { DEFAULT: '#B91C1C', bg: '#FEE2E2' },
        info: { DEFAULT: '#1D4ED8', bg: '#DBEAFE' },
      },
      fontFamily: {
        display: ['Poppins', 'system-ui', 'sans-serif'],
        sans: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: { card: '12px' },
      boxShadow: { pop: '0 14px 34px -12px rgba(10,30,69,.38)', card: '0 1px 2px rgba(10,30,69,.05), 0 6px 18px -10px rgba(10,30,69,.18)' },
    },
  },
  plugins: [],
} satisfies Config
