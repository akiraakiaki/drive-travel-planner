import { NextRequest, NextResponse } from "next/server";
import { searchPlaces } from "@/lib/places";

// Vercel上でこのルートが静的にキャッシュされ、DBへの書き込みが画面に反映されない
// (SyntaxError: Unexpected end of JSON input等の症状につながる)問題を防ぐため、
// 常に動的(リクエストのたびに実行)にする。
export const dynamic = "force-dynamic";

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
