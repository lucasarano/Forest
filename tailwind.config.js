/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'forest-dark': '#0a0f0d',
        'forest-darker': '#050807',
        'forest-card': '#141b17',
        'forest-border': '#1f2d27',
        'forest-green': '#10b981',
        'forest-emerald': '#34d399',
        'forest-teal': '#14b8a6',
        'forest-gray': '#6b7280',
        'forest-light-gray': '#9ca3af',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
