/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        glass: {
          bg: 'rgba(10, 15, 29, 0.7)',
          border: 'rgba(255, 255, 255, 0.08)'
        },
        accent: {
          DEFAULT: '#3b82f6',
          hover: '#60a5fa'
        },
        danger: {
          DEFAULT: '#ef4444',
          hover: '#f87171'
        },
        surface: '#0a0f1d',
        background: '#030712',
        modal: '#0f172a'
      }
    },
  },
  plugins: [],
}
