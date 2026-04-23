/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  theme: {
    extend: {
      colors: {
        violet: {
          50: '#f5f0ff',
          100: '#efe5ff',
          200: '#dcc6ff',
          300: '#c19dff',
          400: '#a36eff',
          500: '#8225E6',
          600: '#6f19cc',
          700: '#560ca3',
          800: '#3e067a',
          900: '#2b0359',
          950: '#1b003d',
        }
      }
    },
  },
  plugins: [],
};
