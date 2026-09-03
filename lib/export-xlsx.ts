// Excel(.xlsx)形式で旅程を書き出す。'exceljs' パッケージを使用する。
import ExcelJS from "exceljs";
import { Trip, TripPlanView } from "./types";
import { buildExportRows } from "./export";

export async function buildXlsxBuffer(trip: Trip, planView: TripPlanView | null): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ドライブトラベルプランナー";

  const info = workbook.addWorksheet("旅行概要");
  info.columns = [{ width: 20 }, { width: 40 }];
  info.addRow(["旅行名", trip.name]);
  info.addRow(["目的地", trip.destination]);
  info.addRow(["期間", `${trip.start_date} 〜 ${trip.end_date}`]);
  info.getRow(1).font = { bold: true };

  if (!planView) {
    info.addRow(["状態", "まだプランが作成されていません"]);
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  for (const day of planView.days) {
    const sheet = workbook.addWorksheet(`Day${day.day}`);
    sheet.columns = [
      { header: "日", key: "day", width: 6 },
      { header: "日付", key: "date", width: 12 },
      { header: "時刻", key: "time", width: 14 },
      { header: "種別", key: "kind", width: 8 },
      { header: "内容", key: "label", width: 30 },
      { header: "補足", key: "detail", width: 30 },
    ];
    sheet.getRow(1).font = { bold: true };

    const rows = buildExportRows({ days: [day], unassigned: [], generated_at: "" });
    for (const r of rows) {
      sheet.addRow(r);
    }
  }

  if (planView.unassigned.length > 0) {
    const sheet = workbook.addWorksheet("組み込めなかった場所");
    sheet.columns = [
      { header: "場所", key: "name", width: 24 },
      { header: "理由", key: "reason", width: 50 },
    ];
    sheet.getRow(1).font = { bold: true };
    for (const u of planView.unassigned) {
      sheet.addRow({ name: u.name, reason: u.reason });
    }
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
