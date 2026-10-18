/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        om: {
          blue: '#0284c7',
          darkBlue: '#0369a1',
          lightBlue: '#e0f2fe',
          grayBg: '#f0f2f5',
          ribbonBg: '#f0f2f5',
          border: '#c9d0d8',
          darkBorder: '#94a3b8',
          prompt: '#1a365d',
          selection: '#bae6fd'
        }
      }
    },
  },
  plugins: [],
}
