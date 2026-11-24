/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      keyframes: {
        'scroll-cue': {
          '0%, 100%': { transform: 'translateY(0)' },
          '45%': { transform: 'translateY(4px)' },
        },
      },
      animation: {
        'scroll-cue': 'scroll-cue 650ms ease-out 2',
      },
      colors: {
        brand: {
          50: '#E7F6EA',
          100: '#CDEBD3',
          200: '#A6DBB0',
          300: '#7CCB8B',
          400: '#5CBE70',
          500: '#46B35A', // --rd-green
          600: '#2F8A42', // --rd-green-d
          700: '#276F37',
          800: '#1F562C',
          900: '#183F21',
        },
        pink: {
          soft: '#FFE1E9', // --rd-pink-l
          DEFAULT: '#FF7A9C', // --rd-pink
          deep: '#D6416A', // --rd-pink-d
        },
        slate: {
          850: '#151E2E',
          925: '#0B111E',
          950: '#070B14'
        }
      },
      fontFamily: {
        sans: ['Nunito', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        '2xs': '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
        'xs': '0 1px 2px 0 rgba(0, 0, 0, 0.04)',
        'soft': '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px 0 rgba(0, 0, 0, 0.03)',
        'card': '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
        'card-hover': '0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -2px rgba(0, 0, 0, 0.03)',
      }
    },
  },
  plugins: [],
}
