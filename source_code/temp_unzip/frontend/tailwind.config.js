/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eff6ff",
          100: "#dbeafe",
          200: "#bfdbfe",
          300: "#93c5fd",
          400: "#60a5fa",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
          800: "#1e40af",
          900: "#1e3a8a",
        },
      },
      boxShadow: {
        card: "0 1px 2px rgb(15 23 42 / 0.03), 0 8px 24px rgb(15 23 42 / 0.04)",
        lift: "0 12px 30px rgb(37 99 235 / 0.12)",
      },
      borderRadius: {
        xl: "0.85rem",
        "2xl": "1rem",
      },
    },
  },
  plugins: [],
};