// 旅程プランを各種ファイル形式に書き出すための共通処理。
// まず「エクスポート用の行データ」に正規化し、それぞれの形式(txt/docx/xlsx/html)は
// この共通データから組み立てる(表現がバラつかないようにするため)。
//
// 【重要】ここで受け取るのは必ず TripPlanView(表示用に都度合成したもの)であること。
// DB(Postgres)に保存されている生の TripPlan は名称・座標を含まないため、エクスポート前に
// 呼び出し側で buildPlanView() を通す必要がある(Googleポリシー対応、lib/plan-view.ts参照)。
import { DayPlanView, Trip, TripPlanView } from "./types";

export interface ExportRow {
  day: number;
  date: string;
  time: string; // 到着/出発/移動などの代表時刻
  kind: "出発" | "訪問" | "移動" | "到着";
  label: string; // 場所名や「移動」など
  detail: string; // 滞在時間・駐車場・通行料金などの補足
}

function tollText(cash: number | null, etc: number | null): string {
  const usesToll = (cash ?? 0) > 0 || (etc ?? 0) > 0;
  if (!usesToll) return "";
  const etcText = etc != null ? `${etc}円` : "不明";
  const cashText = cash != null ? `${cash}円` : "不明";
  return `通行料 ETC ${etcText} / 現金 ${cashText}`;
}

function buildDayRows(day: DayPlanView): ExportRow[] {
  const rows: ExportRow[] = [];

  if (day.start_location_name) {
    rows.push({
      day: day.day,
      date: day.date,
      time: day.start_time,
      kind: "出発",
      label: day.start_location_name,
      detail: "",
    });
  }

  day.stops.forEach((stop, i) => {
    if (i === 0 && stop.travel_minutes_from_prev != null) {
      rows.push({
        day: day.day,
        date: day.date,
        time: "",
        kind: "移動",
        label: `移動 ${stop.travel_minutes_from_prev}分`,
        detail: tollText(stop.toll_cash_yen, stop.toll_etc_yen),
      });
    }

    const parkingText = stop.selected_parking
      ? `駐車場: ${stop.selected_parking.name}(徒歩${stop.parking_walk_minutes}分)`
      : "";
    rows.push({
      day: day.day,
      date: day.date,
      time: `${stop.arrival_time}〜${stop.departure_time}`,
      kind: "訪問",
      label: stop.name,
      detail: [`滞在${stop.stay_minutes}分`, parkingText, stop.hours_uncertain ? "営業時間不明" : ""]
        .filter(Boolean)
        .join(" / "),
    });

    const nextTravel =
      i < day.stops.length - 1
        ? day.stops[i + 1].travel_minutes_from_prev
        : day.end_location_name
        ? day.travel_minutes_to_end
        : null;
    const nextTollCash =
      i < day.stops.length - 1 ? day.stops[i + 1].toll_cash_yen : day.toll_cash_yen_to_end;
    const nextTollEtc = i < day.stops.length - 1 ? day.stops[i + 1].toll_etc_yen : day.toll_etc_yen_to_end;
    if (nextTravel != null) {
      rows.push({
        day: day.day,
        date: day.date,
        time: "",
        kind: "移動",
        label: `移動 ${nextTravel}分`,
        detail: tollText(nextTollCash, nextTollEtc),
      });
    }
  });

  // 訪問地が1件も無い日(出発地から到着地へ直行するだけの日)は、上のforEachが1度も回らず
  // 移動区間の行が抜け落ちてしまうため、ここで出発地→到着地の移動・通行料金を補う。
  if (day.stops.length === 0 && day.end_location_name && day.travel_minutes_to_end != null) {
    rows.push({
      day: day.day,
      date: day.date,
      time: "",
      kind: "移動",
      label: `移動 ${day.travel_minutes_to_end}分`,
      detail: tollText(day.toll_cash_yen_to_end, day.toll_etc_yen_to_end),
    });
  }

  if (day.end_location_name) {
    rows.push({
      day: day.day,
      date: day.date,
      time: day.arrival_at_end_time ?? "",
      kind: "到着",
      label: day.end_location_name,
      detail: "",
    });
  }

  return rows;
}

export function buildExportRows(planView: TripPlanView): ExportRow[] {
  return planView.days.flatMap(buildDayRows);
}

// テキスト形式(.txt)の旅程を組み立てる
export function buildTxtExport(trip: Trip, planView: TripPlanView | null): string {
  const lines: string[] = [];
  lines.push(trip.name);
  lines.push(`${trip.start_date} 〜 ${trip.end_date}`);
  lines.push("");

  if (!planView) {
    lines.push("(まだプランが作成されていません)");
    return lines.join("\n");
  }

  for (const day of planView.days) {
    lines.push(`■ DAY ${day.day}（${day.date}）`);
    const rows = buildDayRows(day);
    for (const row of rows) {
      const timePart = row.time ? `${row.time}  ` : "";
      const detailPart = row.detail ? `  [${row.detail}]` : "";
      lines.push(`  ${timePart}${row.label}${detailPart}`);
    }
    lines.push("");
  }

  if (planView.unassigned.length > 0) {
    lines.push("■ 組み込めなかった場所");
    for (const u of planView.unassigned) {
      lines.push(`  ${u.name}：${u.reason}`);
    }
  }

  return lines.join("\n");
}

// HTML形式(印刷してPDF保存する用途)の旅程を組み立てる
export function buildHtmlExport(trip: Trip, planView: TripPlanView | null): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const dayBlocks = (planView?.days ?? [])
    .map((day) => {
      const rows = buildDayRows(day)
        .map(
          (row) =>
            `<tr><td>${esc(row.time)}</td><td>${esc(row.kind)}</td><td>${esc(row.label)}</td><td>${esc(
              row.detail
            )}</td></tr>`
        )
        .join("");
      return `<section class="day"><h2>DAY ${day.day}（${esc(day.date)}）</h2><table><thead><tr><th>時刻</th><th>種別</th><th>内容</th><th>補足</th></tr></thead><tbody>${rows}</tbody></table></section>`;
    })
    .join("");

  const style = `
    body { font-family: "Hiragino Sans", "Yu Gothic", "Meiryo", sans-serif; color: #1F2430; margin: 2rem; }
    h1 { font-size: 1.6rem; margin-bottom: 0.25rem; }
    h2 { font-size: 1.1rem; margin: 1.5rem 0 0.5rem; border-left: 4px solid #33526E; padding-left: 0.5rem; }
    p.period { color: #6B7280; margin-top: 0; }
    table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
    th, td { border: 1px solid #D8D3C4; padding: 6px 8px; text-align: left; }
    th { background: #F7F5EF; }
    .day { page-break-inside: avoid; }
    @media print {
      body { margin: 1cm; }
      a { color: inherit; text-decoration: none; }
    }
  `;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(
    trip.name
  )}</title><style>${style}</style></head><body><h1>${esc(trip.name)}</h1><p class="period">${esc(
    trip.start_date
  )} 〜 ${esc(trip.end_date)}</p>${dayBlocks}</body></html>`;
}
