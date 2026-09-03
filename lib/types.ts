// 要件定義書 20章「データモデル」に対応する型定義

// ドライブ専用アプリとして運用する(公共交通機関は将来拡張の余地として型は残すが、UI・アルゴリズムでは使用しない)
export type TransportMode = "car";
export type PaceMode = "relaxed" | "packed"; // ゆっくり / せかせか
export type RoutePreference = "fastest" | "cheapest"; // 速さ優先 / 安さ優先(有料道路回避)

// 旅行日ごとの活動可能時間・出発地/到着地(8章)。
// トリップ作成時に全日程分を daily_start/end_time から自動生成し、個別に上書きできるようにする。
// 出発地・到着地は日ごとに設定する(例: Day1の到着地をDay2の出発地として引き継ぐ運用を想定)。
export interface TripDayConfig {
  day: number; // 1始まりの日次インデックス
  date: string; // YYYY-MM-DD
  activity_start_time: string; // HH:mm
  activity_end_time: string; // HH:mm
  origin_place_id: string | null; // その日の出発地
  destination_place_id: string | null; // その日の到着地
}

export interface Trip {
  id: string;
  name: string;
  destination: string;
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
  daily_start_time: string; // HH:mm (全日共通のデフォルト値)
  daily_end_time: string; // HH:mm (全日共通のデフォルト値)
  transport_mode: TransportMode;
  pace: PaceMode; // 活動量設定(せかせか度)
  route_preference: RoutePreference; // 経路の希望(速さ優先/安さ優先)
  day_configs: TripDayConfig[]; // 日ごとの活動時間・出発地/到着地
  plan: TripPlan | null; // 直近に生成した旅程プラン
  created_at: string;
  updated_at: string;
}

export interface TripPlace {
  id: string;
  trip_id: string;
  google_place_id: string;
  user_defined_stay_duration: number | null; // 分単位。未設定ならnull(=ペースに応じた推定値を使う)
  day: number | null; // 何日目に割り当てるか。未割り当てはnull
  order: number | null; // その日の中での巡回順。未確定はnull
  created_at: string;
}

// Google Places の regularOpeningHours.periods をそのまま保持する構造(恒久保存はしない、都度取得)
export interface OpeningHoursPeriod {
  open: { day: number; hour: number; minute: number }; // day: 0=日曜〜6=土曜(Googleの定義に準拠)
  close?: { day: number; hour: number; minute: number }; // 無い場合は24時間営業
}

export interface LatLngValue {
  lat: number;
  lng: number;
}

// Google Places APIから都度取得する情報（恒久保存しない: 要件書6章・20章）
export interface PlaceInfo {
  place_id: string;
  name: string;
  formatted_address: string;
  latitude: number | null;
  longitude: number | null;
  opening_hours_periods: OpeningHoursPeriod[] | null;
  google_maps_uri: string | null;
  primary_type: string | null; // Google Placesの施設種別(例: museum, tourist_attraction)。滞在時間の目安算出に使用
}

// 検索結果の候補（5.1 場所検索）
export interface PlaceSearchResult {
  place_id: string;
  name: string;
  formatted_address: string;
}

// 特定の日付における営業時間の計算結果
export interface OpeningHoursForDate {
  date: string;
  weekday_label: string; // "月"〜"日"
  status: "open" | "closed" | "unknown"; // unknown = 営業時間データなし
  text: string; // 表示用テキスト(例: "8:00〜18:30" / "定休日" / "情報なし")
}

export interface TripPlaceWithInfo extends TripPlace {
  place_info: PlaceInfo | null; // 取得失敗時はnull(19章 エラー表示につなげる)
  hours_for_trip_dates: OpeningHoursForDate[]; // 旅行日程に対応する日付分だけの営業時間
}

