"use client";

// Web Share API が使える環境ではネイティブの共有シートを、使えない環境では
// クリップボードへのコピーにフォールバックする、シンプルな共有ユーティリティ。
export async function shareOrCopy(data: { title: string; text?: string; url?: string }): Promise<"shared" | "copied" | "failed"> {
  if (typeof navigator !== "undefined" && "share" in navigator) {
    try {
      await navigator.share(data);
      return "shared";
    } catch {
      // ユーザーがキャンセルした場合等はここに来る。コピーにはフォールバックしない。
      return "failed";
    }
  }

  try {
    const text = [data.title, data.text, data.url].filter(Boolean).join("\n");
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}
