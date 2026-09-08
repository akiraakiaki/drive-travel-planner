import { NextRequest } from "next/server";

// フロントエンド(lib/api-base.ts の apiFetch)が付与する X-Device-Id ヘッダーを取り出す。
// 未送信の場合はnull(呼び出し側で「端末IDなし」として扱う)。
export function getDeviceId(req: NextRequest): string | null {
  const value = req.headers.get("x-device-id");
  return value && value.trim() !== "" ? value.trim() : null;
}
