/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['DM Serif Display', 'Georgia', 'Times New Roman', 'serif'],
        sans: ['DM Sans', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['SF Mono', 'Fira Code', 'Cascadia Code', 'JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        surface: {
          DEFAULT: '#0c1222',
          card: '#131b2e',
          hover: '#1a2540',
        },
        border: {
          DEFAULT: '#243049',
          focus: '#4f8ff7',
        },
        accent: {
          DEFAULT: '#4f8ff7',
          dark: '#2d6de0',
          light: '#7cb3ff',
        },
        warm: {
          DEFAULT: '#d4a06a',
          light: '#e8c9a0',
          dark: '#b8864e',
        },
        severity: {
          critical: '#ef4444',
          warning: '#f59e0b',
          info: '#22c55e',
        },
      },
      borderRadius: {
        xl: '14px',
      },
      boxShadow: {
        'card': '0 4px 12px rgba(12,18,34,0.3), 0 1px 3px rgba(12,18,34,0.2)',
        'card-hover': '0 12px 28px rgba(12,18,34,0.4), 0 4px 10px rgba(12,18,34,0.2)',
        'elevated': '0 24px 48px rgba(12,18,34,0.5), 0 8px 16px rgba(12,18,34,0.3)',
        'glow': '0 0 24px rgba(79,143,247,0.15)',
        'warm-glow': '0 0 24px rgba(212,160,106,0.15)',
      },
      animation: {
        'reveal': 'reveal 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'pulse-subtle': 'pulse-subtle 2s ease-in-out infinite',
        'pulse-dot': 'pulse-dot 2.5s ease-in-out infinite',
      },
      keyframes: {
        reveal: {
          '0%': { opacity: '0', transform: 'translateY(24px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-subtle': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        'pulse-dot': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.6', transform: 'scale(1.15)' },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
};
