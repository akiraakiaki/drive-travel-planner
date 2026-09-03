// 永続化された TripPlan(place_idと自社計算値のみ)に、表示直前にGoogleから都度取得した
// 名称・座標を合成し、TripPlanView を組み立てる。
//
// 【重要】この結果は絶対にdata/db.jsonへ保存しないこと。
// Google Maps Platformのポリシー上、place_id以外(名称・住所・座標等)は
// 恒久的にキャッシュ・保存してはならないため、表示のたびに毎回この関数を呼び直す。
import { getPlaceDetails } from "./places";
import { LatLng } from "./routes";
import {
  DayPlan,
  DayPlanView,
  PlaceInfo,
  PlanStop,
  PlanStopView,
  TripPlan,
  TripPlanView,
  UnassignedPlace,
  UnassignedPlaceView,
} from "./types";

// Googleマップで、出発地→各訪問地→到着地の経路を開くためのURLを組み立てる(Maps URLs方式、APIキー不要)。
// 座標だけでなくPlace IDも渡すことで、道路上の最寄り点に「スナップ」されて名所の位置とズレる問題を避ける。
// このURL自体も保存しない(呼び出しのたびに組み立てる)。
function buildGoogleMapsUrl(
  origin: { place_id: string; location: LatLng } | null,
  stops: { location: LatLng; place_id: string }[],
  destination: { place_id: string; location: LatLng } | null
): string | null {
  type Point = { location: LatLng; place_id: string | null };
  const points: Point[] = [];
  if (origin) points.push(origin);
  points.push(...stops);
  if (destination) points.push(destination);

  if (points.length < 2) return null;

  const fmt = (p: Point) => `${p.location.lat},${p.location.lng}`;
  const start = points[0];
  const end = points[points.length - 1];
  const waypoints = points.slice(1, -1);

  const params = new URLSearchParams({
    api: "1",
    origin: fmt(start),
    destination: fmt(end),
    travelmode: "driving",
  });
  if (start.place_id) params.set("origin_place_id", start.place_id);
  if (end.place_id) params.set("destination_place_id", end.place_id);
  if (waypoints.length > 0) {
    params.set("waypoints", waypoints.map(fmt).join("|"));
    if (waypoints.every((w) => w.place_id)) {
      params.set("waypoint_place_ids", waypoints.map((w) => w.place_id as string).join("|"));
    }
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

// place_idの重複取得を避けるための、リクエスト内限定の一時キャッシュ(保存はしない)
function makeResolver(preloaded?: Map<string, PlaceInfo | null>) {
  const cache = new Map<string, Promise<PlaceInfo | null>>(
    preloaded ? Array.from(preloaded.entries()).map(([k, v]) => [k, Promise.resolve(v)]) : []
  );
  return function resolve(placeId: string): Promise<PlaceInfo | null> {
    if (!cache.has(placeId)) {
      cache.set(placeId, getPlaceDetails(placeId).catch(() => null));
    }
    return cache.get(placeId)!;
  };
}

async function buildStopView(stop: PlanStop, resolve: (id: string) => Promise<PlaceInfo | null>): Promise<PlanStopView> {
  const info = await resolve(stop.place_id);

  let selectedParking = null;
  if (stop.selected_parking_place_id) {
    const parkingInfo = await resolve(stop.selected_parking_place_id);
    if (parkingInfo) {
      selectedParking = {
        place_id: parkingInfo.place_id,
        name: parkingInfo.name,
        address: parkingInfo.formatted_address,
        location:
          parkingInfo.latitude != null && parkingInfo.longitude != null
            ? { lat: parkingInfo.latitude, lng: parkingInfo.longitude }
            : null,
        distance_meters: null, // 選択時点の距離は保存していないため、再表示時は算出しない
        google_maps_uri: parkingInfo.google_maps_uri,
      };
    }
  }

  return {
    ...stop,
    name: info?.name ?? "(取得できませんでした)",
    location: info?.latitude != null && info?.longitude != null ? { lat: info.latitude, lng: info.longitude } : null,
    selected_parking: selectedParking,
  };
}

async function buildDayView(day: DayPlan, resolve: (id: string) => Promise<PlaceInfo | null>): Promise<DayPlanView> {
  const [startInfo, endInfo, stopViews] = await Promise.all([
    day.start_place_id ? resolve(day.start_place_id) : Promise.resolve(null),
    day.end_place_id ? resolve(day.end_place_id) : Promise.resolve(null),
    Promise.all(day.stops.map((s) => buildStopView(s, resolve))),
  ]);

  const startLoc =
    startInfo?.latitude != null && startInfo?.longitude != null
      ? { lat: startInfo.latitude, lng: startInfo.longitude }
      : null;
  const endLoc =
    endInfo?.latitude != null && endInfo?.longitude != null
      ? { lat: endInfo.latitude, lng: endInfo.longitude }
      : null;

  return {
    ...day,
    start_location_name: startInfo?.name ?? null,
    start_location: startLoc,
    stops: stopViews,
    end_location_name: endInfo?.name ?? null,
    end_location: endLoc,
    google_maps_url: buildGoogleMapsUrl(
      day.start_place_id && startLoc ? { place_id: day.start_place_id, location: startLoc } : null,
      stopViews.filter((s) => s.location).map((s) => ({ location: s.location as LatLng, place_id: s.place_id })),
      day.end_place_id && endLoc ? { place_id: day.end_place_id, location: endLoc } : null
    ),
  };
}

async function buildUnassignedView(
  u: UnassignedPlace,
  resolve: (id: string) => Promise<PlaceInfo | null>
): Promise<UnassignedPlaceView> {
  const info = await resolve(u.place_id);
  return { ...u, name: info?.name ?? "(取得できませんでした)" };
}

// preloadedPlaceInfo: 呼び出し元がすでに取得済みのPlaceInfoがあれば渡すことで、
// 同じplace_idに対する重複APIコールを避けられる(例: 行きたい場所一覧で取得済みの情報の使い回し)。
export async function buildPlanView(
  plan: TripPlan,
  preloadedPlaceInfo?: Map<string, PlaceInfo | null>
): Promise<TripPlanView> {
  const resolve = makeResolver(preloadedPlaceInfo);

  const [days, unassigned] = await Promise.all([
    Promise.all(plan.days.map((d) => buildDayView(d, resolve))),
    Promise.all(plan.unassigned.map((u) => buildUnassignedView(u, resolve))),
  ]);

  return { generated_at: plan.generated_at, days, unassigned };
}
