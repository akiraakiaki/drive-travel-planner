import { NextRequest, NextResponse } from "next/server";

// Capacitorアプリ(iOS/Android)は、HTMLがアプリ内蔵の静的ファイルから配信されるため、
// VercelのAPIを呼ぶ際は必ずクロスオリジンリクエストになる。
// capacitor.config.ts で androidScheme: 'https' を指定しているため、
// Android実機/エミュレーターのオリジンは基本的に "https://localhost" になるが、
// iOSやAndroidのバージョン・設定によっては "capacitor://localhost" / "http://localhost" に
// なることもあるため、複数パターンを許可する。
//
// 【重要】以前の実装は、Origin文字列の完全一致を「環境変数で指定されたリスト」または
// 「デフォルトリスト」のどちらか一方でチェックしており、環境変数
// (ALLOWED_MOBILE_ORIGINS)を設定した場合にデフォルトのCapacitorオリジンが
// 意図せず許可リストから外れてしまう(＝CORSプリフライトが通らなくなる)不具合があった。
// このファイルでは、
//   1. Capacitor/Ionicの既知のオリジンパターンは常に許可する(環境変数の設定内容に関わらず)
//   2. 環境変数 ALLOWED_MOBILE_ORIGINS を設定した場合は、そのオリジンを追加で許可する(置き換えではなく追加)
// という形にし、設定ミスでモバイルアプリが接続できなくなる事故を防いでいる。
//
// なお、Cookie等の資格情報(credentials)は使用していない(認証は X-Device-Id ヘッダーで行っており、
// ブラウザの credentials 送信対象にはならない)ため、Access-Control-Allow-Credentials は
// 意図的に設定しない(要件7: 不要なcredentials許可を避ける)。

// Capacitor/IonicのWebViewが使う既知のオリジンパターン(常に許可する)
const KNOWN_MOBILE_ORIGIN_PATTERNS: RegExp[] = [
  /^capacitor:\/\/localhost$/,
  /^ionic:\/\/localhost$/,
  /^https?:\/\/localhost(:\d+)?$/,
];

function getExtraAllowedOrigins(): string[] {
  const fromEnv = process.env.ALLOWED_MOBILE_ORIGINS;
  if (!fromEnv) return [];
  return fromEnv
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

function isOriginAllowed(origin: string): boolean {
  if (KNOWN_MOBILE_ORIGIN_PATTERNS.some((pattern) => pattern.test(origin))) {
    return true;
  }
  return getExtraAllowedOrigins().includes(origin);
}

function applyCorsHeaders(res: NextResponse, req: NextRequest): NextResponse {
  const origin = req.headers.get("origin");

  if (origin && isOriginAllowed(origin)) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    // オリジンによってレスポンス内容(許可ヘッダー)を変えているため、
    // 中間キャッシュが誤って他オリジン向けの応答を使い回さないようにする。
    res.headers.set("Vary", "Origin");
  }

  res.headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");

  // ブラウザがプリフライトで「これらのヘッダーを送りたい」と申告してきた内容を
  // そのまま許可として反映する(固定リストだと、将来ヘッダーを追加した際に
  // ここの更新を忘れてCORSエラーになる事故を防ぐため)。
  // 申告が無い場合(単純リクエスト等)は、実際に使っているヘッダーを明示しておく。
  const requestedHeaders = req.headers.get("access-control-request-headers");
  res.headers.set(
    "Access-Control-Allow-Headers",
    requestedHeaders && requestedHeaders.length > 0 ? requestedHeaders : "Content-Type, X-Device-Id"
  );

  return res;
}

export function middleware(req: NextRequest) {
  // プリフライトリクエスト(OPTIONS)はここで即座に2xxを返す。
  // 実際のRoute HandlerはOPTIONSを実装していないため、ここで応答しないとNext.jsの
  // デフォルト動作(405 Method Not Allowed、CORSヘッダー無し)が返り、
  // ブラウザ(WebView)側で「プリフライトがCORSポリシーにより拒否された」と判定されてしまう。
  if (req.method === "OPTIONS") {
    return applyCorsHeaders(new NextResponse(null, { status: 204 }), req);
  }

  const res = NextResponse.next();
  return applyCorsHeaders(res, req);
}

export const config = {
  matcher: "/api/:path*",
};
