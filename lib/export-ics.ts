// iCalendar(.ics)形式で旅程を書き出す。Googleカレンダー・Appleカレンダー・Outlook等にインポートできる。
// 外部ライブラリ不要のプレーンテキスト形式なので自前で組み立てる。
import { Trip, TripPlanView } from "./types";

// 日本時間(JST, UTC+9)の日付・時刻文字列を、ICSで使うUTC形式(YYYYMMDDTHHMMSSZ)に変換する
function toIcsUtc(dateStr: string, timeStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [h, min] = timeStr.split(":").map(Number);
  // JSTのウォールクロック時刻からUTCへ変換(9時間引く)
  const utcMs = Date.UTC(y, m - 1, d, h, min) - 9 * 60 * 60 * 1000;
  const utc = new Date(utcMs);
  const pad = (n: number) => `${n}`.padStart(2, "0");
  return (
    `${utc.getUTCFullYear()}${pad(utc.getUTCMonth() + 1)}${pad(utc.getUTCDate())}T` +
    `${pad(utc.getUTCHours())}${pad(utc.getUTCMinutes())}00Z`
  );
}

function escapeIcsText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n");
}

function foldLine(line: string): string {
  // ICS仕様上、1行は75オクテットで折り返す必要がある(簡易的な折り返し実装)
  if (line.length <= 75) return line;
  let result = "";
  let rest = line;
  while (rest.length > 75) {
    result += rest.slice(0, 75) + "\r\n ";
    rest = rest.slice(75);
  }
  return result + rest;
}

export function buildIcsExport(trip: Trip, planView: TripPlanView | null): string {
  const lines: string[] = [];
  lines.push("BEGIN:VCALENDAR");
  lines.push("VERSION:2.0");
  lines.push("PRODID:-//travel-planner//JP");
  lines.push("CALSCALE:GREGORIAN");

  const now = new Date();
  const dtstamp =
    `${now.getUTCFullYear()}${`${now.getUTCMonth() + 1}`.padStart(2, "0")}${`${now.getUTCDate()}`.padStart(
      2,
      "0"
    )}T${`${now.getUTCHours()}`.padStart(2, "0")}${`${now.getUTCMinutes()}`.padStart(2, "0")}00Z`;

  let uidCounter = 0;
  for (const day of planView?.days ?? []) {
    for (const stop of day.stops) {
      uidCounter += 1;
      const descriptionParts = [`滞在時間: ${stop.stay_minutes}分`];
      if (stop.selected_parking) {
        descriptionParts.push(`駐車場: ${stop.selected_parking.name}（徒歩${stop.parking_walk_minutes}分）`);
      }
      if (stop.hours_uncertain) descriptionParts.push("営業時間不明のため要確認");

      lines.push("BEGIN:VEVENT");
      lines.push(foldLine(`UID:${trip.id}-${uidCounter}@travel-planner`));
      lines.push(`DTSTAMP:${dtstamp}`);
      lines.push(`DTSTART:${toIcsUtc(day.date, stop.arrival_time)}`);
      lines.push(`DTEND:${toIcsUtc(day.date, stop.departure_time)}`);
      lines.push(foldLine(`SUMMARY:${escapeIcsText(stop.name)}`));
      lines.push(foldLine(`DESCRIPTION:${escapeIcsText(descriptionParts.join(" / "))}`));
      lines.push("END:VEVENT");
    }
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
