import { NextRequest, NextResponse } from "next/server";
import { getTrip, listTripPlaces, saveTripPlan } from "@/lib/store";
import { getPlaceDetails } from "@/lib/places";
import { generatePlan, PlannerNamedLocation, PlannerPlaceInput } from "@/lib/planner";
import { buildPlanView } from "@/lib/plan-view";

// Place IDから、プラン生成に必要な名称+座標を取得する。
// 取得できなければnull(=その地点は無しとしてプラン生成を続行する)。
const resolveCache = new Map<string, Promise<PlannerNamedLocation | null>>();
async function resolveNamedLocation(placeId: string | null): Promise<PlannerNamedLocation | null> {
  if (!placeId) return null;
  if (!resolveCache.has(placeId)) {
    resolveCache.set(
      placeId,
      (async () => {
        try {
          const info = await getPlaceDetails(placeId);
          if (info?.latitude != null && info?.longitude != null) {
            return { place_id: placeId, name: info.name, location: { lat: info.latitude, lng: info.longitude } };
          }
          return null;
        } catch {
          return null;
        }
      })()
    );
  }
  return resolveCache.get(placeId)!;
}

// POST /api/trips/:tripId/plan
// 登録済みの場所・旅程設定(日ごとの出発地/到着地/活動量/経路の希望/活動時間)をもとに、
// 営業時間・移動時間を考慮した巡回ルートを機械的に生成する(AIは使用しない)。
//
// 【保存するデータについて】 生成したプラン(trip.plan)には place_id と自社で計算した
// 時刻・料金などの数値のみを保存する。名称・座標・駐車場候補などGoogle由来の表示情報は
// 一切保存しない(Googleポリシー上、place_id以外は恒久キャッシュ禁止のため)。
// レスポンスは表示用に都度合成した TripPlanView を返す。
export async function POST(
  _req: NextRequest,
  { params }: { params: { tripId: string } }
) {
  const trip = await getTrip(params.tripId);
  if (!trip) {
    return NextResponse.json({ error: "旅行が見つかりません。" }, { status: 404 });
  }

  const tripPlaces = await listTripPlaces(trip.id);
  if (tripPlaces.length === 0) {
    return NextResponse.json(
      { error: "行きたい場所が1件も登録されていません。先に場所を追加してください。" },
      { status: 400 }
    );
  }

  // 各場所の位置情報・営業時間を取得(6章: 都度取得・恒久保存しない)
  const detailsResults = await Promise.allSettled(
    tripPlaces.map((p) => getPlaceDetails(p.google_place_id))
  );

  const placeInfoByPlaceId = new Map(
    tripPlaces.map((p, i) => {
      const result = detailsResults[i];
      return [p.google_place_id, result.status === "fulfilled" ? result.value : null] as const;
    })
  );

  const plannerPlaces: PlannerPlaceInput[] = tripPlaces.map((p) => {
    const info = placeInfoByPlaceId.get(p.google_place_id) ?? null;
    return {
      trip_place_id: p.id,
      place_id: p.google_place_id,
      name: info?.name ?? "(名称不明)",
      location:
        info?.latitude != null && info?.longitude != null
          ? { lat: info.latitude, lng: info.longitude }
          : null,
      periods: info?.opening_hours_periods ?? null,
      primary_type: info?.primary_type ?? null,
      user_defined_stay_duration: p.user_defined_stay_duration,
    };
  });

  const days = await Promise.all(
    trip.day_configs.map(async (dc) => {
      const [origin, destination] = await Promise.all([
        resolveNamedLocation(dc.origin_place_id),
        resolveNamedLocation(dc.destination_place_id),
      ]);
      return {
        date: dc.date,
        activity_start_time: dc.activity_start_time,
        activity_end_time: dc.activity_end_time,
        origin,
        destination,
      };
    })
  );

  const plan = await generatePlan({
    days,
    pace: trip.pace,
    routePreference: trip.route_preference,
    places: plannerPlaces,
  });

  const updatedTrip = await saveTripPlan(trip.id, plan);
  if (!updatedTrip) {
    return NextResponse.json({ error: "プランの保存に失敗しました。" }, { status: 500 });
  }

  // レスポンス用に、すでに取得済みのPlaceInfoを使い回して表示用Viewを組み立てる(重複APIコール回避)
  const planView = await buildPlanView(plan, placeInfoByPlaceId);

  return NextResponse.json({ trip: updatedTrip, plan: planView });
}
