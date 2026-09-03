// Word(.docx)形式で旅程を書き出す。'docx' パッケージを使用する。
import { Document, Packer, Paragraph, HeadingLevel, Table, TableRow, TableCell, WidthType } from "docx";
import { Trip, TripPlanView } from "./types";
import { buildExportRows } from "./export";

export async function buildDocxBuffer(trip: Trip, planView: TripPlanView | null): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [];

  children.push(
    new Paragraph({ text: trip.name, heading: HeadingLevel.TITLE }),
    new Paragraph({ text: `${trip.start_date} 〜 ${trip.end_date}` })
  );

  if (!planView) {
    children.push(new Paragraph({ text: "(まだプランが作成されていません)" }));
  } else {
    for (const day of planView.days) {
      children.push(new Paragraph({ text: `DAY ${day.day}（${day.date}）`, heading: HeadingLevel.HEADING_1 }));

      const rows = buildExportRows({ days: [day], unassigned: [], generated_at: "" });

      const headerRow = new TableRow({
        children: ["時刻", "種別", "内容", "補足"].map(
          (t) => new TableCell({ children: [new Paragraph({ text: t })] })
        ),
      });

      const bodyRows = rows.map(
        (r) =>
          new TableRow({
            children: [r.time, r.kind, r.label, r.detail].map(
              (t) => new TableCell({ children: [new Paragraph({ text: t })] })
            ),
          })
      );

      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [headerRow, ...bodyRows],
        }),
        new Paragraph({ text: "" })
      );
    }

    if (planView.unassigned.length > 0) {
      children.push(new Paragraph({ text: "組み込めなかった場所", heading: HeadingLevel.HEADING_2 }));
      for (const u of planView.unassigned) {
        children.push(new Paragraph({ text: `${u.name}：${u.reason}` }));
      }
    }
  }

  const doc = new Document({
    sections: [{ children }],
  });

  return Packer.toBuffer(doc);
}
