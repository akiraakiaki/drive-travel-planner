import { NextRequest, NextResponse } from "next/server";
import { getTrip, listTripPlaces } from "@/lib/store";
import { getPlaceDetails, getOpeningHoursForDate } from "@/lib/places";
import { getJapaneseHolidaysInRange } from "@/lib/holidays";
import { enumerateDates } from "@/lib/date-utils";
import { buildPlanView } from "@/lib/plan-view";
import { PlaceInfo, TripPlaceWithInfo } from "@/lib/types";

export async function GET(
  _req: NextRequest,
  { params }: { params: { tripId: string } }
) {
  const trip = getTrip(params.tripId);
  if (!trip) {
    return NextResponse.json({ error: "旅行が見つかりません。" }, { status: 404 });
  }

  const places = listTripPlaces(trip.id);
  const tripDates = enumerateDates(trip.start_date, trip.end_date);

  // 6章: Google由来の情報は保存せず、都度取得する。
  // 1件の取得失敗が全体を止めないよう Promise.allSettled で処理する(19章 エラー表示につなげる)。
  const results = await Promise.allSettled(
    places.map((p) => getPlaceDetails(p.google_place_id))
  );

  // 同じPlace IDへの重複APIコールを避けるため、ここで取得した結果はこのリクエスト内で使い回す
  // (プランのplace_idと行きたい場所一覧のplace_idは大抵重複するため)。保存はしない。
  const placeInfoCache = new Map<string, PlaceInfo | null>();
  places.forEach((p, i) => {
    const result = results[i];
    placeInfoCache.set(p.google_place_id, result.status === "fulfilled" ? result.value : null);
  });

  const placesWithInfo: TripPlaceWithInfo[] = places.map((p) => {
    const info = placeInfoCache.get(p.google_place_id) ?? null;

    // 旅行日程に対応する日付分だけ、営業時間を計算する(全曜日ではなく実際の日付ベース)
    const hoursForTripDates = tripDates.map((date) =>
      getOpeningHoursForDate(info?.opening_hours_periods ?? null, date)
    );

    return { ...p, place_info: info, hours_for_trip_dates: hoursForTripDates };
  });

  // 旅行期間中に祝日が含まれる場合、営業時間が通常と異なる可能性がある旨を知らせる
  const holidays = await getJapaneseHolidaysInRange(trip.start_date, trip.end_date);

  // 日ごとの出発地・到着地の表示用情報を取得する(同じPlace IDが複数日にまたがることが多いのでキャッシュする)
  function fetchCached(placeId: string): Promise<PlaceInfo | null> {
    if (placeInfoCache.has(placeId)) return Promise.resolve(placeInfoCache.get(placeId)!);
    return getPlaceDetails(placeId)
      .then((info) => {
        placeInfoCache.set(placeId, info);
        return info;
      })
      .catch(() => null);
  }

  const dayPlaceInfo: Record<number, { origin: PlaceInfo | null; destination: PlaceInfo | null }> = {};
  await Promise.all(
    trip.day_configs.map(async (dc) => {
      const [origin, destination] = await Promise.all([
        dc.origin_place_id ? fetchCached(dc.origin_place_id) : Promise.resolve(null),
        dc.destination_place_id ? fetchCached(dc.destination_place_id) : Promise.resolve(null),
      ]);
      dayPlaceInfo[dc.day] = { origin, destination };
    })
  );

  // 生成済みプランがあれば、表示用にGoogle由来の情報を都度合成する(保存はしない)
  const planView = trip.plan ? await buildPlanView(trip.plan, placeInfoCache) : null;

  return NextResponse.json({
    trip,
    places: placesWithInfo,
    holidays,
    day_place_info: dayPlaceInfo,
    plan_view: planView,
  });
}
