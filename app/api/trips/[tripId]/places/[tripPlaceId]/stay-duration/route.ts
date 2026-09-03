import { NextRequest, NextResponse } from "next/server";
import { updateTripPlaceStayDuration } from "@/lib/store";

// PATCH /api/trips/:tripId/places/:tripPlaceId/stay-duration
// { minutes: number }
export async function PATCH(
  req: NextRequest,
  { params }: { params: { tripId: string; tripPlaceId: string } }
) {
  const body = await req.json().catch(() => null);
  const minutes = body?.minutes;

  if (typeof minutes !== "number" || minutes < 0) {
    return NextResponse.json({ error: "minutes は0以上の数値で指定してください。" }, { status: 400 });
  }

  const ok = await updateTripPlaceStayDuration(params.tripId, params.tripPlaceId, minutes);
  if (!ok) {
    return NextResponse.json({ error: "対象の場所が見つかりません。" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
