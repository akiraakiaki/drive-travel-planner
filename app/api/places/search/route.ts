import { NextRequest, NextResponse } from "next/server";
import { searchPlaces } from "@/lib/places";

// GET /api/places/search?q=清水寺
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();

  if (!q) {
    return NextResponse.json(
      { error: "検索クエリ(q)を指定してください。" },
      { status: 400 }
    );
  }

  try {
    const results = await searchPlaces(q);
    return NextResponse.json({ results });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "場所の検索に失敗しました。時間をおいて再度お試しください。" },
      { status: 502 }
    );
  }
}
