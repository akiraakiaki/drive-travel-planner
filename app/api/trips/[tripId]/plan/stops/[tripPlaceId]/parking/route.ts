import { NextRequest, NextResponse } from "next/server";
import { getTrip } from "@/lib/store";
import { getPlaceDetails, searchNearbyParking } from "@/lib/places";

// GET /api/trips/:tripId/plan/stops/:tripPlaceId/parking
// 指定した訪問地の周辺駐車場を、その場でGoogle Places APIから検索して返す。
// Googleポリシー上、駐車場の名称・住所等はplace_id以外恒久保存できないため、
// 結果はdata/db.jsonに一切保存せず、都度この検索結果をそのまま画面に表示する。
export async function GET(
  _req: NextRequest,
  { params }: { params: { tripId: string; tripPlaceId: string } }
) {
  const trip = getTrip(params.tripId);
  if (!trip || !trip.plan) {
    return NextResponse.json({ error: "旅行またはプランが見つかりません。" }, { status: 404 });
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
    return NextResponse.json({ error: "対象の訪問地が見つかりません。" }, { status: 404 });
  }

  const info = await getPlaceDetails(stopPlaceId).catch(() => null);
  if (!info?.latitude || !info?.longitude) {
    return NextResponse.json({ parking: [] });
  }

  const parking = await searchNearbyParking({ lat: info.latitude, lng: info.longitude });
  return NextResponse.json({ parking });
}
