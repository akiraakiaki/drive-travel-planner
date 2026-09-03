// Google Places API (New) を叩くサーバー側専用のラッパー。
// APIキーはここでしか参照しない = クライアントに露出しない(要件書22章)。
import { OpeningHoursForDate, OpeningHoursPeriod, PlaceInfo, PlaceSearchResult } from "./types";
import { weekdayOf, weekdayLabel, timeToMinutes } from "./date-utils";

const PLACES_BASE = "https://places.googleapis.com/v1";

export function getApiKey(): string {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    throw new Error(
      "GOOGLE_MAPS_API_KEY が未設定です。.env.local を確認してください。"
    );
  }
  return key;
}

// 5.1 場所検索: テキストクエリで候補を検索する
export async function searchPlaces(
  query: string,
  opts?: { languageCode?: string; regionCode?: string }
): Promise<PlaceSearchResult[]> {
  const res = await fetch(`${PLACES_BASE}/places:searchText`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": getApiKey(),
      // 必要なフィールドのみ要求する(課金・パフォーマンスの観点で必須)
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress",
    },
    body: JSON.stringify({
      textQuery: query,
      languageCode: opts?.languageCode ?? "ja",
      regionCode: opts?.regionCode ?? "JP",
      maxResultCount: 10,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Places検索に失敗しました (${res.status}): ${body}`);
  }

  const data = await res.json();
  const places = (data.places ?? []) as any[];

  return places.map((p) => ({
    place_id: p.id,
    name: p.displayName?.text ?? "(名称不明)",
    formatted_address: p.formattedAddress ?? "",
  }));
}

// 6. Google Places情報: 詳細(営業時間・座標・Google Mapsリンク等)を取得する
// 恒久保存はせず、必要になるたびにこの関数で都度取得する想定(6章・20章)。
export async function getPlaceDetails(
  placeId: string,
  opts?: { languageCode?: string; regionCode?: string }
): Promise<PlaceInfo | null> {
  const languageCode = opts?.languageCode ?? "ja";
  const regionCode = opts?.regionCode ?? "JP";

  const url = new URL(`${PLACES_BASE}/places/${encodeURIComponent(placeId)}`);
  url.searchParams.set("languageCode", languageCode);
  url.searchParams.set("regionCode", regionCode);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "X-Goog-Api-Key": getApiKey(),
      "X-Goog-FieldMask":
        "id,displayName,formattedAddress,location,regularOpeningHours.periods,googleMapsUri,primaryType",
    },
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Place詳細取得に失敗しました (${res.status}): ${body}`);
  }

  const p = await res.json();

  return {
    place_id: p.id,
    name: p.displayName?.text ?? "(名称不明)",
    formatted_address: p.formattedAddress ?? "",
    latitude: p.location?.latitude ?? null,
    longitude: p.location?.longitude ?? null,
    opening_hours_periods: p.regularOpeningHours?.periods ?? null,
    google_maps_uri: p.googleMapsUri ?? null,
    primary_type: p.primaryType ?? null,
  };
}

function fmtHm(h: number, m: number): string {
  return `${`${h}`.padStart(2, "0")}:${`${m}`.padStart(2, "0")}`;
}

// 指定した1日分の営業時間を、Googleの periods (曜日ベースの構造化データ) から計算する。
// 旅行日程の実日付に対応する曜日だけを算出することで、
// 「行きたい場所一覧」に旅程と関係ない曜日の営業時間まで表示してしまう問題を避ける。
export function getOpeningHoursForDate(
  periods: OpeningHoursPeriod[] | null,
  dateStr: string
): OpeningHoursForDate {
  const weekday_label = weekdayLabel(dateStr);

  if (!periods) {
    return { date: dateStr, weekday_label, status: "unknown", text: "営業時間情報なし" };
  }

  // Googleは「24時間営業」を、close を持たない単一のperiodで表現する
  if (periods.length === 1 && !periods[0].close) {
    return { date: dateStr, weekday_label, status: "open", text: "24時間営業" };
  }

  const weekday = weekdayOf(dateStr);
  const todays = periods.filter((p) => p.open.day === weekday);

  if (todays.length === 0) {
    return { date: dateStr, weekday_label, status: "closed", text: "定休日" };
  }

  const segments = todays.map((p) => {
    const openText = fmtHm(p.open.hour, p.open.minute);
    const closeText = p.close ? fmtHm(p.close.hour, p.close.minute) : "24:00";
    return `${openText}〜${closeText}`;
  });

  return {
    date: dateStr,
    weekday_label,
    status: "open",
    text: segments.join(" / "),
  };
}

