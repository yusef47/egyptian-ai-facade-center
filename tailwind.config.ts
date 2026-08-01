import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        obsidian: "#121824",
        gold: "#C5A059",
      },
      fontFamily: { cairo: ["Cairo", "sans-serif"] },
    },
  },
  plugins: [],
} satisfies Config;
