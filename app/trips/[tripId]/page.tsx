// Web版(パスパラメータ方式)専用のラッパー。実際の画面ロジックは
// components/TripDetailScreen.tsx に集約している(モバイル向けの app/trip/page.tsx と共有するため)。
//
// 【モバイルビルドについて】
// このファイル(app/trips/[tripId])は動的パスセグメントを持ち、Next.jsの output:'export'
// (静的書き出し)では generateStaticParams() で全パスをビルド時に列挙する必要がある。
// しかしtripIdはNeon Postgres上の実行時データであり、ビルド時に全ユーザー分を
// 列挙することはできない(空配列を返す回避策は構成によって不安定になることがある)。
// そのため、モバイル向けビルド時は scripts/build-mobile.mjs がこのディレクトリ自体を
// 一時退避し、ビルド対象から完全に除外する。モバイル版では代わりに、クエリ文字列で
// tripIdを受け取る app/trip/page.tsx (?id=xxx) を使う。
// Web版(Vercelの通常ビルド)ではこのファイルはそのまま含まれ、今まで通り動作する。
import TripDetailScreen from "@/components/TripDetailScreen";

export default function TripDetailPage({
  params,
}: {
  params: { tripId: string };
}) {
  return <TripDetailScreen tripId={params.tripId} />;
}
