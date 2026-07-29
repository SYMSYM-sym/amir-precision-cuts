import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        'bg-2': 'var(--bg-2)',
        'bg-3': 'var(--bg-3)',
        surface: 'var(--surface)',
        line: 'var(--line)',
        'line-strong': 'var(--line-strong)',
        ink: 'var(--ink)',
        'ink-dim': 'var(--ink-dim)',
        'ink-mute': 'var(--ink-mute)',
        accent: 'var(--accent)',
        'accent-soft': 'var(--accent-soft)',
        'accent-deep': 'var(--accent-deep)',
        danger: 'var(--danger)',
        warn: 'var(--warn)',
        ok: 'var(--ok)',
      },
      fontFamily: {
        serif: ['var(--f-serif)', 'Georgia', 'serif'],
        sans: ['var(--f-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--f-mono)', 'monospace'],
      },
      borderRadius: {
        brand: 'var(--radius)',
        'brand-sm': 'var(--radius-sm)',
      },
      transitionTimingFunction: {
        brand: 'var(--ease)',
      },
    },
  },
  plugins: [],
};

export default config;
