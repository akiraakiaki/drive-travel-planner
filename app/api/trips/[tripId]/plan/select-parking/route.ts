import { NextRequest, NextResponse } from "next/server";
import { getTrip, selectStopParking } from "@/lib/store";
import { recomputeDayWithParking } from "@/lib/planner";

// Vercel上でこのルートが静的にキャッシュされ、DBへの書き込みが画面に反映されない
// (SyntaxError: Unexpected end of JSON input等の症状につながる)問題を防ぐため、
// 常に動的(リクエストのたびに実行)にする。
export const dynamic = "force-dynamic";

const WALK_SPEED_METERS_PER_MINUTE = 70; // おおよその徒歩速度(信号待ち等を含めた目安)

// POST /api/trips/:tripId/plan/select-parking
// { day: number, trip_place_id: string, parking_place_id: string | null, distance_meters?: number | null }
// 駐車場を選択すると、そこから名所までの徒歩時間(往復)を旅程に反映し、
// その日の以降の時刻を機械的にずらす(日付・訪問順序は変更しない)。
// parking_place_id が null の場合は選択を解除する。
// 駐車場の詳細(名称・距離等)はサーバー側で保存せず都度取得する方針のため、
// distance_metersはフロントエンドが直前に取得した検索結果からそのまま渡してもらう。
export async function POST(
  req: NextRequest,
  { params }: { params: { tripId: string } }
) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.day !== "number" || typeof body.trip_place_id !== "string") {
    return NextResponse.json({ error: "day と trip_place_id は必須です。" }, { status: 400 });
  }

  const trip = await getTrip(params.tripId);
  if (!trip || !trip.plan) {
    return NextResponse.json({ error: "旅行またはプランが見つかりません。" }, { status: 404 });
  }

  const day = trip.plan.days.find((d) => d.day === body.day);
  const stop = day?.stops.find((s) => s.trip_place_id === body.trip_place_id);
  if (!day || !stop) {
    return NextResponse.json({ error: "対象の訪問地が見つかりません。" }, { status: 404 });
  }

  if (body.parking_place_id === null) {
    const updated = await selectStopParking(
      trip.id,
      body.day,
      body.trip_place_id,
      null,
      null,
      recomputeDayWithParking
    );
    return NextResponse.json({ trip: updated });
  }

  if (typeof body.parking_place_id !== "string") {
    return NextResponse.json({ error: "parking_place_id が不正です。" }, { status: 400 });
  }

  const distanceMeters: number | null =
    typeof body.distance_meters === "number" ? body.distance_meters : null;
  const walkMinutes =
    distanceMeters != null
      ? Math.max(1, Math.ceil(distanceMeters / WALK_SPEED_METERS_PER_MINUTE))
      : 5; // 距離不明の場合は控えめに5分と仮定する

  const updated = await selectStopParking(
    trip.id,
    body.day,
    body.trip_place_id,
    body.parking_place_id,
    walkMinutes,
    recomputeDayWithParking
  );

  if (!updated) {
    return NextResponse.json({ error: "駐車場の選択に失敗しました。" }, { status: 500 });
  }

  return NextResponse.json({ trip: updated });
}