// --- 旅程プラン(11〜17章) ---
//
// 【Google Maps Platformの利用規約対応について】
// Googleの各APIポリシーでは、"place_id" のみが無期限保存を許可されており、
// それ以外の内容(名称・住所・座標・写真・評価等)は原則キャッシュ・保存禁止(唯一の例外として
// 座標(緯度経度)はRoutes APIの結果に限り最大30日間の一時キャッシュのみ許可)。
// そのため、永続化する TripPlan / PlanStop / DayPlan には place_id と、
// 自社アルゴリズムで計算した時刻・料金など「独自の派生データ」のみを保持し、
// 名称・座標・駐車場候補などGoogle由来の表示情報は一切保存しない。
// 表示時には都度Google Places APIから解決し、PlanStopView / DayPlanView として組み立てる
// (lib/plan-view.ts)。

// 名所周辺の駐車場候補(月極駐車場は除外)。表示のたびに都度検索するため保存しない。
export interface ParkingCandidate {
  place_id: string;
  name: string;
  address: string;
  location: LatLngValue | null;
  distance_meters: number | null; // 名所からの直線距離
  google_maps_uri: string | null;
}

// 永続化される訪問地データ。Google由来の表示情報(名称・座標)は含まない。
export interface PlanStop {
  trip_place_id: string;
  place_id: string; // 無期限保存可(Googleポリシー上の例外)
  arrival_time: string; // HH:mm
  departure_time: string; // HH:mm
  stay_minutes: number;
  travel_minutes_from_prev: number | null; // 直前地点からの移動時間(拠点からの初回移動も含む)
  toll_cash_yen: number | null; // 直前地点からの通行料金(現金・通行券想定)。有料道路を使わない場合は0
  toll_etc_yen: number | null; // 直前地点からの通行料金(ETC)。有料道路を使わない場合は0
  wait_minutes: number; // 開店待ちで生じた待ち時間
  hours_uncertain: boolean; // 営業時間が不明なまま組み込んだ場合true
  selected_parking_place_id: string | null; // ユーザーが選んだ駐車場のPlace ID(未選択ならnull)
  parking_walk_minutes: number | null; // 選択した駐車場から名所までの徒歩時間(片道)
}

// 表示用に、Google由来の情報を都度解決して合成した訪問地データ(保存しない)
export interface PlanStopView extends PlanStop {
  name: string;
  location: LatLngValue | null;
  selected_parking: ParkingCandidate | null;
}

// 永続化される1日分のプラン。Google由来の表示情報(名称・座標)は含まない。
export interface DayPlan {
  day: number;
  date: string;
  start_time: string; // HH:mm (その日の活動開始時刻。出発地を出る時刻の表示に使う)
  start_place_id: string | null; // 出発地のPlace ID(無期限保存可)
  stops: PlanStop[];
  end_place_id: string | null; // 到着地のPlace ID(無期限保存可)
  travel_minutes_to_end: number | null; // 最後の訪問地(または出発地)から到着地までの移動時間
  toll_cash_yen_to_end: number | null; // 到着地までの通行料金(現金)
  toll_etc_yen_to_end: number | null; // 到着地までの通行料金(ETC)
  arrival_at_end_time: string | null; // 到着地への到着予定時刻
}

// 表示用に、Google由来の情報を都度解決して合成した1日分のプラン(保存しない)
export interface DayPlanView extends Omit<DayPlan, "stops"> {
  start_location_name: string | null;
  start_location: LatLngValue | null;
  stops: PlanStopView[];
  end_location_name: string | null;
  end_location: LatLngValue | null;
  google_maps_url: string | null; // 都度組み立てるリンク(保存しない)
}

export interface UnassignedPlace {
  trip_place_id: string;
  place_id: string;
  reason: string;
}

// 表示用(名称を都度解決して付与)
export interface UnassignedPlaceView extends UnassignedPlace {
  name: string;
}

// 永続化されるプラン全体
export interface TripPlan {
  generated_at: string;
  days: DayPlan[];
  unassigned: UnassignedPlace[];
}

// 表示用に合成したプラン全体(保存しない)
export interface TripPlanView {
  generated_at: string;
  days: DayPlanView[];
  unassigned: UnassignedPlaceView[];
}
