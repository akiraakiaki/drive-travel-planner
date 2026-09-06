import { NextRequest, NextResponse } from "next/server";
import { getTrip } from "@/lib/store";
import { buildPlanView } from "@/lib/plan-view";
import { buildHtmlExport } from "@/lib/export";

// Vercel上でこのルートが静的にキャッシュされ、DBへの書き込みが画面に反映されない
// (SyntaxError: Unexpected end of JSON input等の症状につながる)問題を防ぐため、
// 常に動的(リクエストのたびに実行)にする。
export const dynamic = "force-dynamic";

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
