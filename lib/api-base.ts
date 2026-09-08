"use client";

// Vercel上のWeb版としてこのアプリが動いている場合はAPIも同一オリジンなので、
// NEXT_PUBLIC_API_BASE_URL は未設定(空文字)のままで良い。
//
// Capacitorアプリ(iOS/Android)では、HTMLは端末内のWebView(https://localhost 等)から
// 読み込まれるため、相対パスの fetch("/api/...") は「アプリ自身(localhost)」に対する
// リクエストになってしまい、Vercelには絶対に届かない。
// (実際に発生した不具合: NEXT_PUBLIC_API_BASE_URL 未設定のままモバイルビルドした結果、
//  fetch("/api/trips") が https://localhost/api/trips に解決され、
//  JSONを期待した箇所にAndroidのWebViewが返す404/エラーHTMLが渡ってJSON.parseに失敗していた。)
//
// そのため、モバイル向けビルド(scripts/build-mobile.mjs)実行時に、ビルド時環境変数として
// NEXT_PUBLIC_API_BASE_URL="https://<本番ドメイン>" を設定し、常に絶対URLでAPIを叩くようにする。
// さらに、万が一この環境変数が設定し忘れられた場合の保険として、モバイルビルド
// (NEXT_PUBLIC_BUILD_TARGET === "mobile")の場合に限り、既知の本番URLへフォールバックする。
// (scripts/build-mobile.mjs 側でも、未設定ならビルド自体を失敗させるチェックを入れている。
//  ここでのフォールバックは、あくまで二重の安全策)
import { getOrCreateDeviceId } from "./device-id";

// モバイルビルドで NEXT_PUBLIC_API_BASE_URL が未設定だった場合に使う既知の本番URL。
// Vercelのデプロイ先が変わった場合は、ここと .env.local の両方を更新すること。
const MOBILE_FALLBACK_API_BASE_URL = "https://drive-travel-planner.vercel.app";

function resolveApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (configured) return configured;

  if (process.env.NEXT_PUBLIC_BUILD_TARGET === "mobile") {
    console.warn(
      "[api-base] NEXT_PUBLIC_API_BASE_URL が未設定のままモバイルビルドされています。" +
        `既定値 (${MOBILE_FALLBACK_API_BASE_URL}) にフォールバックします。` +
        "本来は .env.local 等で明示的に設定してください。"
    );
    return MOBILE_FALLBACK_API_BASE_URL;
  }

  // Web版(Vercel上)は同一オリジンなので相対パスのままでよい
  return "";
}

const API_BASE_URL = resolveApiBaseUrl();

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

export interface ApiFetchOptions extends RequestInit {
  // falseを指定した場合のみ X-Device-Id ヘッダーを付与しない
  withDeviceId?: boolean;
}

// fetch()の薄いラッパー。以下を一箇所にまとめる。
//  - APIベースURLの解決(Web版は相対パスのまま、モバイルは絶対URL)
//  - 端末IDヘッダー(X-Device-Id)の付与
//  - キャッシュ無効化(no-store)
export async function apiFetch(path: string, options: ApiFetchOptions = {}): Promise<Response> {
  const { withDeviceId = true, headers, cache, ...rest } = options;

  const finalHeaders = new Headers(headers);
  if (withDeviceId) {
    try {
      const deviceId = await getOrCreateDeviceId();
      finalHeaders.set("X-Device-Id", deviceId);
    } catch {
      // デバイスID取得に失敗しても、致命的にはせずヘッダー無しで続行する
    }
  }

  return fetch(apiUrl(path), {
    cache: cache ?? "no-store",
    ...rest,
    headers: finalHeaders,
  });
}

// レスポンスがJSONではなくHTML等だった場合に、原因が分かるメッセージで例外を投げる。
// (APIベースURLの設定ミスで、Vercelではなく別のサーバー/WebView自身に飛んでしまっている場合、
//  多くは "<!DOCTYPE html>..." のようなエラーページが返ってきて JSON.parse が失敗するため)
async function parseJsonResponseSafely(res: Response): Promise<unknown> {
  const text = await res.text();
  const contentType = res.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    const preview = text.slice(0, 200).replace(/\s+/g, " ").trim();
    throw new Error(
      "APIから想定外の形式のレスポンスが返ってきました(JSON以外)。" +
        "モバイルアプリの場合、NEXT_PUBLIC_API_BASE_URL の設定漏れによりAPIサーバーへ" +
        "正しく到達できていない可能性があります。" +
        ` [status=${res.status} content-type="${contentType}" body="${preview}"]`
    );
  }

  try {
    return text ? JSON.parse(text) : null;
  } catch (err) {
    throw new Error(
      `APIレスポンスのJSON解析に失敗しました: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

// GET用: レスポンスをJSONとして安全にパースする。HTML等が返ってきた場合は原因の分かる例外を投げる。
export async function apiFetchJsonGet(
  path: string,
  options: ApiFetchOptions = {}
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const res = await apiFetch(path, options);
  const data = await parseJsonResponseSafely(res);
  return { ok: res.ok, status: res.status, data };
}

// JSON POST/PATCH/DELETE用の小さなヘルパー。失敗時は例外を投げる(呼び出し側でtry/catchする想定)。
export async function apiFetchJson(
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown
): Promise<unknown> {
  const res = await apiFetch(path, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = await parseJsonResponseSafely(res).catch((err) => {
    // JSON解析自体に失敗した場合も、可能な範囲で原因が伝わるメッセージにする
    throw err instanceof Error ? err : new Error("リクエストに失敗しました。");
  });

  if (!res.ok) {
    throw new Error((data as { error?: string } | null)?.error ?? "リクエストに失敗しました。");
  }
  return data;
}
