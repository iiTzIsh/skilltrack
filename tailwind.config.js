/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
    theme: {
    extend: {
      colors: {
        bg: 'var(--bg)', surface: 'var(--surface)', surface2: 'var(--surface-2)',
        line: 'var(--border)', line2: 'var(--border-strong)',
        ink: 'var(--text)', ink2: 'var(--text-2)', muted: 'var(--muted)',
        accent: 'var(--accent)', accentsoft: 'var(--accent-soft)', onaccent: 'var(--accent-text)',
        todo: 'var(--todo)', learning: 'var(--learning)', done: 'var(--done)',
        danger: 'var(--danger)', dangersoft: 'var(--danger-soft)',
        donesoft: 'var(--done-soft)', learnsoft: 'var(--learning-soft)',
        overlay: 'var(--overlay)', toastbg: 'var(--toast-bg)', toasttext: 'var(--toast-text)',
      },
      fontFamily: { sans: ['ui-sans-serif', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'Arial', 'sans-serif'] },
      boxShadow: { soft: '0 1px 2px rgba(0,0,0,.04), 0 4px 16px rgba(0,0,0,.06)', pop: '0 10px 40px rgba(0,0,0,.18)' },
    },
  },
  plugins: [],
};
