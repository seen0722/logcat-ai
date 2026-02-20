/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#0f1117',
          card: '#161822',
          hover: '#1c1f2e',
        },
        border: {
          DEFAULT: '#2a2d3e',
          focus: '#4f46e5',
        },
        severity: {
          critical: '#ef4444',
          warning: '#f59e0b',
          info: '#22c55e',
        },
      },
    },
  },
  plugins: [],
};
