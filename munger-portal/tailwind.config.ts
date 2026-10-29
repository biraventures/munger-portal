import type { Config } from "tailwindcss";

const config: Config = {
    content: [
        "./src/**/*.{js,ts,jsx,tsx,mdx}",
        "./app/**/*.{js,ts,jsx,tsx,mdx}",
        "./components/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                serif: ["Fraunces", "serif"],
                sans: ["Public Sans", "sans-serif"],
                mono: ["IBM Plex Mono", "monospace"],
            },
        },
    },
    plugins: [],
};

export default config;