import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f0fdfa",
          100: "#ccfbf1",
          200: "#99f6e4",
          500: "#14b8a6",
          600: "#0d9488",
          700: "#0f766e",
          800: "#115e59",
          900: "#134e4a",
        },
      },
      boxShadow: {
        panel: "0 1px 2px rgba(15, 23, 42, 0.06)",
        float: "0 4px 12px -2px rgba(15, 23, 42, 0.10), 0 2px 4px -2px rgba(15, 23, 42, 0.06)",
        overlay: "0 12px 32px -8px rgba(15, 23, 42, 0.16), 0 4px 10px -4px rgba(15, 23, 42, 0.08)",
      },
    },
  },
  plugins: [],
} satisfies Config;
