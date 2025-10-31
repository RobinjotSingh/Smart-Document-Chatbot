/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html", // include if you use it
  ],
  theme: {
    extend: {
      colors: {
        // 🎨 Professional custom palette (adjust as needed)
        primary: {
          DEFAULT: "#4F46E5", // Indigo 600
          light: "#6366F1",
          dark: "#4338CA",
        },
        secondary: {
          DEFAULT: "#6B7280", // Gray 500
          light: "#9CA3AF",
          dark: "#4B5563",
        },
        background: {
          light: "#F9FAFB",
          dark: "#1F2937",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["Fira Code", "monospace"],
      },
      boxShadow: {
        soft: "0 4px 14px rgba(0, 0, 0, 0.08)",
        card: "0 8px 24px rgba(0, 0, 0, 0.06)",
      },
      borderRadius: {
        xl: "1rem",
      },
      typography: ({ theme }) => ({
        DEFAULT: {
          css: {
            color: theme("colors.gray.800"),
            a: {
              color: theme("colors.primary.DEFAULT"),
              "&:hover": { color: theme("colors.primary.dark") },
            },
            h1: { fontWeight: "700", color: theme("colors.gray.900") },
            h2: { fontWeight: "600", color: theme("colors.gray.900") },
            code: { color: theme("colors.purple.600"), fontWeight: "500" },
            th: {
              backgroundColor: theme("colors.gray.100"),
              fontWeight: "600",
            },
          },
        },
        dark: {
          css: {
            color: theme("colors.gray.200"),
            a: { color: theme("colors.primary.light") },
            h1: { color: theme("colors.white") },
            h2: { color: theme("colors.white") },
            th: { backgroundColor: theme("colors.gray.700") },
          },
        },
      }),
    },
  },
  plugins: [
    require("@tailwindcss/typography"), // 🧠 for Markdown & formatted text
    require("@tailwindcss/forms"),      // ✨ nicer inputs/buttons
  ],
  darkMode: "class", // 🌙 enables dark/light mode switching
};
