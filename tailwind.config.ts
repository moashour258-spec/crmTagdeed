import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        brand: {
          navy: "#10324D",
          blue: "#397AD2",
          "blue-600": "#2F67B8",
          "blue-700": "#2A5CA8",
          teal: "#4EC1D3",
          cyan: "#7EDAE4",
          tint: "#E8F6F9",
          surface: "#F7FDFD",
        },
      },
      borderRadius: {
        card: "12px",
        button: "10px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,50,77,.06), 0 4px 16px rgba(16,50,77,.06)",
      },
    },
  },
};

export default config;
