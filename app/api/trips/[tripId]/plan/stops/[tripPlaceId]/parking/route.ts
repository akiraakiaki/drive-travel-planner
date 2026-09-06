import { NextRequest, NextResponse } from "next/server";
import { getTrip } from "@/lib/store";
import { getPlaceDetails, searchNearbyParking } from "@/lib/places";

// Vercel上でこのルートが静的にキャッシュされ、DBへの書き込みが画面に反映されない
// (SyntaxError: Unexpected end of JSON input等の症状につながる)問題を防ぐため、
// 常に動的(リクエストのたびに実行)にする。
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" };

// GET /api/trips/:tripId/plan/stops/:tripPlaceId/parking
// 指定した訪問地の周辺駐車場を、その場でGoogle Places APIから検索して返す。
// Googleポリシー上、駐車場の名称・住所等はplace_id以外恒久保存できないため、
// 結果はDBに一切保存せず、都度この検索結果をそのまま画面に表示する。
export async function GET(
  _req: NextRequest,
  { params }: { params: { tripId: string; tripPlaceId: string } }
) {
  const trip = await getTrip(params.tripId);
  console.log(
    `[api] GET .../plan/stops/${params.tripPlaceId}/parking tripId=${params.tripId} tripFound=${!!trip} planFound=${!!trip?.plan}`
  );
  if (!trip || !trip.plan) {
    // 「プラン未作成時の404」がエッジ/CDN層でキャッシュされ、後でプランを作成しても
    // 古い404が返り続ける不具合を防ぐため、エラー応答にも明示的にno-storeを付ける。
    return NextResponse.json(
      { error: "旅行またはプランが見つかりません。" },
      { status: 404, headers: NO_STORE_HEADERS }
    );
  }

  let stopPlaceId: string | null = null;
  for (const day of trip.plan.days) {
    const stop = day.stops.find((s) => s.trip_place_id === params.tripPlaceId);
    if (stop) {
      stopPlaceId = stop.place_id;
      break;
    }
  }

  if (!stopPlaceId) {
    return NextResponse.json(
      { error: "対象の訪問地が見つかりません。" },
      { status: 404, headers: NO_STORE_HEADERS }
    );
  }

  const info = await getPlaceDetails(stopPlaceId).catch(() => null);
  if (!info?.latitude || !info?.longitude) {
    return NextResponse.json({ parking: [] }, { headers: NO_STORE_HEADERS });
  }

  const parking = await searchNearbyParking({ lat: info.latitude, lng: info.longitude });
  return NextResponse.json({ parking }, { headers: NO_STORE_HEADERS });
}
