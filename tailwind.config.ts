import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1F2430",       // メインテキスト(濃紺〜チャコール)
        paper: "#F7F5EF",     // メイン背景(明るいオフホワイト)
        card: "#FFFFFF",      // カード面
        route: "#33526E",     // リンク・枠線・強調(スチールブルー)
        amber: "#E8A33D",     // ボタン背景等(上に濃色テキストを乗せる用)
        leaf: "#3F6B32",      // 営業中・OK表示
        alert: "#B23A21",     // 警告・営業時間外
        mute: "#6B7280",      // 補助テキスト
      },
      fontFamily: {
        display: ["'Space Grotesk'", "sans-serif"],
        body: ["'Inter'", "sans-serif"],
        mono: ["'IBM Plex Mono'", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
