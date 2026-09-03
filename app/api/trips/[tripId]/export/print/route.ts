import { NextRequest, NextResponse } from "next/server";
import { getTrip } from "@/lib/store";
import { buildPlanView } from "@/lib/plan-view";
import { buildHtmlExport } from "@/lib/export";

// GET /api/trips/:tripId/export/print
// ダウンロードさせず、ブラウザ上にそのまま表示する。
// ブラウザの「印刷」→「PDFとして保存」を使えば、追加のライブラリなしでPDF化できる。
export async function GET(
  _req: NextRequest,
  { params }: { params: { tripId: string } }
) {
  const trip = await getTrip(params.tripId);
  if (!trip) {
    return NextResponse.json({ error: "旅行が見つかりません。" }, { status: 404 });
  }

  const planView = trip.plan ? await buildPlanView(trip.plan) : null;
  const html = buildHtmlExport(trip, planView);

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // attachmentではなくinlineにすることで、ダウンロードさせずブラウザでそのまま開く
      "Content-Disposition": "inline",
    },
  });
}
