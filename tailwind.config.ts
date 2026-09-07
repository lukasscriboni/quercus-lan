import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#101715",
        panel: "#18211e",
        line: "#2a3632",
        cream: "#f4efe4",
        amber: "#e6a63a",
        mint: "#89c9aa",
        danger: "#ef765f"
      },
      boxShadow: { glow: "0 14px 40px rgba(0,0,0,.24)" },
      borderRadius: { "2xl": "1.25rem" }
    }
  },
  plugins: []
} satisfies Config;
