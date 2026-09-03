// data/db.json への読み書きを介した、旅行・場所データの操作関数群。
import { DayPlan, PaceMode, RoutePreference, Trip, TripDayConfig, TripPlace, TripPlan } from "./types";
import { readDb, writeDb } from "./db";
import { enumerateDates } from "./date-utils";

function nowIso() {
  return new Date().toISOString();
}

function newId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function buildDayConfigs(
  startDate: string,
  endDate: string,
  dailyStart: string,
  dailyEnd: string
): TripDayConfig[] {
  return enumerateDates(startDate, endDate).map((date, i) => ({
    day: i + 1,
    date,
    activity_start_time: dailyStart,
    activity_end_time: dailyEnd,
    origin_place_id: null,
    destination_place_id: null,
  }));
}

// 旅程設定機能を追加する前に作成された旧データ(day_configs等が存在しない)、
// 公共交通機関モードが存在した頃の旧データ、単一の「拠点」/トリップ単位の出発地・到着地だった頃の
// 旧データを、読み込み時に自動補完する。data/db.json を直接書き換えずに済むための互換レイヤー。
// ドライブ専用アプリのため transport_mode は常に "car"。
function normalizeTrip(trip: Trip): Trip {
  const daily_start_time = trip.daily_start_time ?? "09:00";
  const daily_end_time = trip.daily_end_time ?? "18:00";

  let day_configs =
    trip.day_configs ?? buildDayConfigs(trip.start_date, trip.end_date, daily_start_time, daily_end_time);

  // 旧データ(day単位ではなくトリップ単位で出発地/到着地/拠点を持っていた頃のもの)は、
  // 初日の出発地・最終日の到着地として引き継ぐ
  const legacy = trip as unknown as {
    origin_place_id?: string | null;
    destination_place_id?: string | null;
    base_place_id?: string | null;
  };
  const legacyOrigin = legacy.origin_place_id ?? legacy.base_place_id ?? null;
  const legacyDestination = legacy.destination_place_id ?? legacy.base_place_id ?? null;

  day_configs = day_configs.map((dc, i) => ({
    ...dc,
    origin_place_id:
      dc.origin_place_id !== undefined && dc.origin_place_id !== null
        ? dc.origin_place_id
        : i === 0
        ? legacyOrigin
        : null,
    destination_place_id:
      dc.destination_place_id !== undefined && dc.destination_place_id !== null
        ? dc.destination_place_id
        : i === day_configs.length - 1
        ? legacyDestination
        : null,
  }));

  return {
    ...trip,
    daily_start_time,
    daily_end_time,
    transport_mode: "car",
    pace: trip.pace ?? "relaxed",
    route_preference: trip.route_preference ?? "fastest",
    day_configs,
    plan: trip.plan ?? null,
  };
}

export function createTrip(input: {
  name: string;
  destination: string;
  start_date: string;
  end_date: string;
  daily_start_time?: string;
  daily_end_time?: string;
}): Trip {
  const db = readDb();

  const daily_start_time = input.daily_start_time ?? "09:00";
  const daily_end_time = input.daily_end_time ?? "18:00";

  const trip: Trip = {
    id: newId("trip"),
    name: input.name,
    destination: input.destination,
    start_date: input.start_date,
    end_date: input.end_date,
    daily_start_time,
    daily_end_time,
    transport_mode: "car",
    pace: "relaxed",
    route_preference: "fastest",
    day_configs: buildDayConfigs(input.start_date, input.end_date, daily_start_time, daily_end_time),
    plan: null,
    created_at: nowIso(),
    updated_at: nowIso(),
  };

  db.trips.push(trip);
  db.tripPlaces[trip.id] = [];
  writeDb(db);

  return trip;
}

export function listTrips(): Trip[] {
  const db = readDb();
  return [...db.trips].map(normalizeTrip).sort((a, b) => (a.start_date < b.start_date ? -1 : 1));
}

export function getTrip(tripId: string): Trip | undefined {
  const db = readDb();
  const trip = db.trips.find((t) => t.id === tripId);
  return trip ? normalizeTrip(trip) : undefined;
}

export function listTripPlaces(tripId: string): TripPlace[] {
  const db = readDb();
  return db.tripPlaces[tripId] ?? [];
}

// 5.2 場所の重複登録防止: 同一 place_id は複数回登録できない
export function addTripPlace(
  tripId: string,
  googlePlaceId: string
): { ok: true; place: TripPlace } | { ok: false; reason: "duplicate" | "trip_not_found" } {
  const db = readDb();

  if (!db.trips.some((t) => t.id === tripId)) {
    return { ok: false, reason: "trip_not_found" };
  }

  const existing = db.tripPlaces[tripId] ?? [];
  if (existing.some((p) => p.google_place_id === googlePlaceId)) {
    return { ok: false, reason: "duplicate" };
  }

  const place: TripPlace = {
    id: newId("place"),
    trip_id: tripId,
    google_place_id: googlePlaceId,
    user_defined_stay_duration: null,
    day: null,
    order: null,
    created_at: nowIso(),
  };

  db.tripPlaces[tripId] = [...existing, place];
  writeDb(db);

  return { ok: true, place };
}

export function removeTripPlace(tripId: string, tripPlaceId: string): boolean {
  const db = readDb();
  const existing = db.tripPlaces[tripId];
  if (!existing) return false;

  const next = existing.filter((p) => p.id !== tripPlaceId);
  const changed = next.length !== existing.length;

  db.tripPlaces[tripId] = next;
  writeDb(db);

  return changed;
}

