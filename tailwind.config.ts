import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        vault: {
          bg: '#0a0a0a',
          'bg-secondary': '#141414',
          'bg-tertiary': '#1a1a1a',
          hover: '#222222',
          active: '#2a2a2a',
          border: '#2a2a2a',
          'border-subtle': '#1f1f1f',
          text: '#e5e5e5',
          'text-secondary': '#999999',
          'text-muted': '#666666',
          accent: '#7c6ef0',
          'accent-hover': '#6b5de0',
        },
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-dot': {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '1' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.3s ease-out',
        'pulse-dot': 'pulse-dot 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
export default config
