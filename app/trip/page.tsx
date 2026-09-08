// モバイル(Capacitor静的書き出し)向けのラッパー。
//
// Web版の /trips/[tripId] は動的パスセグメントを持ち、Next.jsの output:'export' では
// ビルド時に全パスを列挙する generateStaticParams() が必要になるが、tripIdはNeon Postgres上の
// 実行時データなので、ビルド時に全ユーザー分を列挙することはできない。
// そのため、モバイル向けビルド時は app/trips ディレクトリ自体を退避してビルド対象から除外し
// (scripts/build-mobile.mjs参照)、代わりにこのページ(クエリ文字列 ?id=xxx)を使う。
// tripIdはアプリ起動後、実行時にVercelのAPI(/api/trips/:tripId等)から取得する。
// Web版の /trips/[tripId] とロジックを components/TripDetailScreen.tsx で共有する。
"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import TripDetailScreen from "@/components/TripDetailScreen";

function TripPageInner() {
  const searchParams = useSearchParams();
  const tripId = searchParams.get("id");

  if (!tripId) {
    return <p className="text-sm text-alert">旅行IDが指定されていません。</p>;
  }

  return <TripDetailScreen tripId={tripId} />;
}

export default function TripPage() {
  return (
    <Suspense fallback={<p className="text-sm text-mute">読み込み中...</p>}>
      <TripPageInner />
    </Suspense>
  );
}
