import { NextRequest, NextResponse } from "next/server";
import { updateTripSettings } from "@/lib/store";
import { PaceMode, RoutePreference } from "@/lib/types";

// Vercel上でこのルートが静的にキャッシュされ、DBへの書き込みが画面に反映されない
// (SyntaxError: Unexpected end of JSON input等の症状につながる)問題を防ぐため、
// 常に動的(リクエストのたびに実行)にする。
export const dynamic = "force-dynamic";

const VALID_PACE: PaceMode[] = ["relaxed", "packed"];
const VALID_ROUTE_PREFERENCE: RoutePreference[] = ["fastest", "cheapest"];

// PATCH /api/trips/:tripId/settings
// { pace?: "relaxed"|"packed", route_preference?: "fastest"|"cheapest" }
// 出発地・到着地は日ごとの設定(/day-config)で扱う。
export async function PATCH(
  req: NextRequest,
  { params }: { params: { tripId: string } }
) {
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "リクエストが不正です。" }, { status: 400 });
  }

  if (body.pace !== undefined && !VALID_PACE.includes(body.pace)) {
    return NextResponse.json({ error: "活動量の値が不正です。" }, { status: 400 });
  }
  if (body.route_preference !== undefined && !VALID_ROUTE_PREFERENCE.includes(body.route_preference)) {
    return NextResponse.json({ error: "経路の希望の値が不正です。" }, { status: 400 });
  }

  const trip = await updateTripSettings(params.tripId, {
    pace: body.pace,
    route_preference: body.route_preference,
  });

  if (!trip) {
    return NextResponse.json({ error: "旅行が見つかりません。" }, { status: 404 });
  }

  return NextResponse.json({ trip });
}
