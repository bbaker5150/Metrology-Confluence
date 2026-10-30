export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        canvas: "var(--bg)",
        surface: "var(--surface)",
        ink: "var(--ink)",
        muted: "var(--muted)",
        line: "var(--line)",
        brand: "var(--blue)",
        nav: "var(--nav)",
        success: "var(--mint)",
        warning: "var(--amber)",
        danger: "var(--rose)",
      },
      borderRadius: { card: "18px" },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      spacing: { sidebar: "248px", topbar: "70px" },
    },
  },
  plugins: [],
};
