import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#080808",
        panel: "#171717",
        "panel-soft": "#202020",
        line: "#343434",
        cream: "#ededed",
        amber: "#d1d1d1",
        mint: "#aaaaaa",
        danger: "#ef765f"
      },
      boxShadow: { glow: "0 14px 40px rgba(0,0,0,.24)" },
      borderRadius: { "2xl": "1.25rem" }
    }
  },
  plugins: []
} satisfies Config;
