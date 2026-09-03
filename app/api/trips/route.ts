import { NextRequest, NextResponse } from "next/server";
import { createTrip, listTrips } from "@/lib/store";

export async function GET() {
  return NextResponse.json({ trips: await listTrips() });
}

// 4.1 旅行作成: 必須項目チェック(開始日 <= 終了日 等)
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "リクエストが不正です。" }, { status: 400 });
  }

  const { name, destination, start_date, end_date } = body;

  if (!name || !destination || !start_date || !end_date) {
    return NextResponse.json(
      { error: "旅行名・旅行先・開始日・終了日は必須です。" },
      { status: 400 }
    );
  }

  if (start_date > end_date) {
    return NextResponse.json(
      { error: "開始日は終了日以前である必要があります。" },
      { status: 400 }
    );
  }

  const trip = await createTrip({
    name,
    destination,
    start_date,
    end_date,
    daily_start_time: body.daily_start_time,
    daily_end_time: body.daily_end_time,
  });

  return NextResponse.json({ trip }, { status: 201 });
}
