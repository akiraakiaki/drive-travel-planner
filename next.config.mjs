// BUILD_TARGET=mobile のときだけ、Capacitor同梱用に静的書き出し(output:'export')にする。
// 通常のVercelビルド(BUILD_TARGET未設定)では今まで通りのサーバーモードのまま。
// モバイル書き出し時は scripts/build-mobile.mjs が事前に app/api を退避してから
// このビルドを実行するため、動的なRoute Handlerが混在してビルド失敗することはない。
const isMobileBuild = process.env.BUILD_TARGET === "mobile";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  ...(isMobileBuild
    ? {
        output: "export",
        // 静的書き出し時はNext.jsの画像最適化サーバーが使えないため無効化する
        images: { unoptimized: true },
        // file:// 経由で開かれるCapacitor環境向けに、末尾スラッシュ付きの
        // index.htmlパス解決にしておくと事故が少ない
        trailingSlash: true,
      }
    : {}),
};

export default nextConfig;
