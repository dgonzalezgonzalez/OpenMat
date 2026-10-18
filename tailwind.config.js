/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        mw: {
          blue: '#0076a8',
          darkBlue: '#005f88',
          lightBlue: '#e6f3f8',
          grayBg: '#f0f0f0',
          ribbonBg: '#f7f7f7',
          border: '#cccccc',
          darkBorder: '#999999',
          prompt: '#204080',
          selection: '#cce8ff'
        }
      }
    },
  },
  plugins: [],
}
