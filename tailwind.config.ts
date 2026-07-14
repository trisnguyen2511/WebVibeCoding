import type { Config } from 'tailwindcss'
const config: Config = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Theme-aware — values come from CSS variables set in globals.css,
        // flipped between :root (dark, default) and [data-theme="light"].
        background: 'rgb(var(--color-bg) / <alpha-value>)',
        surface:    'rgb(var(--color-surface) / <alpha-value>)',
        border:     'rgb(var(--color-border) / <alpha-value>)',
        muted:      'rgb(var(--color-muted) / <alpha-value>)',
        // Solid foreground text (replaces literal text-white) and the
        // translucent highlight/border overlay (replaces bg-white/[x],
        // border-white/[x]) — both flip white<->near-black with the theme.
        fg:      'rgb(var(--color-fg) / <alpha-value>)',
        overlay: 'rgb(var(--color-overlay) / <alpha-value>)',
        accent: {
          DEFAULT: '#7C3AED',
          soft:    '#A78BFA',
        },
      },
      fontFamily: {
        display: ['var(--font-space-grotesk)', 'sans-serif'],
        sans:    ['var(--font-inter)', 'sans-serif'],
        mono:    ['var(--font-jetbrains-mono)', 'monospace'],
      },
      keyframes: {
        'msg-in': {
          '0%': { opacity: '0', transform: 'translateY(6px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'pop-in': {
          '0%': { opacity: '0', transform: 'scale(0.5)' },
          '60%': { opacity: '1', transform: 'scale(1.15)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'panel-in': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'gesture-burst': {
          '0%': { opacity: '0', transform: 'scale(0.3) rotate(-8deg)' },
          '40%': { opacity: '1', transform: 'scale(1.2) rotate(4deg)' },
          '100%': { opacity: '1', transform: 'scale(1) rotate(0deg)' },
        },
        'typing-dot': {
          '0%, 60%, 100%': { transform: 'translateY(0)', opacity: '0.4' },
          '30%': { transform: 'translateY(-3px)', opacity: '1' },
        },
      },
      animation: {
        'msg-in': 'msg-in 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
        'pop-in': 'pop-in 0.28s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'panel-in': 'panel-in 0.16s ease-out',
        'gesture-burst': 'gesture-burst 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'typing-dot': 'typing-dot 1.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
export default config
