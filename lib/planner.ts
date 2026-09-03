// 旅程プラン生成アルゴリズム(要件定義書11〜17章の考え方をそのままロジック化したもの)。
// AIは一切使わず、営業時間・活動時間・移動時間から機械的に組み立てる決定的なアルゴリズム。
// ドライブ専用アプリのため、移動時間は常に自動車(DRIVE)ベースで計算する。
// 各日は、その日ごとに設定された「出発地」から始まり「到着地」で終わる
// (例: Day1の到着地をDay2の出発地として引き継ぐ運用を想定。出発地・到着地が未設定の日は省略される)。
//
// 基本方針(14章のInput/Processに対応):
//   各日について、現在時刻・現在地から「訪問可能(営業時間内かつ活動時間内)な場所」を洗い出し、
//   その中から「閉店時刻が最も早い(=締切が近い)場所」を優先して組み込んでいく。
//   これは12章の例(A:8-12, B:10-18, C:16-22 → A→B→Cの順が良い)をそのまま一般化した貪欲法。
import { getOpeningSegmentsMinutes } from "./places";
import { getTravelMinutes, getTollEstimate, LatLng } from "./routes";
import { minutesToTime, timeToMinutes } from "./date-utils";
import { estimateStayMinutes } from "./stay-duration";
import {
  DayPlan,
  OpeningHoursPeriod,
  PaceMode,
  PlanStop,
  RoutePreference,
  TripPlan,
  UnassignedPlace,
} from "./types";

export interface PlannerPlaceInput {
  trip_place_id: string;
  place_id: string;
  name: string;
  location: LatLng | null; // 取得できていない場合はnull
  periods: OpeningHoursPeriod[] | null;
  primary_type: string | null; // Google Placesの施設種別(滞在時間の目安算出に使用)
  user_defined_stay_duration: number | null;
}

export interface PlannerNamedLocation {
  place_id: string;
  name: string;
  location: LatLng;
}

export interface PlannerDayConfig {
  date: string;
  activity_start_time: string;
  activity_end_time: string;
  origin: PlannerNamedLocation | null; // その日の出発地
  destination: PlannerNamedLocation | null; // その日の到着地
}

export interface GeneratePlanInput {
  days: PlannerDayConfig[];
  pace: PaceMode;
  routePreference: RoutePreference; // 速さ優先/安さ優先(有料道路回避)
  places: PlannerPlaceInput[];
}

// 活動量設定に応じて、移動時間に余裕(駐車・休憩バッファ)を加える。
// ゆっくり: 移動時間を1.2倍+駐車等の余裕を確保。せかせか: 実測値に近い形で計算。
function applyPaceBuffer(rawMinutes: number, pace: PaceMode): number {
  const multiplier = pace === "relaxed" ? 1.2 : 1.0;
  const parkingBuffer = pace === "relaxed" ? 5 : 0;
  return Math.round(rawMinutes * multiplier) + parkingBuffer;
}

interface Candidate {
  place: PlannerPlaceInput;
  travelMinutes: number;
  visitStart: number;
  visitEnd: number;
  deadline: number; // その訪問区間の閉店時刻(分)
  waitMinutes: number;
  uncertain: boolean;
}

