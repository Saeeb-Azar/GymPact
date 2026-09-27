import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Neon-Mint als Markenfarbe – leuchtet auf dunklem Grund.
        brand: {
          50: '#ecfff6',
          100: '#d1ffe9',
          200: '#a6fcd5',
          300: '#6cf2bb',
          400: '#2ee39d',
          500: '#0fcb84',
          600: '#05a56b',
          700: '#07835a',
          800: '#0b674a',
          900: '#0b553f',
          950: '#013023',
        },
        surface: {
          50: '#f4f5f8',
          100: '#eceef3',
          200: '#dfe2ea',
          300: '#c5cad6',
          700: '#2a2d37',
          800: '#1f2129',
          850: '#16181f',
          900: '#111318',
          950: '#0a0b0f',
        },
        // Makro-Farben – überall gleich verwendet.
        protein: '#8b5cf6',
        carbs: '#d97706',
        fat: '#ec4899',
        kcal: '#0fcb84',
        water: '#38bdf8',
      },
      fontFamily: {
        sans: [
          'Inter',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        display: ['"Space Grotesk"', 'Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '1.5rem',
      },
      boxShadow: {
        card: '0 1px 2px rgba(10, 12, 20, 0.04), 0 8px 24px rgba(10, 12, 20, 0.06)',
        glow: '0 0 0 1px rgba(15, 203, 132, 0.25), 0 8px 32px rgba(15, 203, 132, 0.35)',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        shimmer: {
          from: { backgroundPosition: '200% 0' },
          to: { backgroundPosition: '-200% 0' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.35s ease-out both',
        'scale-in': 'scale-in 0.25s ease-out both',
        float: 'float 5s ease-in-out infinite',
        shimmer: 'shimmer 2.2s linear infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
