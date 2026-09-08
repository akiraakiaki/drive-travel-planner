// Capacitor(iOS/Android)に同梱する「アプリシェル」を静的書き出しするためのビルドスクリプト。
//
// Next.jsの output:'export' では以下の2つが問題になる。
//   1. 動的なRoute Handler(app/api/**) … 静的書き出しと共存できない
//   2. 動的パスセグメントを持つページ(app/trips/[tripId]) … ビルド時に
//      generateStaticParams() で全パスを列挙する必要があるが、tripIdはNeon Postgres上の
//      実行時データであり、ビルド時に全ユーザー分を列挙することはできない
//      (空配列を返す回避策は、Next.jsのバージョン・構成によって不安定になることがある)
//
// これらはいずれもVercel用のビルド(npm run build)では必須のファイルなので、
// リポジトリ本体から削除するわけにはいかない。そのため、モバイル向けビルド時だけ
// 一時的に退避し、ビルド後に復元する。
//
// モバイル版では /trips/[tripId] の代わりに、クエリ文字列で動的にtripIdを受け取る
// app/trip/page.tsx (?id=xxx) を使い、実行時にVercelのAPIから旅行データを取得して表示する
// (components/TripDetailScreen.tsx を両者で共有しているため、退避してもロジックは失われない)。
//
// 【Windowsでの注意点】
// ディレクトリの退避には fs.renameSync ではなく「コピー→削除」方式を使っている。
// Windowsでは rename がウイルス対策ソフト等の一時的なファイルロックにより
// EPERM: operation not permitted で失敗することがあるため。
// 各ファイル操作はEPERM/EBUSY等に対して自動リトライする。
import { execSync } from "node:child_process";
import { existsSync, cpSync, rmSync, readFileSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const tmpRoot = path.join(projectRoot, ".mobile-build-tmp");

// このラッパースクリプト自体はNext.jsのCLIではないため、.env.localは自動では読み込まれない
// (next buildが内部で行うdotenv読み込みは、実際に next build プロセスが起動してから行われる)。
// そのため、ビルド前に NEXT_PUBLIC_API_BASE_URL を検証したい場合は、ここで簡易的に
// .env.local を自前でパースする(既にshell環境変数として設定されていればそちらを優先する)。
function loadDotEnvLocal() {
  const envPath = path.join(projectRoot, ".env.local");
  if (!existsSync(envPath)) return {};

  const result = {};
  const content = readFileSync(envPath, "utf-8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    let value = line.slice(eqIdx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

// モバイルビルドでAPIベースURLが未設定・不正な形式のまま静的書き出しされると、
// アプリ内蔵ページの fetch("/api/...") が「Vercel」ではなく「WebView自身(https://localhost)」に
// 向いてしまい、実機/エミュレーターで原因の分かりにくいエラー(HTMLがJSONとして解釈できない等)に
// なる。この事故を未然に防ぐため、ビルド前に必ず検証し、不正な場合はビルド自体を失敗させる。
function resolveAndValidateApiBaseUrl() {
  const dotEnvLocal = loadDotEnvLocal();
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || dotEnvLocal.NEXT_PUBLIC_API_BASE_URL || "";

  const isValid = /^https:\/\/.+/.test(apiBaseUrl) && !apiBaseUrl.includes("localhost");

  if (!isValid) {
    console.error(
      "\n[build-mobile] ✖ NEXT_PUBLIC_API_BASE_URL が未設定、または不正な形式です。\n" +
        "  モバイルビルドでは、アプリ内蔵ページからのAPI呼び出し先として、\n" +
        "  Vercel本番URLへの絶対URL(https://...)を必ず設定する必要があります。\n\n" +
        "  設定方法(いずれか):\n" +
        "    1. .env.local に以下を追記する:\n" +
        "         NEXT_PUBLIC_API_BASE_URL=https://drive-travel-planner.vercel.app\n" +
        "    2. コマンド実行時に環境変数として渡す:\n" +
        "         (Windows PowerShell)\n" +
        '           $env:NEXT_PUBLIC_API_BASE_URL="https://drive-travel-planner.vercel.app"; npm run build:mobile\n' +
        "         (macOS/Linux)\n" +
        "           NEXT_PUBLIC_API_BASE_URL=https://drive-travel-planner.vercel.app npm run build:mobile\n\n" +
        `  現在の値: "${apiBaseUrl}"\n`
    );
    process.exit(1);
  }

  return apiBaseUrl;
}

// モバイル向け静的書き出しでは共存できないため、一時的に退避するパス一覧。
// 相対パスは projectRoot からの位置。
const EXCLUDE_PATHS = [
  { rel: path.join("app", "api"), label: "app/api (Route Handler)" },
  { rel: path.join("app", "trips"), label: "app/trips/[tripId] (動的パスセグメント)" },
];

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 300;

function sleep(ms) {
  const sab = new SharedArrayBuffer(4);
  const view = new Int32Array(sab);
  Atomics.wait(view, 0, 0, ms); // 同期的にスリープする(スクリプトはシーケンシャル実行のため問題ない)
}

// Windowsでファイル/ディレクトリ操作がEPERM・EBUSY等で一時的に失敗することがあるため、
// 短い間隔でリトライする。ウイルス対策ソフト等が一瞬だけハンドルを掴んでいるだけのことが多く、
// 数百ミリ秒待てば解放されるケースがほとんど。
function withRetries(label, fn) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      fn();
      return;
    } catch (err) {
      lastError = err;
      const retriable = err && (err.code === "EPERM" || err.code === "EBUSY" || err.code === "ENOTEMPTY");
      if (!retriable || attempt === MAX_RETRIES) {
        break;
      }
      console.warn(
        `[build-mobile] ${label} に失敗しました(試行${attempt}/${MAX_RETRIES}, ${err.code})。${RETRY_DELAY_MS}ms待って再試行します...`
      );
      sleep(RETRY_DELAY_MS);
    }
  }
  throw lastError;
}

