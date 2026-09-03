"use client";

// Web Share API が使える環境ではネイティブの共有シートを、使えない環境では
// クリップボードへのコピーにフォールバックする、シンプルな共有ユーティリティ。
//
// 【型チェックに関する注意】
// `"share" in navigator` のようなin演算子での判定は使わない。
// 最近のTypeScriptのDOM型定義では Navigator.share が必須(非オプショナル)プロパティとして
// 定義されているため、`typeof navigator !== "undefined" && "share" in navigator` は
// 型上「常にtrue」と推論され、それ以降のコードが「到達不可能(never型)」とみなされてしまい、
// 本番ビルド(Next.js/Vercel)で型エラーになる。
// そのため、実行時に安全な `typeof x === "function"` による関数存在チェックのみを使う。
//
// また、SSR等 navigator 自体が存在しない環境でも例外を投げないよう、
// まず navigator の存在確認をしてからローカル変数に入れて扱う。
export async function shareOrCopy(data: {
  title: string;
  text?: string;
  url?: string;
}): Promise<"shared" | "copied" | "failed"> {
  const nav: Navigator | null = typeof navigator !== "undefined" ? navigator : null;

  if (nav && typeof nav.share === "function") {
    try {
      await nav.share(data);
      return "shared";
    } catch {
      // ユーザーがキャンセルした場合等はここに来る。コピーにはフォールバックしない。
      return "failed";
    }
  }

  if (nav && nav.clipboard && typeof nav.clipboard.writeText === "function") {
    try {
      const text = [data.title, data.text, data.url].filter(Boolean).join("\n");
      await nav.clipboard.writeText(text);
      return "copied";
    } catch {
      return "failed";
    }
  }

  // Web Share APIもクリップボードAPIも使えない環境(古いブラウザ・非HTTPS等)
  return "failed";
}
