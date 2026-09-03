// ローカルファイル(data/db.json)への簡易永続化。
// MVPなので本格的なDB(SQLite/Postgres等)は使わず、JSONファイルへの読み書きで代替する。
// 複数人が同時に書き込むような本番運用には向かないため、Phase 2以降でDBに差し替える想定。
import fs from "node:fs";
import path from "node:path";
import { Trip, TripPlace } from "./types";

interface DbShape {
  trips: Trip[];
  tripPlaces: Record<string, TripPlace[]>; // trip_id -> places
}

const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    const initial: DbShape = { trips: [], tripPlaces: {} };
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), "utf-8");
  }
}

export function readDb(): DbShape {
  ensureFile();
  const raw = fs.readFileSync(DB_FILE, "utf-8");
  try {
    return JSON.parse(raw) as DbShape;
  } catch {
    // 壊れていた場合は初期状態として扱う(データ消失より起動できることを優先)
    return { trips: [], tripPlaces: {} };
  }
}

export function writeDb(db: DbShape) {
  ensureFile();
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
}
