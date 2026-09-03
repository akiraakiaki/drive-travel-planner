// 施設の種類(Google Places APIの primaryType)に応じた、滞在時間の目安(分)を算出する。
// ユーザーが滞在時間を手動入力していない場所について、
// 「全て一律90分/45分」ではなく、施設の性質に応じた現実的な値を推定するために使用する。
//
// 値は一般的な観光の目安時間を参考にした概算であり、施設ごとの正確な所要時間を保証するものではない。
// primaryTypeが取得できない・テーブルに無い種類の場合は、活動ペースに応じた汎用デフォルトにフォールバックする。
import { PaceMode } from "./types";

// 「標準ペース」を基準にした、施設種別ごとの目安滞在時間(分)
const CATEGORY_BASE_MINUTES: Record<string, number> = {
  // 大型・滞在時間が長くなりやすい施設
  amusement_park: 240,
  theme_park: 240,
  water_park: 180,
  zoo: 150,
  aquarium: 120,
  national_park: 150,
  botanical_garden: 90,

  // 文化・展示施設
  museum: 90,
  planetarium: 60,
  art_gallery: 60,
  cultural_center: 60,

  // 観光名所・史跡
  tourist_attraction: 60,
  historical_landmark: 45,
  historical_place: 45,
  cultural_landmark: 45,
  monument: 30,
  observation_deck: 45,

  // 公園・庭園
  park: 60,
  garden: 45,
  hiking_area: 90,

  // 寺社・宗教施設(Googleの分類上、日本の寺社が hindu_temple 等に分類されることがあるため幅広くカバー)
  hindu_temple: 45,
  buddhist_temple: 45,
  church: 30,
  mosque: 30,
  synagogue: 30,
  place_of_worship: 45,

  // 商業施設
  shopping_mall: 90,
  department_store: 60,
  market: 45,

  // エンタメ・娯楽
  night_club: 120,
  casino: 120,
  bowling_alley: 90,
  movie_theater: 150,
  amusement_center: 90,
  karaoke: 90,

  // スポーツ・その他
  stadium: 150,
  spa: 90,
  beach: 90,

  // 飲食(基本は名所と一緒に立ち寄る想定のため短め)
  restaurant: 60,
  cafe: 30,
};

// 活動ペースに応じた倍率(標準を1.0とする)
const PACE_MULTIPLIER: Record<PaceMode, number> = {
  relaxed: 1.3,
  packed: 0.7,
};

// 15分単位に丸める
function roundTo15(minutes: number): number {
  return Math.max(15, Math.round(minutes / 15) * 15);
}

// primaryTypeが無い・テーブルに未登録の場合に使う汎用デフォルト(標準ペース基準)
const GENERIC_BASE_MINUTES = 60;

export function estimateStayMinutes(primaryType: string | null, pace: PaceMode): number {
  const base = (primaryType && CATEGORY_BASE_MINUTES[primaryType]) ?? GENERIC_BASE_MINUTES;
  return roundTo15(base * PACE_MULTIPLIER[pace]);
}
