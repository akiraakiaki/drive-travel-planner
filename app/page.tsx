"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Trip } from "@/lib/types";
import { shareOrCopy } from "@/lib/share";

const FEATURES: string[] = [
  "🔍 名所を検索して登録（営業時間を自動表示）",
  "🚦 日ごとの出発地・到着地・活動ペースを設定",
  "🧠 営業時間と移動時間から旅程を自動生成",
  "🅿 周辺駐車場を検索して選択",
  "💴 有料道路の通行料金（ETC/現金）を表示",
  "🗺 Googleマップで経路を表示・保存",
  "📤 Word/Excel/PDF/カレンダー/テキストで出力",
];

function FeaturesModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-t-2xl bg-paper p-5 shadow-lg sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-ink">機能と使い方</h2>
          <button
            onClick={onClose}
            className="rounded-md border border-amber/40 px-2 py-1 text-xs text-mute hover:border-amber hover:text-[#8a5a12]"
          >
            閉じる ✕
          </button>
        </div>
        <p className="mb-3 text-sm text-ink">
          自動車での移動を前提に、行きたい場所から実際に成立するドライブ旅程を自動で組み立てるアプリです。
        </p>
        <ul className="space-y-2">
          {FEATURES.map((f) => (
            <li key={f} className="rounded-lg border border-amber/30 bg-card px-3 py-2 text-sm text-ink shadow-sm">
              {f}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const POLICY_POINTS: string[] = [
  "地図・場所・営業時間の情報はGoogleマップから取得しています",
  "無期限で保存するのは「場所のID」と、当アプリが独自に計算した時刻・移動時間・料金のみです",
  "場所の名称・住所・座標・駐車場情報などは保存せず、画面表示のたびにGoogleへ都度問い合わせています",
  "有料道路の料金・駐車場候補も、その場で検索するだけで保存しません",
];

function PolicyModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-t-2xl bg-paper p-5 shadow-lg sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-ink">Googleデータの取り扱いについて</h2>
          <button
            onClick={onClose}
            className="rounded-md border border-route/30 px-2 py-1 text-xs text-mute hover:border-route hover:text-route"
          >
            閉じる ✕
          </button>
        </div>
        <p className="mb-3 text-sm text-ink">
          当アプリは Google Maps Platform の利用規約に沿ってデータを取り扱っています。
        </p>
        <ul className="space-y-2">
          {POLICY_POINTS.map((p) => (
            <li key={p} className="rounded-lg border border-route/20 bg-card px-3 py-2 text-sm text-ink shadow-sm">
              {p}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] text-mute">
          詳細は
          <a
            href="https://developers.google.com/maps/documentation/places/web-service/policies"
            target="_blank"
            rel="noreferrer"
            className="text-route underline"
          >
            Google Places APIのポリシー
          </a>
          をご参照ください。
        </p>
      </div>
    </div>
  );
}

// 道・車・山・太陽の簡単なイラスト(トップページの装飾用)
function HeroIllustration() {
  return (
    <svg viewBox="0 0 400 220" className="mx-auto w-full max-w-sm" xmlns="http://www.w3.org/2000/svg">
      <circle cx="330" cy="45" r="28" fill="#E8A33D" opacity="0.9" />
      <path d="M0 150 L90 70 L150 130 L210 60 L280 140 L400 90 L400 220 L0 220 Z" fill="#3F6B32" opacity="0.18" />
      <path d="M0 175 L110 105 L190 165 L260 100 L400 150 L400 220 L0 220 Z" fill="#3F6B32" opacity="0.28" />
      <path d="M0 210 L400 210 L400 220 L0 220 Z" fill="#33526E" opacity="0.12" />
      <rect x="0" y="178" width="400" height="26" fill="#1F2430" opacity="0.85" rx="2" />
      <g stroke="#F7F5EF" strokeWidth="4" strokeDasharray="16 14">
        <line x1="0" y1="191" x2="400" y2="191" />
      </g>
      <g transform="translate(150,148)">
        <rect x="0" y="14" width="88" height="26" rx="8" fill="#E8A33D" />
        <rect x="14" y="0" width="54" height="20" rx="8" fill="#E8A33D" />
        <rect x="18" y="4" width="20" height="12" rx="2" fill="#F7F5EF" opacity="0.85" />
        <rect x="42" y="4" width="20" height="12" rx="2" fill="#F7F5EF" opacity="0.85" />
        <circle cx="20" cy="42" r="9" fill="#1F2430" />
        <circle cx="20" cy="42" r="4" fill="#F7F5EF" />
        <circle cx="70" cy="42" r="9" fill="#1F2430" />
        <circle cx="70" cy="42" r="4" fill="#F7F5EF" />
      </g>
      <g fill="#33526E" opacity="0.6">
        <circle cx="60" cy="40" r="3" />
        <circle cx="75" cy="30" r="2" />
        <circle cx="45" cy="28" r="2" />
      </g>
    </svg>
  );
}

export default function HomePage() {
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFeatures, setShowFeatures] = useState(false);
  const [showPolicy, setShowPolicy] = useState(false);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function loadTrips() {
    const res = await fetch("/api/trips");
    const data = await res.json();
    setTrips(data.trips);
  }

  useEffect(() => {
    loadTrips();
  }, []);

  async function handleDeleteTrip(tripId: string, tripName: string) {
    const confirmed = window.confirm(
      `「${tripName}」を削除しますか？\n登録した行きたい場所や作成済みのプランも全て削除され、元に戻せません。`
    );
    if (!confirmed) return;

    setDeleteError(null);
    setDeletingId(tripId);
    try {
      const res = await fetch(`/api/trips/${tripId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setDeleteError(data?.error ?? "削除に失敗しました。");
        return;
      }
      setTrips((prev) => (prev ? prev.filter((t) => t.id !== tripId) : prev));
    } catch {
      setDeleteError("削除に失敗しました。");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleCreate(formData: FormData) {
    setError(null);
    const payload = {
      name: formData.get("name"),
      destination: formData.get("destination"),
      start_date: formData.get("start_date"),
      end_date: formData.get("end_date"),
    };
    const res = await fetch("/api/trips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "旅行の作成に失敗しました。");
      return;
    }
    setShowForm(false);
    loadTrips();
  }

  async function handleShareApp() {
    const result = await shareOrCopy({
      title: "ドライブトラベルプランナー",
      text: "行きたい場所から、実際に成立するドライブ旅程を自動で組み立てるアプリです。",
      url: typeof window !== "undefined" ? window.location.origin : undefined,
    });
    if (result === "copied") setShareMessage("リンクをコピーしました");
    if (result === "shared") setShareMessage(null);
    if (result === "failed") return;
    setTimeout(() => setShareMessage(null), 2500);
  }

  return (
    <main>
      <header className="mb-8 text-center sm:mb-10">
        <p className="inline-block rounded-md bg-route/10 px-2 py-0.5 font-mono text-xs tracking-wide text-route">
          🚗 DRIVE TRAVEL PLANNER
        </p>
        <h1 className="mt-2 font-display text-2xl font-bold text-ink sm:text-3xl">
          ドライブトラベルプランナー
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-mute">
          行きたい場所を登録すると、営業時間と移動時間から実際に成立するドライブ旅程を組み立てます。
        </p>
        <div className="mt-4">
          <HeroIllustration />
        </div>
        <div className="relative mt-3 inline-block">
          <button
            onClick={handleShareApp}
            className="rounded-full border border-route/30 bg-card px-4 py-1.5 text-xs text-route shadow-sm hover:border-route hover:bg-route/5"
          >
            🔗 アプリを共有
          </button>
          {shareMessage && (
            <p className="absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap text-[11px] text-leaf">
              {shareMessage}
            </p>
          )}
        </div>
      </header>

      <section className="mb-8">
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex w-full items-center gap-3 rounded-lg border border-amber bg-amber/15 px-4 py-3 text-left font-display text-sm font-medium text-[#8a5a12] shadow-sm transition hover:bg-amber/25"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber text-base font-bold text-ink">
            {showForm ? "×" : "+"}
          </span>
          {showForm ? "閉じる" : "新しい旅行を作成"}
        </button>

        {showForm && (
          <form
            action={handleCreate}
            className="mt-4 space-y-4 rounded-lg border border-amber/30 bg-card p-5 shadow-sm"
          >
            <div>
              <label className="mb-1 block text-xs text-mute">旅行名</label>
              <input
                name="name"
                required
                placeholder="例：京都旅行"
                className="w-full rounded-md border border-amber/40 bg-paper px-3 py-2 text-ink placeholder:text-mute focus:border-amber focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-mute">旅行先</label>
              <input
                name="destination"
                required
                placeholder="例：京都府"
                className="w-full rounded-md border border-amber/40 bg-paper px-3 py-2 text-ink placeholder:text-mute focus:border-amber focus:outline-none"
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-xs text-mute">開始日</label>
                <input
                  type="date"
                  name="start_date"
                  required
                  className="w-full rounded-md border border-amber/40 bg-paper px-3 py-2 font-mono text-sm text-ink focus:border-amber focus:outline-none"
                />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-xs text-mute">終了日</label>
                <input
                  type="date"
                  name="end_date"
                  required
                  className="w-full rounded-md border border-amber/40 bg-paper px-3 py-2 font-mono text-sm text-ink focus:border-amber focus:outline-none"
                />
              </div>
            </div>
            {error && <p className="text-sm text-alert">{error}</p>}
            <button
              type="submit"
              className="rounded-md bg-amber px-4 py-2 font-display text-sm font-medium text-ink transition hover:brightness-105"
            >
              作成する
            </button>
          </form>
        )}
      </section>

      <section>
        {trips === null && <p className="text-sm text-mute">読み込み中...</p>}
        {trips?.length === 0 && (
          <p className="rounded-lg border border-dashed border-amber/40 p-6 text-sm text-mute">
            まだ旅行がありません。上のボタンから最初の旅行を作成してください。
          </p>
        )}
        {deleteError && <p className="mb-3 text-sm text-alert">⚠ {deleteError}</p>}
        <ul className="space-y-3">
          {trips?.map((trip) => (
            <li key={trip.id} className="relative">
              <Link
                href={`/trips/${trip.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border-l-4 border-amber bg-amber/10 px-4 py-4 pr-14 shadow-sm transition hover:shadow-md"
              >
                <p className="font-display text-base font-medium text-ink">
                  {trip.name}
                </p>
                <p className="inline-block rounded-md bg-amber/30 px-2 py-1 font-mono text-sm font-medium text-[#8a5a12]">
                  {trip.start_date} → {trip.end_date}
                </p>
              </Link>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleDeleteTrip(trip.id, trip.name);
                }}
                disabled={deletingId === trip.id}
                aria-label={`${trip.name}を削除`}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md border border-alert/30 bg-card px-2 py-1.5 text-xs text-alert hover:bg-alert/10 disabled:opacity-50"
              >
                {deletingId === trip.id ? "削除中..." : "🗑"}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-12 flex flex-wrap justify-center gap-3 text-center">
        <button
          onClick={() => setShowFeatures(true)}
          className="rounded-full border border-route/30 bg-card px-5 py-2 text-sm text-route shadow-sm hover:border-route hover:bg-route/5"
        >
          📖 機能と使い方
        </button>
        <button
          onClick={() => setShowPolicy(true)}
          className="rounded-full border border-leaf/30 bg-card px-5 py-2 text-sm text-leaf shadow-sm hover:border-leaf hover:bg-leaf/5"
        >
          🔒 Googleデータの取り扱いについて
        </button>
      </section>

      {showFeatures && <FeaturesModal onClose={() => setShowFeatures(false)} />}
      {showPolicy && <PolicyModal onClose={() => setShowPolicy(false)} />}
    </main>
  );
}
