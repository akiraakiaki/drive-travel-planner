import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.drivetravelplanner.app',
  appName: 'Drive Travel Planner',
  // Next.jsを `npm run build:mobile` (output:'export') で静的書き出しした先。
  // 'public' はNext.jsの静的アセット置き場であってビルド成果物ではないため、
  // そのままCapacitorに渡しても正しいページにはならない点に注意。
  webDir: 'out',
  server: {
    // AndroidでCookie/Mixed Content周りの挙動を安定させるため、
    // 内部的にはhttpsスキームでWebViewに読み込ませる(実際に外部通信するわけではない)。
    //
    // 【重要】 このandroidScheme設定により、アプリ内蔵ページのオリジンは
    // "https://localhost" になる。そのため、相対パスのfetch("/api/...")を書いてしまうと
    // Vercelではなくこのアプリ自身(https://localhost)にリクエストしてしまい、
    // 期待したJSONの代わりにWebViewの404/エラーHTMLが返ってくる(実際に起きた不具合)。
    // 必ず lib/api-base.ts の apiFetch/apiUrl 経由で、ビルド時に埋め込まれる
    // NEXT_PUBLIC_API_BASE_URL(Vercel本番URL)への絶対URLでAPIを呼ぶこと。
    androidScheme: 'https',
  },
};

export default config;
