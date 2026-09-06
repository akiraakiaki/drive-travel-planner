import { NextRequest, NextResponse } from "next/server";
import { getTrip } from "@/lib/store";
import { buildPlanView } from "@/lib/plan-view";
import { LatLngValue } from "@/lib/types";

// Vercel上でこのルートが静的にキャッシュされ、DBへの書き込みが画面に反映されない
// (SyntaxError: Unexpected end of JSON input等の症状につながる)問題を防ぐため、
// 常に動的(リクエストのたびに実行)にする。
export const dynamic = "force-dynamic";

// XML特殊文字をエスケープする
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function placemark(name: string, description: string, loc: LatLngValue): string {
  return `<Placemark><name>${esc(name)}</name><description>${esc(description)}</description><Point><coordinates>${loc.lng},${loc.lat},0</coordinates></Point></Placemark>`;
}

function lineString(coords: LatLngValue[]): string {
  const path = coords.map((c) => `${c.lng},${c.lat},0`).join(" ");
  return `<Placemark><name>経路</name><LineString><tessellate>1</tessellate><coordinates>${path}</coordinates></LineString></Placemark>`;
}

// GET /api/trips/:tripId/export/kml
// 生成済みプランをKML形式でダウンロードする。Googleマイマップにインポートすることで、
// Googleアカウント上に保存し、地図として閲覧・共有できるようになる。
// 名称・座標はダウンロード時にGoogleから都度取得したものを使い、サーバー側には保存しない。
export async function GET(
  _req: NextRequest,
  { params }: { params: { tripId: string } }
) {
  const trip = await getTrip(params.tripId);
  if (!trip) {
    return NextResponse.json({ error: "旅行が見つかりません。" }, { status: 404 });
  }
  if (!trip.plan) {
    return NextResponse.json({ error: "まだプランが作成されていません。" }, { status: 400 });
  }

  const planView = await buildPlanView(trip.plan);

  const folders = planView.days
    .map((day) => {
      const placemarks: string[] = [];
      const pathCoords: LatLngValue[] = [];

      if (day.start_location) {
        placemarks.push(placemark(`${day.start_location_name}（出発）`, `${day.start_time} 出発`, day.start_location));
        pathCoords.push(day.start_location);
      }

      for (const stop of day.stops) {
        placemarks.push(
          placemark(
            stop.name,
            `到着 ${stop.arrival_time} / 出発 ${stop.departure_time}（滞在${stop.stay_minutes}分）`,
            stop.location ?? { lat: 0, lng: 0 }
          )
        );
        if (stop.location) pathCoords.push(stop.location);
      }

      if (day.end_location) {
        placemarks.push(
          placemark(
            `${day.end_location_name}（到着）`,
            `${day.arrival_at_end_time ?? ""} 到着`,
            day.end_location
          )
        );
        pathCoords.push(day.end_location);
      }

      const path = pathCoords.length >= 2 ? lineString(pathCoords) : "";

      return `<Folder><name>${esc(`Day ${day.day}（${day.date}）`)}</name>${placemarks.join("")}${path}</Folder>`;
    })
    .join("");

  const kml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc(trip.name)}</name>${folders}</Document></kml>`;

  return new NextResponse(kml, {
    status: 200,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "Content-Type": "application/vnd.google-earth.kml+xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(trip.name)}.kml"`,
    },
  });
}
