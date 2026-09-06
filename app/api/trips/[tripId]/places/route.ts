import { NextRequest, NextResponse } from "next/server";
import { addTripPlace, removeTripPlace } from "@/lib/store";

// Vercel上でこのルートが静的にキャッシュされ、DBへの書き込みが画面に反映されない
// (SyntaxError: Unexpected end of JSON input等の症状につながる)問題を防ぐため、
// 常に動的(リクエストのたびに実行)にする。
export const dynamic = "force-dynamic";

// POST /api/trips/:tripId/places  { google_place_id: string }
export async function POST(
  req: NextRequest,
  { params }: { params: { tripId: string } }
) {
  const body = await req.json().catch(() => null);
  const googlePlaceId = body?.google_place_id;

  if (!googlePlaceId) {
    return NextResponse.json(
      { error: "google_place_id は必須です。" },
      { status: 400 }
    );
  }

  const result = await addTripPlace(params.tripId, googlePlaceId);

  if (!result.ok) {
    if (result.reason === "trip_not_found") {
      return NextResponse.json({ error: "旅行が見つかりません。" }, { status: 404 });
    }
    // 5.2 場所の重複登録防止
    return NextResponse.json(
      { error: "この場所はすでに登録されています。" },
      { status: 409 }
    );
  }

  return NextResponse.json({ place: result.place }, { status: 201 });
}

// DELETE /api/trips/:tripId/places?place_id=xxx (TripPlaceのid)
export async function DELETE(
  req: NextRequest,
  { params }: { params: { tripId: string } }
) {
  const tripPlaceId = req.nextUrl.searchParams.get("place_id");
  if (!tripPlaceId) {
    return NextResponse.json({ error: "place_id は必須です。" }, { status: 400 });
  }

  const removed = await removeTripPlace(params.tripId, tripPlaceId);
  if (!removed) {
    return NextResponse.json({ error: "対象の場所が見つかりません。" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
