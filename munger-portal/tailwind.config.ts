import type { Config } from "tailwindcss";

const config: Config = {
    content: [
        "./src/**/*.{js,ts,jsx,tsx,mdx}",
        "./app/**/*.{js,ts,jsx,tsx,mdx}",
        "./components/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            colors: {
                paper: "#f6f3ea",
                "paper-dim": "#ece7d8",
                card: "#ffffff",
                ink: "#1c2230",
                "ink-soft": "#4a5164",
                line: "#d9d3c1",
                "nnm-blue": "#c65c56",
                "nnm-blue-dark": "#a8433d",
                "nnm-gold": "#c9a227",
                "ganga-teal": "#2f7a6b",
            },
            fontFamily: {
                display: ["Fraunces", "Georgia", "serif"],
                body: ["Public Sans", "ui-sans-serif", "system-ui", "sans-serif"],
                mono: ["IBM Plex Mono", "ui-monospace", "SFMono-Regular", "monospace"],
                serif: ["Fraunces", "serif"],
                sans: ["Public Sans", "sans-serif"],
            },
        },
    },
    plugins: [],
};

export default config;
