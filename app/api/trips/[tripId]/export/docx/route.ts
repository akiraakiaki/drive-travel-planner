import { NextRequest, NextResponse } from "next/server";
import { getTrip } from "@/lib/store";
import { buildPlanView } from "@/lib/plan-view";
import { buildDocxBuffer } from "@/lib/export-docx";

export async function GET(
  _req: NextRequest,
  { params }: { params: { tripId: string } }
) {
  const trip = getTrip(params.tripId);
  if (!trip) {
    return NextResponse.json({ error: "旅行が見つかりません。" }, { status: 404 });
  }

  const planView = trip.plan ? await buildPlanView(trip.plan) : null;
  const buffer = await buildDocxBuffer(trip, planView);

  // NextResponse(Response)のBodyInit型は Node の Buffer<ArrayBufferLike> と構造的に
  // 一致しないことがあり(特にVercel本番ビルドの@types/nodeバージョンで顕在化)、
  // TypeScriptの型エラーになる。中身は変えず、型としてBodyInit互換なUint8Arrayに変換する。
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(trip.name)}.docx"`,
    },
  });
}
