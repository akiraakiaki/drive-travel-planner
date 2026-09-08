// Postgres(Vercel Postgres / Neon等)への永続化レイヤー。
//
// 【以前の実装について】
// 以前はローカルファイル(data/db.json)への書き込みで代用していたが、
// Vercelのサーバーレス関数は実行環境のファイルシステムが読み取り専用であるため、
// 本番デプロイ後に旅行の作成・保存が全て失敗する不具合が起きていた
// (/tmp のみ書き込み可能だが、リクエストごとに揮発するため永続化には使えない)。
// そのため、マネージドPostgres(Vercel Postgres/Neon等)を使った永続化に置き換えている。
//
// 【スキーマ設計について】
// 既存の型定義(Trip・TripPlace)が持つネストした構造(day_configs・plan等)をそのまま
// 生かせるよう、テーブルを細かく正規化せず「1行=1トリップ分のJSONB」として保存している。
// 将来的にユーザーごとのデータ分離(認証)や、より厳密な同時編集の整合性(トランザクション)が
// 必要になった場合は、このレイヤーだけを差し替えれば良いように store.ts 側とは責務を分離している。
import { sql } from "@vercel/postgres";
import { Trip, TripPlace } from "./types";

// テーブル作成は初回アクセス時に1度だけ行う(以降はメモ化して再実行しない)。
// CREATE TABLE IF NOT EXISTS は冪等なので、複数インスタンスから同時に呼ばれても安全。
let schemaReadyPromise: Promise<void> | null = null;

function ensureSchema(): Promise<void> {
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS trips (
          id TEXT PRIMARY KEY,
          data JSONB NOT NULL,
          device_id TEXT,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
      // 既にtripsテーブルが存在する(Postgres移行時点の)環境向けに、
      // device_id列が無ければ追加する(冪等: 既にあれば何もしない)。
      await sql`ALTER TABLE trips ADD COLUMN IF NOT EXISTS device_id TEXT`;
      await sql`CREATE INDEX IF NOT EXISTS trips_device_id_idx ON trips (device_id)`;
      await sql`
        CREATE TABLE IF NOT EXISTS trip_places (
          trip_id TEXT PRIMARY KEY,
          data JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
    })().catch((err) => {
      // 初期化に失敗した場合は次回呼び出し時に再試行できるようリセットする
      schemaReadyPromise = null;
      throw err;
    });
  }
  return schemaReadyPromise;
}

// 指定した端末IDが作成した旅行だけを返す(トップページの一覧用)。
// 認証機能が無い暫定対応のため、旅行詳細への直接アクセス(共有リンク等)は
// 引き続きIDが分かれば端末を問わず可能(readTrip参照)。
export async function readTripsByDevice(deviceId: string): Promise<Trip[]> {
  await ensureSchema();
  const { rows } = await sql<{ data: Trip }>`
    SELECT data FROM trips WHERE device_id = ${deviceId}
  `;
  return rows.map((r) => r.data);
}

export async function readAllTrips(): Promise<Trip[]> {
  await ensureSchema();
  const { rows } = await sql<{ data: Trip }>`SELECT data FROM trips`;
  return rows.map((r) => r.data);
}

export async function readTrip(tripId: string): Promise<Trip | null> {
  await ensureSchema();
  const { rows } = await sql<{ data: Trip }>`SELECT data FROM trips WHERE id = ${tripId}`;
  return rows[0]?.data ?? null;
}

// deviceIdは新規作成時にのみ紐付ける(更新時はnullを渡して既存の値を変更しない)。
export async function writeTrip(trip: Trip, deviceId?: string | null): Promise<void> {
  await ensureSchema();
  if (deviceId) {
    await sql`
      INSERT INTO trips (id, data, device_id, updated_at)
      VALUES (${trip.id}, ${JSON.stringify(trip)}::jsonb, ${deviceId}, now())
      ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()
    `;
  } else {
    await sql`
      INSERT INTO trips (id, data, updated_at)
      VALUES (${trip.id}, ${JSON.stringify(trip)}::jsonb, now())
      ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()
    `;
  }
}

export async function readTripPlaces(tripId: string): Promise<TripPlace[]> {
  await ensureSchema();
  const { rows } = await sql<{ data: TripPlace[] }>`
    SELECT data FROM trip_places WHERE trip_id = ${tripId}
  `;
  const places = rows[0]?.data ?? [];
  // 「DBには保存されているのにUIに表示されない」といった不具合の切り分け用に、
  // 件数を記録しておく(Vercelのダッシュボード上のFunction Logsで確認できる)。
  console.log(`[db] readTripPlaces tripId=${tripId} rowFound=${rows.length > 0} placeCount=${places.length}`);
  return places;
}

export async function writeTripPlaces(tripId: string, places: TripPlace[]): Promise<void> {
  await ensureSchema();
  await sql`
    INSERT INTO trip_places (trip_id, data, updated_at)
    VALUES (${tripId}, ${JSON.stringify(places)}::jsonb, now())
    ON CONFLICT (trip_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()
  `;
  console.log(`[db] writeTripPlaces tripId=${tripId} placeCount=${places.length}`);
}

// 旅行を削除する(trip_places側も合わせて削除する)。
// 戻り値は「実際に削除された行があったか」(存在しないIDを指定した場合はfalse)。
export async function deleteTrip(tripId: string): Promise<boolean> {
  await ensureSchema();
  await sql`DELETE FROM trip_places WHERE trip_id = ${tripId}`;
  const result = await sql`DELETE FROM trips WHERE id = ${tripId}`;
  return (result.rowCount ?? 0) > 0;
}
