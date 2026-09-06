import { NextRequest, NextResponse } from "next/server";
import { getTrip } from "@/lib/store";
import { buildPlanView } from "@/lib/plan-view";
import { buildXlsxBuffer } from "@/lib/export-xlsx";

// Vercel上でこのルートが静的にキャッシュされ、DBへの書き込みが画面に反映されない
// (SyntaxError: Unexpected end of JSON input等の症状につながる)問題を防ぐため、
// 常に動的(リクエストのたびに実行)にする。
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { tripId: string } }
) {
  const trip = await getTrip(params.tripId);
  if (!trip) {
    return NextResponse.json({ error: "旅行が見つかりません。" }, { status: 404 });
  }

  const planView = trip.plan ? await buildPlanView(trip.plan) : null;
  const buffer = await buildXlsxBuffer(trip, planView);

  // NextResponse(Response)のBodyInit型は Node の Buffer<ArrayBufferLike> と構造的に
  // 一致しないことがあり(特にVercel本番ビルドの@types/nodeバージョンで顕在化)、
  // TypeScriptの型エラーになる。中身は変えず、型としてBodyInit互換なUint8Arrayに変換する。
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(trip.name)}.xlsx"`,
    },
  });
}
