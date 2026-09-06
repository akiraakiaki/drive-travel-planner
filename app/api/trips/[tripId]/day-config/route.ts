import { NextRequest, NextResponse } from "next/server";
import { updateTripDayConfig } from "@/lib/store";

// Vercel上でこのルートが静的にキャッシュされ、DBへの書き込みが画面に反映されない
// (SyntaxError: Unexpected end of JSON input等の症状につながる)問題を防ぐため、
// 常に動的(リクエストのたびに実行)にする。
export const dynamic = "force-dynamic";

// PATCH /api/trips/:tripId/day-config
// { day: number, activity_start_time?: "HH:mm", activity_end_time?: "HH:mm",
//   origin_place_id?: string | null, destination_place_id?: string | null }
// 到着地を変更すると、翌日の出発地が自動的に引き継がれる(store.ts側で処理)。
export async function PATCH(
  req: NextRequest,
  { params }: { params: { tripId: string } }
) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.day !== "number") {
    return NextResponse.json({ error: "day は必須です。" }, { status: 400 });
  }

  const trip = await updateTripDayConfig(params.tripId, body.day, {
    activity_start_time: body.activity_start_time,
    activity_end_time: body.activity_end_time,
    origin_place_id: body.origin_place_id,
    destination_place_id: body.destination_place_id,
  });

  if (!trip) {
    return NextResponse.json({ error: "旅行または日程が見つかりません。" }, { status: 404 });
  }

  return NextResponse.json({ trip });
}
