/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./*.html", "./app.js"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Manrope", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        canvas: "#0B1020",
        panel: "#11182D",
        panelSoft: "#19233F",
        accent: "#22D3EE",
      },
    },
  },
  plugins: [],
};
