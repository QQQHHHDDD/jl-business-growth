import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "rgb(var(--color-canvas) / <alpha-value>)",
        surface: {
          DEFAULT: "rgb(var(--color-surface) / <alpha-value>)",
          soft: "rgb(var(--color-surface-soft) / <alpha-value>)",
          muted: "rgb(var(--color-surface-muted) / <alpha-value>)",
        },
        ink: {
          DEFAULT: "rgb(var(--color-ink) / <alpha-value>)",
          muted: "rgb(var(--color-ink-muted) / <alpha-value>)",
          faint: "rgb(var(--color-ink-faint) / <alpha-value>)",
        },
        outline: "rgb(var(--color-outline) / <alpha-value>)",
        brand: {
          50: "#ecfdf5",
          100: "#d1fae5",
          200: "#a7f3d0",
          400: "#34d399",
          500: "#14b8a6",
          600: "#0f8f83",
          700: "#0f766e",
          800: "#115e59",
          900: "#134e4a",
        },
        accent: {
          blue: "#60a5fa",
          purple: "#a78bfa",
          coral: "#fb7185",
          orange: "#fb923c",
          yellow: "#facc15",
          mint: "#6ee7b7",
          sky: "#38bdf8",
        },
      },
      borderRadius: {
        control: "0.75rem",
        card: "1rem",
        panel: "1.25rem",
        hero: "1.5rem",
      },
      boxShadow: {
        hairline: "0 1px 2px rgba(15, 23, 42, 0.04)",
        card: "0 8px 24px -18px rgba(15, 23, 42, 0.22)",
        "card-hover": "0 16px 32px -20px rgba(15, 23, 42, 0.28)",
        "brand-glow": "0 10px 24px -14px rgba(20, 184, 166, 0.55)",
        panel: "0 8px 24px -18px rgba(15, 23, 42, 0.18)",
        float: "0 12px 28px -18px rgba(15, 23, 42, 0.24)",
        overlay: "0 24px 64px -24px rgba(15, 23, 42, 0.32)",
      },
    },
  },
  plugins: [],
} satisfies Config;