export async function generatePlan(input: GeneratePlanInput): Promise<TripPlan> {
  const unassigned = [...input.places];
  const days: DayPlan[] = [];
  const routeOptions = { avoidTolls: input.routePreference === "cheapest" };

  for (let i = 0; i < input.days.length; i++) {
    const dayConfig = input.days[i];
    const dayEndMinutes = timeToMinutes(dayConfig.activity_end_time);
    let currentTime = timeToMinutes(dayConfig.activity_start_time);
    // その日は出発地からスタートする(出発地未設定なら「現在地なし」として最初の1件は移動時間0とする)
    let currentLocation: LatLng | null = dayConfig.origin?.location ?? null;

    const stops: PlanStop[] = [];

    // その日の活動時間が尽きる、または組み込める場所がなくなるまで繰り返す
    // eslint-disable-next-line no-constant-condition
    while (true) {
      let best: Candidate | null = null;
      const rejections: string[] = [];

      for (const place of unassigned) {
        if (!place.location) {
          rejections.push(`${place.name}: 位置情報なし`);
          continue; // 位置情報が無い場所は今回スキップ(unassignedに残る)
        }

        const stayMinutes =
          place.user_defined_stay_duration ?? estimateStayMinutes(place.primary_type, input.pace);

        // 移動時間を算出(出発地/直前地点が無い最初の1件目は移動時間0として扱う)
        let travelMinutes = 0;
        if (currentLocation) {
          const raw = await getTravelMinutes(currentLocation, place.location, routeOptions);
          if (raw === null) {
            rejections.push(`${place.name}: 移動時間を取得できなかった(Routes API失敗)`);
            continue; // 移動時間が取得できない場所は今回のラウンドでは候補にしない
          }
          travelMinutes = applyPaceBuffer(raw, input.pace);
        }

        const arrival = currentTime + travelMinutes;
        const opening = getOpeningSegmentsMinutes(place.periods, dayConfig.date);

        if (opening.status === "closed") {
          rejections.push(`${place.name}: この日(${dayConfig.date})は定休日`);
          continue; // その日は定休日 → この日は候補から除外
        }

        let matched: { openMin: number; closeMin: number } | null = null;
        let uncertain = false;

        if (opening.status === "unknown") {
          // 営業時間が不明な場所は、活動時間内であれば「不確実」フラグ付きで候補にする
          matched = { openMin: 0, closeMin: dayEndMinutes };
          uncertain = true;
        } else {
          matched =
            opening.segments.find((seg) => {
              const visitStart = Math.max(arrival, seg.openMin);
              const visitEnd = visitStart + stayMinutes;
              return visitEnd <= seg.closeMin;
            }) ?? null;
        }

        if (!matched) {
          rejections.push(
            `${place.name}: 到着予定${minutesToTime(arrival)}時点で営業時間内に滞在(${stayMinutes}分)を収められなかった`
          );
          continue;
        }

        const visitStart = Math.max(arrival, matched.openMin);
        const visitEnd = visitStart + stayMinutes;

        if (visitEnd > dayEndMinutes) {
          rejections.push(`${place.name}: 活動終了時刻(${dayConfig.activity_end_time})を超える`);
          continue; // その日の活動時間を超える場合は不可
        }

        const candidate: Candidate = {
          place,
          travelMinutes,
          visitStart,
          visitEnd,
          deadline: matched.closeMin,
          waitMinutes: visitStart - arrival,
          uncertain,
        };

        // 締切(閉店時刻)が早いものを優先。同着なら移動時間が短い方を優先。
        if (
          !best ||
          candidate.deadline < best.deadline ||
          (candidate.deadline === best.deadline && candidate.travelMinutes < best.travelMinutes)
        ) {
          best = candidate;
        }
      }

      if (!best) {
        if (stops.length === 0 && unassigned.length > 0) {
          // その日1件も組み込めなかった場合、原因調査用にターミナルへ理由を出力する
          console.error(
            `[planner] Day${i + 1}(${dayConfig.date}) に1件も組み込めませんでした。理由:\n` +
              rejections.map((r) => `  - ${r}`).join("\n")
          );
        }
        break; // これ以上この日に組み込める場所がない
      }

      // 通行料金は「候補として検討した全ルート」ではなく「実際に採用された区間」だけ取得する
      // (課金レートが高いリクエストのため、探索中の候補全てには使わない)。
      // 有料道路を回避する設定(安さ優先)の場合は0円として扱い、APIは呼ばない。
      // best.place.location は、候補探索の時点で location が無い場所は既に除外されているため
      // 実質的には必ず値が入っているはずだが、型上は LatLng | null のままなので、
      // ここでも明示的にnullチェックしてから使う(取得できない場合は「不明」のまま扱う)。
      let tollCash: number | null = null;
      let tollEtc: number | null = null;
      if (currentLocation && best.place.location) {
        if (routeOptions.avoidTolls) {
          tollCash = 0;
          tollEtc = 0;
        } else {
          const toll = await getTollEstimate(currentLocation, best.place.location);
          tollCash = toll.cash_yen;
          tollEtc = toll.etc_yen;
        }
      }

      stops.push({
        trip_place_id: best.place.trip_place_id,
        place_id: best.place.place_id,
        arrival_time: minutesToTime(best.visitStart - best.waitMinutes),
        departure_time: minutesToTime(best.visitEnd),
        stay_minutes: best.visitEnd - best.visitStart,
        travel_minutes_from_prev: currentLocation ? best.travelMinutes : null,
        toll_cash_yen: tollCash,
        toll_etc_yen: tollEtc,
        wait_minutes: best.waitMinutes,
        hours_uncertain: best.uncertain,
        selected_parking_place_id: null,
        parking_walk_minutes: null,
      });

      currentTime = best.visitEnd;
      currentLocation = best.place.location;

      const idx = unassigned.findIndex((p) => p.trip_place_id === best!.place.trip_place_id);
      if (idx >= 0) unassigned.splice(idx, 1);
    }

    // 最後の訪問地(訪問地が無ければ出発地)から到着地までの移動を計算する
    let travelToEnd: number | null = null;
    let arrivalAtEnd: string | null = null;
    let tollCashToEnd: number | null = null;
    let tollEtcToEnd: number | null = null;
    if (dayConfig.destination) {
      if (currentLocation) {
        const raw = await getTravelMinutes(currentLocation, dayConfig.destination.location, routeOptions);
        if (raw !== null) {
          travelToEnd = applyPaceBuffer(raw, input.pace);
          arrivalAtEnd = minutesToTime(currentTime + travelToEnd);

          if (routeOptions.avoidTolls) {
            tollCashToEnd = 0;
            tollEtcToEnd = 0;
          } else {
            const toll = await getTollEstimate(currentLocation, dayConfig.destination.location);
            tollCashToEnd = toll.cash_yen;
            tollEtcToEnd = toll.etc_yen;
          }
        } else {
          console.error(`[planner] Day${i + 1}(${dayConfig.date}): 到着地までの移動時間を取得できませんでした。`);
        }
      } else {
        travelToEnd = null;
      }
    }

    days.push({
      day: i + 1,
      date: dayConfig.date,
      start_time: dayConfig.activity_start_time,
      start_place_id: dayConfig.origin?.place_id ?? null,
      stops,
      end_place_id: dayConfig.destination?.place_id ?? null,
      travel_minutes_to_end: travelToEnd,
      toll_cash_yen_to_end: tollCashToEnd,
      toll_etc_yen_to_end: tollEtcToEnd,
      arrival_at_end_time: arrivalAtEnd,
    });
  }

  const unassignedResult: UnassignedPlace[] = unassigned.map((p) => ({
    trip_place_id: p.trip_place_id,
    place_id: p.place_id,
    reason: !p.location
      ? "位置情報を取得できませんでした"
      : "営業時間内かつ活動時間内に組み込めませんでした(17章: 日程・条件の見直しをおすすめします)",
  }));

  return {
    generated_at: new Date().toISOString(),
    days,
    unassigned: unassignedResult,
  };
}

