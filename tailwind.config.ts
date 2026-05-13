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
          bg: '#212121',
          'bg-secondary': '#171717',
          'bg-tertiary': '#2f2f2f',
          hover: '#2f2f2f',
          active: '#343541',
          border: '#3e3e3e',
          text: '#ececec',
          'text-secondary': '#b4b4b4',
          'text-muted': '#8e8ea0',
          accent: '#10a37f',
          'accent-hover': '#0d8a6a',
          message: '#303030',
          composer: '#2f2f2f',
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
