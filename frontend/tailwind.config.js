/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        xrpl: {
          blue: "#23292F",
          teal: "#0085FF",
          accent: "#00E5FF",
          dark: "#0F172A",
          card: "#1E293B",
        },
      },
    },
  },
  plugins: [],
};
