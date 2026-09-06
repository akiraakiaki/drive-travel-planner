import { NextRequest, NextResponse } from "next/server";
import { updateTripDates } from "@/lib/store";

// Vercel上でこのルートが静的にキャッシュされる問題を防ぐため、常に動的にする。
export const dynamic = "force-dynamic";

// PATCH /api/trips/:tripId/dates
// { start_date: "YYYY-MM-DD", end_date: "YYYY-MM-DD" }
// 日程を変更すると、既存の日ごとの設定(活動時間・出発地/到着地)は同じ日付が残っていれば引き継がれる。
// 生成済みのプランは日付・日数に強く依存するため、変更時に破棄される(作り直しが必要)。
export async function PATCH(
  req: NextRequest,
  { params }: { params: { tripId: string } }
) {
  const body = await req.json().catch(() => null);
  const startDate = body?.start_date;
  const endDate = body?.end_date;

  if (typeof startDate !== "string" || typeof endDate !== "string" || !startDate || !endDate) {
    return NextResponse.json(
      { error: "start_date と end_date は必須です。" },
      { status: 400 }
    );
  }

  const result = await updateTripDates(params.tripId, startDate, endDate);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(
    { trip: result.trip },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } }
  );
}
