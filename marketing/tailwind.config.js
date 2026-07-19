/** @type {import('tailwindcss').Config} */
module.exports = {
  // Paths relative to this file (Tailwind 3.4+), not cwd — fixes monorepo wrong-config picks.
  content: {
    relative: true,
    files: [
      './app/**/*.{js,ts,jsx,tsx,mdx}',
      './pages/**/*.{js,ts,jsx,tsx,mdx}',
      './components/**/*.{js,ts,jsx,tsx,mdx}',
      './app/**/*.css',
      // Shared route-planner package (map + search UI) — scan so its classes generate.
      '../packages/route-planner-core/**/*.{js,ts,jsx,tsx}',
    ],
  },
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#F6F9F7',
          100: '#F6F9F7',
          200: '#F6F9F7',
          500: '#193434',
          600: '#193434',
          700: '#193434',
          800: '#193434',
          900: '#193434',
        },
        accent: {
          400: '#3DD57A',
          500: '#3DD57A',
          600: '#35c06e',
          700: '#2da861',
        },
        gray: {
          50: '#f9fafb',
          100: '#f3f4f6',
          200: '#e5e7eb',
          300: '#d1d5db',
          400: '#9ca3af',
          500: '#6b7280',
          600: '#4b5563',
          700: '#374151',
          800: '#1f2937',
          900: '#111827',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        'hero-float': {
          '0%, 100%': { transform: 'translateY(0) rotate(-0.5deg)' },
          '50%': { transform: 'translateY(-14px) rotate(0.5deg)' },
        },
        'hero-float-delayed': {
          '0%, 100%': { transform: 'translateY(0) rotate(0.5deg)' },
          '50%': { transform: 'translateY(-10px) rotate(-0.5deg)' },
        },
        'hero-drift': {
          '0%, 100%': { transform: 'translate(0, 0)' },
          '33%': { transform: 'translate(4px, -6px)' },
          '66%': { transform: 'translate(-3px, 4px)' },
        },
        'hero-drift-reverse': {
          '0%, 100%': { transform: 'translate(0, 0)' },
          '33%': { transform: 'translate(-4px, 5px)' },
          '66%': { transform: 'translate(3px, -4px)' },
        },
        'spin-slow': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        'spin-slow-reverse': {
          '0%': { transform: 'rotate(360deg)' },
          '100%': { transform: 'rotate(0deg)' },
        },
        'feature-fade-in': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'hero-float': 'hero-float 7s ease-in-out infinite',
        'hero-float-delayed': 'hero-float-delayed 6s ease-in-out infinite',
        'hero-drift': 'hero-drift 9s ease-in-out infinite',
        'hero-drift-reverse': 'hero-drift-reverse 8s ease-in-out infinite',
        'spin-slow': 'spin-slow 28s linear infinite',
        'spin-slow-reverse': 'spin-slow-reverse 22s linear infinite',
        'feature-fade-in': 'feature-fade-in 0.45s ease-out forwards',
      },
    },
  },
  plugins: [],
}