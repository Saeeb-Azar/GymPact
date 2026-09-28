import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Gedämpftes Salbeigrün – ruhig statt Neon, angenehm auf hellem
        // wie dunklem Grund (Palette rechnerisch auf Kontrast und
        // Farbenblind-Tauglichkeit geprüft).
        brand: {
          50: '#f2f8f4',
          100: '#e0efe6',
          200: '#c3ddcf',
          300: '#9cc5ae',
          400: '#6fab8b',
          500: '#4d9e73',
          600: '#3d8460',
          700: '#326b50',
          800: '#2a5541',
          900: '#234536',
          950: '#122a20',
        },
        // Warme Grautöne statt kühlem Blau-Schwarz – weniger hart für die Augen.
        surface: {
          50: '#f7f6f4',
          100: '#efeeea',
          200: '#e2e0da',
          300: '#c9c6bf',
          700: '#34322e',
          800: '#242320',
          850: '#1c1b18',
          900: '#151412',
          950: '#0e0d0b',
        },
        // Makro-Farben – überall gleich verwendet, gedeckt statt knallig.
        protein: '#7a7fd1',
        carbs: '#a3762a',
        fat: '#c9557e',
        kcal: '#4d9e73',
        water: '#3d92d4',
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
        card: '0 1px 2px rgba(20, 18, 12, 0.04), 0 8px 24px rgba(20, 18, 12, 0.06)',
        // Früher Neon-Glow – jetzt eine ruhige, weiche Erhebung.
        glow: '0 1px 2px rgba(20, 18, 12, 0.08), 0 6px 20px rgba(20, 18, 12, 0.12)',
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
