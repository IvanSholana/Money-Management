/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: "#12324a",
        teal: {
          DEFAULT: "#0f9f9a",
          50: "#f0fdfa",
          100: "#ccfbf1",
          200: "#99f6e4",
          300: "#5eead4",
          400: "#2dd4bf",
          500: "#0f9f9a",
          600: "#0d9488",
          700: "#0f766e",
          800: "#115e59",
          900: "#134e4a",
          950: "#042f2e",
        },
        ink: "#172033",
      },
      boxShadow: {
        soft: "0 16px 45px rgba(18, 50, 74, 0.10)",
      },
    },
  },
  plugins: [],
};
