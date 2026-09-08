"use client";

// 共有処理の優先順位:
//   1. Capacitorのネイティブ共有(@capacitor/share) … iOS/Androidアプリではこれが最も確実
//   2. ブラウザのWeb Share API … Web版でモバイルブラウザの場合
//   3. クリップボードへのコピー … どちらも使えないPC等
//
// @capacitor/share はWeb版でも動作する(内部でWeb Share API等にフォールバックする)ため、
// 常にこれを優先して呼び、失敗した場合のみ独自のフォールバック処理に進む構成にしている。
//
// 【型チェックに関する注意】(Web Share API部分)
// `"share" in navigator` のようなin演算子での判定は使わない。
// 最近のTypeScriptのDOM型定義では Navigator.share が必須(非オプショナル)プロパティとして
// 定義されているため、`typeof navigator !== "undefined" && "share" in navigator` は
// 型上「常にtrue」と推論され、それ以降のコードが「到達不可能(never型)」とみなされてしまい、
// 本番ビルド(Next.js/Vercel)で型エラーになる。
// そのため、実行時に安全な `typeof x === "function"` による関数存在チェックのみを使う。
import { Share } from "@capacitor/share";

export async function shareOrCopy(data: {
  title: string;
  text?: string;
  url?: string;
}): Promise<"shared" | "copied" | "failed"> {
  // 1. Capacitorのネイティブ共有を試す
  try {
    const canShare = await Share.canShare();
    if (canShare.value) {
      try {
        await Share.share({ title: data.title, text: data.text, url: data.url });
        return "shared";
      } catch {
        // ユーザーが共有シートをキャンセルした場合等。ここでは他の手段に
        // フォールバックしない(キャンセルしたのに勝手にコピーされると混乱するため)。
        return "failed";
      }
    }
  } catch {
    // canShare自体が使えない環境(プラグイン未対応など)。Web Share API等へのフォールバックを試みる。
  }

  // 2. ブラウザのWeb Share API(SSR等 navigator が存在しない環境でも安全に判定する)
  const nav: Navigator | null = typeof navigator !== "undefined" ? navigator : null;

  if (nav && typeof nav.share === "function") {
    try {
      await nav.share(data);
      return "shared";
    } catch {
      return "failed";
    }
  }

  // 3. クリップボードへのコピー
  if (nav && nav.clipboard && typeof nav.clipboard.writeText === "function") {
    try {
      const text = [data.title, data.text, data.url].filter(Boolean).join("\n");
      await nav.clipboard.writeText(text);
      return "copied";
    } catch {
      return "failed";
    }
  }

  // どの手段も使えない環境(古いブラウザ・非HTTPS等)
  return "failed";
}
