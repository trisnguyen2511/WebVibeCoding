import type { Config } from 'tailwindcss'
const config: Config = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#08080E',
        surface:    '#0F0F1A',
        border:     '#1A1A2E',
        accent: {
          DEFAULT: '#7C3AED',
          soft:    '#A78BFA',
        },
        muted: '#52525B',
      },
      fontFamily: {
        display: ['var(--font-space-grotesk)', 'sans-serif'],
        sans:    ['var(--font-inter)', 'sans-serif'],
        mono:    ['var(--font-jetbrains-mono)', 'monospace'],
      },
    },
  },
  plugins: [],
}
export default config
