import { NextRequest, NextResponse } from "next/server";
import { getTrip } from "@/lib/store";
import { buildHtmlExport } from "@/lib/export";

// OneNoteは外部ファイルの直接インポートに対応していないため、
// 見やすく整形したHTMLを書き出し、ブラウザで開いて内容をコピー&ペーストしてもらう想定。
export async function GET(
  _req: NextRequest,
  { params }: { params: { tripId: string } }
) {
  const trip = getTrip(params.tripId);
  if (!trip) {
    return NextResponse.json({ error: "旅行が見つかりません。" }, { status: 404 });
  }

  const html = buildHtmlExport(trip);

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(trip.name)}.html"`,
    },
  });
}
