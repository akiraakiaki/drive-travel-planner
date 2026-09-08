"use client";

// この端末(ブラウザ/アプリ)を識別するための簡易ID。
//
// 【現状の設計について】
// 本格的なユーザーアカウント(ログイン)はまだ導入していない。しかし認証なしのまま
// モバイルアプリとしてストア公開すると、「トップページの旅行一覧」が全利用者で
// 共有される状態になってしまう(誰でも他人の旅行を見たり消したりできる)。
// これを避けるため、端末ごとに生成したIDを旅行データに紐付け、
// 「一覧には自分の端末で作った旅行だけを表示する」という最低限の分離を行う。
//
// 旅程の詳細ページ・API操作自体はこれまで通りIDが分かれば誰でもアクセスできる
// (「旅程を共有」機能でリンクを渡した相手が見られるようにするため、意図的に制限していない)。
// 将来的に本格的な認証(Supabase Auth等)を導入する場合は、この仕組みを置き換える想定。
//
// @capacitor/preferences は、ネイティブアプリ(iOS/Android)ではネイティブストレージを、
// Web版ではlocalStorageを自動的に使うため、同じコードでWeb/iOS/Androidすべてに対応できる。
import { Preferences } from "@capacitor/preferences";

const DEVICE_ID_KEY = "drive-travel-planner:device-id";

function generateUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // 古いWebView等 crypto.randomUUID が無い環境向けの簡易フォールバック
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

let cachedDeviceId: string | null = null;
let pendingPromise: Promise<string> | null = null;

export async function getOrCreateDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;
  if (pendingPromise) return pendingPromise;

  pendingPromise = (async () => {
    try {
      const existing = await Preferences.get({ key: DEVICE_ID_KEY });
      if (existing.value) {
        cachedDeviceId = existing.value;
        return existing.value;
      }

      const newId = generateUuid();
      await Preferences.set({ key: DEVICE_ID_KEY, value: newId });
      cachedDeviceId = newId;
      return newId;
    } finally {
      pendingPromise = null;
    }
  })();

  return pendingPromise;
}