// プラン生成アルゴリズム用: 指定日の開店/閉店時刻(分)の区間リストを返す。
// 深夜営業などで close.day が open.day と異なるケースは考慮せず、当日の分数として単純計算する(MVP範囲)。
export function getOpeningSegmentsMinutes(
  periods: OpeningHoursPeriod[] | null,
  dateStr: string
): { status: "open" | "closed" | "unknown"; segments: { openMin: number; closeMin: number }[] } {
  if (!periods) return { status: "unknown", segments: [] };

  if (periods.length === 1 && !periods[0].close) {
    return { status: "open", segments: [{ openMin: 0, closeMin: 24 * 60 }] };
  }

  const weekday = weekdayOf(dateStr);
  const todays = periods.filter((p) => p.open.day === weekday);

  if (todays.length === 0) return { status: "closed", segments: [] };

  const segments = todays.map((p) => ({
    openMin: p.open.hour * 60 + p.open.minute,
    closeMin: p.close ? p.close.hour * 60 + p.close.minute : 24 * 60,
  }));

  return { status: "open", segments };
}

// 月極(月極め)駐車場らしき名称を除外するためのキーワード
const MONTHLY_PARKING_KEYWORDS = ["月極", "月極め", "契約者専用", "契約車両専用"];

function looksLikeMonthlyParking(name: string): boolean {
  return MONTHLY_PARKING_KEYWORDS.some((kw) => name.includes(kw));
}

// 2点間の直線距離(m)をハーサイン公式で計算する
function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// 指定した座標の周辺にある駐車場を検索する(月極駐車場は除外)。名所からの距離が近い順に並べる。
// 恒久保存はせず、プラン生成のたびに都度取得する(6章の方針を駐車場情報にも適用)。
export async function searchNearbyParking(
  location: { lat: number; lng: number },
  radiusMeters = 400
): Promise<
  {
    place_id: string;
    name: string;
    address: string;
    location: { lat: number; lng: number } | null;
    distance_meters: number | null;
    google_maps_uri: string | null;
  }[]
> {
  try {
    const res = await fetch(`${PLACES_BASE}/places:searchNearby`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": getApiKey(),
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.formattedAddress,places.location,places.googleMapsUri",
      },
      body: JSON.stringify({
        includedTypes: ["parking"],
        maxResultCount: 10,
        languageCode: "ja",
        regionCode: "JP",
        rankPreference: "DISTANCE",
        locationRestriction: {
          circle: {
            center: { latitude: location.lat, longitude: location.lng },
            radius: radiusMeters,
          },
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`駐車場検索(searchNearby)に失敗しました (${res.status}): ${body}`);
      return [];
    }

    const data = await res.json();
    const places = (data.places ?? []) as any[];

    return places
      .map((p) => {
        const loc =
          p.location?.latitude != null && p.location?.longitude != null
            ? { lat: p.location.latitude, lng: p.location.longitude }
            : null;
        return {
          place_id: p.id,
          name: p.displayName?.text ?? "(名称不明)",
          address: p.formattedAddress ?? "",
          location: loc,
          distance_meters: loc ? Math.round(haversineMeters(location, loc)) : null,
          google_maps_uri: p.googleMapsUri ?? null,
        };
      })
      .filter((p) => !looksLikeMonthlyParking(p.name))
      .sort((a, b) => (a.distance_meters ?? Infinity) - (b.distance_meters ?? Infinity))
      .slice(0, 5);
  } catch (err) {
    console.error("駐車場検索中に例外が発生しました:", err);
    return [];
  }
}
