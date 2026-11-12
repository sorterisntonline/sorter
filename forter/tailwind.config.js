/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: 'var(--surface)',
          raised: 'var(--surface-raised)',
          muted: 'var(--surface-muted)',
        },
        ink: {
          DEFAULT: 'var(--ink)',
          muted: 'var(--ink-muted)',
          faint: 'var(--ink-faint)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          soft: 'var(--accent-soft)',
          strong: 'var(--accent-strong)',
        },
        vote: {
          DEFAULT: 'var(--vote)',
          soft: 'var(--vote-soft)',
        },
      },
      borderRadius: {
        card: '0.75rem',
        pill: '9999px',
      },
      spacing: {
        nav: 'var(--nav-height)',
        safe: 'env(safe-area-inset-bottom, 0px)',
      },
      maxWidth: {
        app: '72rem',
      },
      zIndex: {
        fab: '30',
        nav: '40',
        overlay: '50',
        drawer: '60',
        modal: '70',
        toast: '80',
      },
      keyframes: {
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '25%': { transform: 'translateX(5px)' },
          '75%': { transform: 'translateX(-5px)' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        shake: 'shake 0.2s ease-in-out 0s 2',
        'fade-up': 'fade-up 0.2s ease-out',
      },
      boxShadow: {
        card: '0 1px 2px rgb(0 0 0 / 0.04), 0 4px 16px rgb(0 0 0 / 0.06)',
        float: '0 8px 24px rgb(0 0 0 / 0.12)',
      },
    },
  },
  plugins: [],
};