export function updateTripPlaceStayDuration(
  tripId: string,
  tripPlaceId: string,
  minutes: number
): boolean {
  const db = readDb();
  const existing = db.tripPlaces[tripId];
  if (!existing) return false;

  const idx = existing.findIndex((p) => p.id === tripPlaceId);
  if (idx === -1) return false;

  existing[idx] = { ...existing[idx], user_defined_stay_duration: minutes };
  db.tripPlaces[tripId] = [...existing];
  writeDb(db);

  return true;
}

// 旅程設定(活動量・経路の希望)を更新する
export function updateTripSettings(
  tripId: string,
  input: { pace?: PaceMode; route_preference?: RoutePreference }
): Trip | null {
  const db = readDb();
  const idx = db.trips.findIndex((t) => t.id === tripId);
  if (idx === -1) return null;

  const trip = normalizeTrip(db.trips[idx]);
  const updated: Trip = {
    ...trip,
    pace: input.pace ?? trip.pace,
    route_preference: input.route_preference ?? trip.route_preference,
    updated_at: nowIso(),
  };

  db.trips[idx] = updated;
  writeDb(db);
  return updated;
}

// 日ごとの活動時間・出発地/到着地(8章)を更新する。
// ある日の到着地を変更すると、翌日の出発地が未設定または今回の変更前の到着地と同じだった場合、
// 自動的に翌日の出発地として引き継ぐ(例: Day1到着地 = Day2出発地)。
export function updateTripDayConfig(
  tripId: string,
  day: number,
  input: {
    activity_start_time?: string;
    activity_end_time?: string;
    origin_place_id?: string | null;
    destination_place_id?: string | null;
  }
): Trip | null {
  const db = readDb();
  const idx = db.trips.findIndex((t) => t.id === tripId);
  if (idx === -1) return null;

  const trip = normalizeTrip(db.trips[idx]);
  const dayIdx = trip.day_configs.findIndex((dc) => dc.day === day);
  if (dayIdx === -1) return null;

  const prevDestination = trip.day_configs[dayIdx].destination_place_id;
  const dayConfigs = [...trip.day_configs];
  dayConfigs[dayIdx] = {
    ...dayConfigs[dayIdx],
    activity_start_time: input.activity_start_time ?? dayConfigs[dayIdx].activity_start_time,
    activity_end_time: input.activity_end_time ?? dayConfigs[dayIdx].activity_end_time,
    origin_place_id:
      input.origin_place_id !== undefined ? input.origin_place_id : dayConfigs[dayIdx].origin_place_id,
    destination_place_id:
      input.destination_place_id !== undefined
        ? input.destination_place_id
        : dayConfigs[dayIdx].destination_place_id,
  };

  // 到着地が変更され、かつ翌日が存在する場合、翌日の出発地を自動的に引き継ぐ
  // (翌日の出発地が未設定、または変更前のこの日の到着地と一致していた場合のみ上書きする)
  if (
    input.destination_place_id !== undefined &&
    input.destination_place_id !== prevDestination &&
    dayIdx + 1 < dayConfigs.length
  ) {
    const nextDay = dayConfigs[dayIdx + 1];
    if (nextDay.origin_place_id === null || nextDay.origin_place_id === prevDestination) {
      dayConfigs[dayIdx + 1] = { ...nextDay, origin_place_id: input.destination_place_id };
    }
  }

  const updated: Trip = { ...trip, day_configs: dayConfigs, updated_at: nowIso() };
  db.trips[idx] = updated;
  writeDb(db);
  return updated;
}

// 生成した旅程プランを保存する
export function saveTripPlan(tripId: string, plan: TripPlan): Trip | null {
  const db = readDb();
  const idx = db.trips.findIndex((t) => t.id === tripId);
  if (idx === -1) return null;

  const updated: Trip = { ...normalizeTrip(db.trips[idx]), plan, updated_at: nowIso() };
  db.trips[idx] = updated;
  writeDb(db);
  return updated;
}

// 特定の訪問地について駐車場を選択(またはクリア)し、その日のタイムラインを再計算して保存する。
// Google由来の駐車場情報(名称・住所等)は保存せず、Place IDのみを保存する
// (Googleポリシー上、place_idのみが無期限保存可能なため)。
export function selectStopParking(
  tripId: string,
  day: number,
  tripPlaceId: string,
  parkingPlaceId: string | null,
  walkMinutes: number | null,
  recompute: (day: DayPlan) => DayPlan
): Trip | null {
  const db = readDb();
  const idx = db.trips.findIndex((t) => t.id === tripId);
  if (idx === -1) return null;

  const trip = normalizeTrip(db.trips[idx]);
  if (!trip.plan) return null;

  const dayIdx = trip.plan.days.findIndex((d) => d.day === day);
  if (dayIdx === -1) return null;

  const stopIdx = trip.plan.days[dayIdx].stops.findIndex((s) => s.trip_place_id === tripPlaceId);
  if (stopIdx === -1) return null;

  const days = [...trip.plan.days];
  const stops = [...days[dayIdx].stops];
  stops[stopIdx] = {
    ...stops[stopIdx],
    selected_parking_place_id: parkingPlaceId,
    parking_walk_minutes: walkMinutes,
  };
  days[dayIdx] = recompute({ ...days[dayIdx], stops });

  const updated: Trip = {
    ...trip,
    plan: { ...trip.plan, days },
    updated_at: nowIso(),
  };
  db.trips[idx] = updated;
  writeDb(db);
  return updated;
}
