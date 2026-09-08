// 旅行詳細ページへのリンクを組み立てる。
// Web版は /trips/[tripId] (パスパラメータ方式、SSR/共有リンクとして自然な形)、
// モバイル(Capacitor静的書き出し)版は /trip?id=xxx (クエリ文字列方式、
// generateStaticParamsが使えない動的IDに対応するため)を使う。
// どちらを使うかは、ビルド時に埋め込まれる NEXT_PUBLIC_BUILD_TARGET で切り替える
// (scripts/build-mobile.mjs が "mobile" を設定してビルドする)。
export function tripHref(tripId: string): string {
  if (process.env.NEXT_PUBLIC_BUILD_TARGET === "mobile") {
    return `/trip?id=${encodeURIComponent(tripId)}`;
  }
  return `/trips/${tripId}`;
}