// 駐車場選択の結果を反映して、その日のタイムラインを最初から計算し直す純粋関数。
// travel_minutes_from_prev / stay_minutes / wait_minutes / travel_minutes_to_end は
// (駐車場選択の影響を受けない)不変の基礎データとして扱い、そこに駐車場の徒歩往復時間だけを
// 上乗せして時刻をずらす(日付・訪問順序・訪問先の変更は行わない)。
export function recomputeDayWithParking(day: DayPlan): DayPlan {
  let current = timeToMinutes(day.start_time);

  const newStops: PlanStop[] = day.stops.map((stop) => {
    if (stop.travel_minutes_from_prev != null) current += stop.travel_minutes_from_prev;

    const walk = stop.selected_parking_place_id ? stop.parking_walk_minutes ?? 0 : 0;
    current += walk; // 駐車場から名所までの徒歩(往路)

    const arrival = current;
    current += stop.wait_minutes;
    current += stop.stay_minutes;
    const departure = current;

    current += walk; // 名所から駐車場までの徒歩(復路)

    return { ...stop, arrival_time: minutesToTime(arrival), departure_time: minutesToTime(departure) };
  });

  let arrivalAtEnd = day.arrival_at_end_time;
  if (day.travel_minutes_to_end != null) {
    arrivalAtEnd = minutesToTime(current + day.travel_minutes_to_end);
  }

  return { ...day, stops: newStops, arrival_at_end_time: arrivalAtEnd };
}
