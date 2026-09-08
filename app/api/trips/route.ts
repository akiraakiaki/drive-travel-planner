import { NextRequest, NextResponse } from "next/server";
import { createTrip, listTrips, listTripsForDevice } from "@/lib/store";
import { getDeviceId } from "@/lib/request-device";

// Vercel上でこのルートが静的にキャッシュされ、DBへの書き込みが画面に反映されない
// (SyntaxError: Unexpected end of JSON input等の症状につながる)問題を防ぐため、
// 常に動的(リクエストのたびに実行)にする。
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" };

// GET /api/trips
// X-Device-Id ヘッダーが付いていれば「その端末が作成した旅行だけ」を返す
// (認証機能が無い暫定対応。詳細はlib/device-id.tsのコメント参照)。
// ヘッダーが無い古いクライアント向けには、後方互換として全件を返す。
export async function GET(req: NextRequest) {
  const deviceId = getDeviceId(req);
  const trips = deviceId ? await listTripsForDevice(deviceId) : await listTrips();

  // ルート設定(force-dynamic)に加えて、レスポンスヘッダーでも明示的にキャッシュを禁止する。
  // Vercelのエッジ/CDN層が、ルート設定の判定とは別にレスポンスをキャッシュしてしまい、
  // 新しく作成した旅行が一覧に反映されない不具合を防ぐため。
  return NextResponse.json({ trips }, { headers: NO_STORE_HEADERS });
}

// 4.1 旅行作成: 必須項目チェック(開始日 <= 終了日 等)
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "リクエストが不正です。" }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const { name, destination, start_date, end_date } = body;

  if (!name || !destination || !start_date || !end_date) {
    return NextResponse.json(
      { error: "旅行名・旅行先・開始日・終了日は必須です。" },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  if (start_date > end_date) {
    return NextResponse.json(
      { error: "開始日は終了日以前である必要があります。" },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const deviceId = getDeviceId(req);
  const trip = await createTrip(
    {
      name,
      destination,
      start_date,
      end_date,
      daily_start_time: body.daily_start_time,
      daily_end_time: body.daily_end_time,
    },
    deviceId
  );

  return NextResponse.json({ trip }, { status: 201, headers: NO_STORE_HEADERS });
}
