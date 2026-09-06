import { NextRequest, NextResponse } from "next/server";
import { createTrip, listTrips } from "@/lib/store";

// Vercel上でこのルートが静的にキャッシュされ、DBへの書き込みが画面に反映されない
// (SyntaxError: Unexpected end of JSON input等の症状につながる)問題を防ぐため、
// 常に動的(リクエストのたびに実行)にする。
export const dynamic = "force-dynamic";

export async function GET() {
  // ルート設定(force-dynamic)に加えて、レスポンスヘッダーでも明示的にキャッシュを禁止する。
  // Vercelのエッジ/CDN層が、ルート設定の判定とは別にレスポンスをキャッシュしてしまい、
  // 新しく作成した旅行が一覧に反映されない不具合を防ぐため。
  return NextResponse.json(
    { trips: await listTrips() },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } }
  );
}

// 4.1 旅行作成: 必須項目チェック(開始日 <= 終了日 等)
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "リクエストが不正です。" }, { status: 400 });
  }

  const { name, destination, start_date, end_date } = body;

  if (!name || !destination || !start_date || !end_date) {
    return NextResponse.json(
      { error: "旅行名・旅行先・開始日・終了日は必須です。" },
      { status: 400 }
    );
  }

  if (start_date > end_date) {
    return NextResponse.json(
      { error: "開始日は終了日以前である必要があります。" },
      { status: 400 }
    );
  }

  const trip = await createTrip({
    name,
    destination,
    start_date,
    end_date,
    daily_start_time: body.daily_start_time,
    daily_end_time: body.daily_end_time,
  });

  return NextResponse.json({ trip }, { status: 201 });
}