function backupPath(entry) {
  const src = path.join(projectRoot, entry.rel);
  const dst = path.join(tmpRoot, entry.rel);

  if (!existsSync(src)) {
    console.log(`[build-mobile] ${entry.label} は存在しないためスキップします。`);
    return;
  }

  console.log(`[build-mobile] ${entry.label} を退避します...`);
  withRetries(`${entry.label} のコピー`, () => {
    cpSync(src, dst, { recursive: true });
  });
  withRetries(`${entry.label} の削除`, () => {
    rmSync(src, { recursive: true, force: true });
  });
}

function restorePath(entry) {
  const src = path.join(projectRoot, entry.rel);
  const backup = path.join(tmpRoot, entry.rel);

  if (!existsSync(backup)) {
    return;
  }

  withRetries(`${entry.label} の復元(削除)`, () => {
    rmSync(src, { recursive: true, force: true });
  });
  withRetries(`${entry.label} の復元(コピー)`, () => {
    cpSync(backup, src, { recursive: true });
  });

  console.log(`[build-mobile] ${entry.label} を復元しました。`);
}

function restoreAll() {
  for (const entry of EXCLUDE_PATHS) {
    restorePath(entry);
  }
  withRetries("一時バックアップの削除", () => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });
}

// 前回の実行が異常終了して退避したままになっていないか確認する
if (existsSync(tmpRoot)) {
  console.log("[build-mobile] 前回の退避が残っていたため復元してから開始します。");
  restoreAll();
}

let buildSucceeded = false;

try {
  const apiBaseUrl = resolveAndValidateApiBaseUrl();
  console.log(`[build-mobile] NEXT_PUBLIC_API_BASE_URL = ${apiBaseUrl}`);

  for (const entry of EXCLUDE_PATHS) {
    backupPath(entry);
  }

  console.log("[build-mobile] 静的書き出しビルドを実行します(next build, output:export)...");
  execSync("next build", {
    stdio: "inherit",
    env: {
      ...process.env,
      BUILD_TARGET: "mobile",
      NEXT_PUBLIC_BUILD_TARGET: "mobile",
      // .env.localから読んだ値も含めて確実に子プロセスへ渡す(process.envに無い場合の保険)
      NEXT_PUBLIC_API_BASE_URL: apiBaseUrl,
    },
  });

  buildSucceeded = true;
} finally {
  restoreAll();
}

if (buildSucceeded) {
  console.log("[build-mobile] 完了しました。out/ ディレクトリを capacitor.config.ts の webDir として使用します。");
} else {
  console.error("[build-mobile] ビルドに失敗しました。退避したファイルは復元済みです。");
  process.exit(1);
}
