// 日付・時刻計算の共通ユーティリティ

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

// start_date〜end_date(両端含む)の日付配列を YYYY-MM-DD で返す
export function enumerateDates(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const cur = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  while (cur <= end) {
    dates.push(formatDate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

export function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// 0(日)〜6(土)。Google Places の periods.open.day と同じ定義。
export function weekdayOf(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00`).getDay();
}

export function weekdayLabel(dateStr: string): string {
  return WEEKDAY_LABELS[weekdayOf(dateStr)];
}

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(min: number): string {
  const clamped = Math.max(0, Math.min(min, 24 * 60));
  const h = Math.floor(clamped / 60) % 24;
  const m = clamped % 60;
  return `${`${h}`.padStart(2, "0")}:${`${m}`.padStart(2, "0")}`;
}
