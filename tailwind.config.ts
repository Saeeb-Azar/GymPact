import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Ruhige, hochwertige Palette: warmes Neutral + gedecktes Grün als Akzent.
        brand: {
          50: '#f0faf5',
          100: '#dcf3e7',
          200: '#bce6d2',
          300: '#8dd2b5',
          400: '#59b793',
          500: '#369c78',
          600: '#267d60',
          700: '#1f644e',
          800: '#1c5040',
          900: '#184236',
          950: '#0c251e',
        },
        surface: {
          50: '#fafaf8',
          100: '#f4f4f0',
          200: '#e7e7e0',
          800: '#23262b',
          850: '#1d2025',
          900: '#17191d',
          950: '#101215',
        },
      },
      fontFamily: {
        sans: [
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      borderRadius: {
        card: '1.25rem',
      },
      boxShadow: {
        card: '0 1px 3px rgba(16, 24, 20, 0.06), 0 4px 16px rgba(16, 24, 20, 0.05)',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.97)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.25s ease-out both',
        'scale-in': 'scale-in 0.2s ease-out both',
      },
    },
  },
  plugins: [],
} satisfies Config;
