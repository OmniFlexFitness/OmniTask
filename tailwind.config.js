/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{html,ts}'],
  theme: {
    extend: {
      colors: {
        'omni-night': '#05070f',
        'omni-ink': '#0c1220',
        'omni-glow': '#22d3ee',
        'omni-fuchsia': '#a855f7',
        'omni-rose': '#ec4899'
      },
      backgroundImage: {
        'omni-grid': 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.06) 1px, transparent 0)',
        'omni-gradient': 'linear-gradient(135deg, rgba(20,24,45,0.9), rgba(9,12,24,0.95))'
      },
      boxShadow: {
        neon: '0 10px 40px rgba(34, 211, 238, 0.15), 0 10px 40px rgba(168, 85, 247, 0.15)'
      }
    },
  },
  plugins: [],
};
