import { NextRequest, NextResponse } from "next/server";
import { getTrip } from "@/lib/store";
import { buildPlanView } from "@/lib/plan-view";
import { buildTxtExport } from "@/lib/export";

export async function GET(
  _req: NextRequest,
  { params }: { params: { tripId: string } }
) {
  const trip = getTrip(params.tripId);
  if (!trip) {
    return NextResponse.json({ error: "旅行が見つかりません。" }, { status: 404 });
  }

  const planView = trip.plan ? await buildPlanView(trip.plan) : null;
  const text = buildTxtExport(trip, planView);

  return new NextResponse(text, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(trip.name)}.txt"`,
    },
  });
}
