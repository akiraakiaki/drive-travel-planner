// 内閣府の祝日データを公開している非公式API(holidays-jp)から祝日一覧を取得する。
// このAPIはキー不要・無料で、日付(YYYY-MM-DD)→祝日名 のマップを返す。
// 取得に失敗しても旅行プランナー自体は使えるべきなので、失敗時は空配列を返して握りつぶす。
const HOLIDAYS_API = "https://holidays-jp.github.io/api/v1/date.json";

export interface Holiday {
  date: string; // YYYY-MM-DD
  name: string;
}

let cache: Record<string, string> | null = null;
let cacheFetchedAt = 0;
const CACHE_TTL_MS = 1000 * 60 * 60 * 12; // 12時間キャッシュ

async function loadAllHolidays(): Promise<Record<string, string>> {
  const now = Date.now();
  if (cache && now - cacheFetchedAt < CACHE_TTL_MS) {
    return cache;
  }
  try {
    const res = await fetch(HOLIDAYS_API);
    if (!res.ok) return cache ?? {};
    const data = (await res.json()) as Record<string, string>;
    cache = data;
    cacheFetchedAt = now;
    return data;
  } catch {
    // ネットワークエラー時は直前のキャッシュ(あれば)を使い、無ければ空扱いにする
    return cache ?? {};
  }
}

// start_date〜end_date(両端含む)に含まれる祝日を返す
export async function getJapaneseHolidaysInRange(
  startDate: string,
  endDate: string
): Promise<Holiday[]> {
  const all = await loadAllHolidays();
  return Object.entries(all)
    .filter(([date]) => date >= startDate && date <= endDate)
    .map(([date, name]) => ({ date, name }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}
