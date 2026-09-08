"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { shareOrCopy } from "@/lib/share";
import { apiFetch, apiUrl, apiFetchJsonGet } from "@/lib/api-base";
import { estimateStayMinutes } from "@/lib/stay-duration";
import {
  Trip,
  TripPlaceWithInfo,
  PlaceSearchResult,
  PaceMode,
  RoutePreference,
  PlaceInfo,
  TripPlanView,
  DayPlanView,
  PlanStopView,
  ParkingCandidate,
} from "@/lib/types";

interface Holiday {
  date: string;
  name: string;
}

type DayPlaceInfo = Record<number, { origin: PlaceInfo | null; destination: PlaceInfo | null }>;

// 行きたい場所一覧はオレンジ系(アンバー)で統一する
const PLACE_ACCENT = { border: "border-amber", bg: "bg-amber/10" };

const paceLabel: Record<PaceMode, string> = {
  relaxed: "ゆっくり",
  packed: "せかせか",
};

const routePreferenceLabel: Record<RoutePreference, string> = {
  fastest: "速さ優先",
  cheapest: "安さ優先（有料道路回避）",
};

async function patchJson(url: string, body: unknown) {
  const res = await apiFetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? "保存に失敗しました。");
  }
  return res.json();
}

async function postJson(url: string, body: unknown) {
  const res = await apiFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? "リクエストに失敗しました。");
  }
  return res.json();
}

// 出発地・到着地の検索/選択を行う小さな部品。
// 「今の設定」を表示しつつ、常に検索フォームも出しておくことで、
// いつでも直接検索して上書き選択できるようにする(クリア操作は不要)。
function PlacePickerField({
  label,
  placeholder,
  selected,
  onSelect,
}: {
  label: string;
  placeholder: string;
  selected: PlaceInfo | null;
  onSelect: (placeId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await apiFetch(`/api/places/search?q=${encodeURIComponent(query)}`, { cache: "no-store" });
      const data = await res.json();
      if (res.ok) setResults(data.results);
    } finally {
      setSearching(false);
    }
  }

  return (
    <div>
      <label className="mb-1 block text-[11px] text-mute">{label}</label>

      {selected && !open ? (
        <button
          onClick={() => setOpen(true)}
          className="w-full rounded-md border border-amber/40 bg-paper px-2 py-1.5 text-left text-xs text-ink hover:border-amber"
        >
          {selected.name}
        </button>
      ) : (
        <div>
          <form onSubmit={handleSearch} className="flex gap-1.5">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={placeholder}
              className="flex-1 rounded-md border border-amber/40 bg-paper px-2 py-1.5 text-xs text-ink placeholder:text-mute focus:border-amber focus:outline-none"
            />
            <button
              type="submit"
              disabled={searching}
              className="rounded-md border border-amber/40 px-2 py-1.5 text-[11px] text-ink hover:border-amber hover:text-[#8a5a12] disabled:opacity-50"
            >
              検索
            </button>
            {selected && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setResults(null);
                  setQuery("");
                }}
                className="rounded-md border border-amber/40 px-2 py-1.5 text-[11px] text-mute hover:border-amber"
              >
                戻す
              </button>
            )}
          </form>
          {results && (
            <ul className="mt-1.5 space-y-1.5">
              {results.length === 0 && <p className="text-[11px] text-mute">見つかりませんでした。</p>}
              {results.map((r) => (
                <li
                  key={r.place_id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber/30 bg-paper px-2 py-1.5"
                >
                  <div>
                    <p className="text-xs text-ink">{r.name}</p>
                    <p className="text-[10px] text-mute">{r.formatted_address}</p>
                  </div>
                  <button
                    onClick={() => {
                      onSelect(r.place_id);
                      setOpen(false);
                      setResults(null);
                      setQuery("");
                    }}
                    className="shrink-0 rounded-md border border-amber/40 px-2 py-1 text-[11px] text-ink hover:border-amber hover:text-[#8a5a12]"
                  >
                    選択
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default function TripDetailScreen({ tripId }: { tripId: string }) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [places, setPlaces] = useState<TripPlaceWithInfo[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [dayPlaceInfo, setDayPlaceInfo] = useState<DayPlaceInfo>({});
  const [planView, setPlanView] = useState<TripPlanView | null>(null);

  // 訪問地ごとの周辺駐車場は保存せず、「周辺駐車場」ボタンを押した時点でその都度検索する
  // (Googleポリシー対応。lib/plan-view.ts, app/api/.../parking/route.ts 参照)。
  const [parkingLists, setParkingLists] = useState<Record<string, ParkingCandidate[]>>({});
  const [parkingLoadingId, setParkingLoadingId] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PlaceSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);

  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [editingDates, setEditingDates] = useState(false);
  const [datesError, setDatesError] = useState<string | null>(null);
  const [datesSaving, setDatesSaving] = useState(false);
  const [shareMessage, setShareMessage] = useState<string | null>(null);

  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  const [expandedParking, setExpandedParking] = useState<string | null>(null);
  const [parkingActionError, setParkingActionError] = useState<string | null>(null);

  // 滞在時間・日ごとの活動時間の入力欄は、フォーカスが外れなくても
  // 「プランを作成」を押した瞬間に画面上の現在値をそのまま読み取って保存できるよう、
  // DOM要素への参照をここに保持しておく。
  const stayInputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const dayStartRefs = useRef<Map<number, HTMLInputElement>>(new Map());
  const dayEndRefs = useRef<Map<number, HTMLInputElement>>(new Map());

  const loadTrip = useCallback(async () => {
    try {
      const { ok, data } = await apiFetchJsonGet(`/api/trips/${tripId}`);
      if (!ok) {
        setTrip(null);
        setPlaces([]);
        setLoadError((data as { error?: string } | null)?.error ?? "旅行が見つかりませんでした。");
        return;
      }
      const body = data as {
        trip: Trip;
        places: TripPlaceWithInfo[];
        holidays?: Holiday[];
        day_place_info?: DayPlaceInfo;
        plan_view?: TripPlanView | null;
      };
      setTrip(body.trip);
      setPlaces(body.places);
      setHolidays(body.holidays ?? []);
      setDayPlaceInfo(body.day_place_info ?? {});
      setPlanView(body.plan_view ?? null);
      setLoadError(null);
    } catch (err) {
      // モバイルでNEXT_PUBLIC_API_BASE_URLの設定漏れ等によりAPIに到達できない場合、
      // ここでJSON以外(HTMLのエラーページ等)が返ってきたことが分かるメッセージになる。
      setTrip(null);
      setPlaces([]);
      setLoadError(err instanceof Error ? err.message : "旅行データの取得に失敗しました。");
    }
  }, [tripId]);

  useEffect(() => {
    loadTrip();
  }, [loadTrip]);

  // --- 行きたい場所の検索 ---
  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setSearchError(null);
    try {
      const res = await apiFetch(`/api/places/search?q=${encodeURIComponent(query)}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setSearchError(data.error ?? "検索に失敗しました。");
        setSearchResults(null);
        return;
      }
      setSearchResults(data.results);
    } finally {
      setSearching(false);
    }
  }

  async function handleAdd(placeId: string) {
    setAddError(null);
    const res = await apiFetch(`/api/trips/${tripId}/places`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ google_place_id: placeId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setAddError(data.error ?? "追加に失敗しました。");
      return;
    }
    setSearchResults(null);
    setQuery("");
    loadTrip();
  }

  async function handleRemove(tripPlaceId: string) {
    await apiFetch(`/api/trips/${tripId}/places?place_id=${tripPlaceId}`, {
      method: "DELETE",
    });
    loadTrip();
  }

  // --- 活動量・経路の希望 ---
  async function handlePaceChange(pace: PaceMode) {
    try {
      await patchJson(`/api/trips/${tripId}/settings`, { pace });
      setSettingsError(null);
      await loadTrip();
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : "保存に失敗しました。");
    }
  }

  async function handleRoutePreferenceChange(route_preference: RoutePreference) {
    try {
      await patchJson(`/api/trips/${tripId}/settings`, { route_preference });
      setSettingsError(null);
      await loadTrip();
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : "保存に失敗しました。");
    }
  }

  // --- 日ごとの出発地・到着地 ---
  async function handleSelectDayOrigin(day: number, placeId: string) {
    try {
      await patchJson(`/api/trips/${tripId}/day-config`, { day, origin_place_id: placeId });
      setSettingsError(null);
      await loadTrip();
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : "保存に失敗しました。");
    }
  }

  async function handleSelectDayDestination(day: number, placeId: string) {
    try {
      await patchJson(`/api/trips/${tripId}/day-config`, { day, destination_place_id: placeId });
      setSettingsError(null);
      await loadTrip();
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : "保存に失敗しました。");
    }
  }

  // 画面に今表示されている「滞在時間」「日ごとの活動時間」の入力値を、
  // フォーカスの有無に関わらずそのまま読み取って保存する。
  // 「プランを作成」の直前に必ず呼ぶことで、入力し忘れ・保存漏れをなくす。
  async function flushPendingInputs() {
    const tasks: Promise<unknown>[] = [];

    for (const [tripPlaceId, el] of stayInputRefs.current.entries()) {
      const v = el.value.trim();
      if (v !== "") {
        tasks.push(
          patchJson(`/api/trips/${tripId}/places/${tripPlaceId}/stay-duration`, {
            minutes: Number(v),
          })
        );
      }
    }

    if (trip) {
      for (const dc of trip.day_configs) {
        const startEl = dayStartRefs.current.get(dc.day);
        const endEl = dayEndRefs.current.get(dc.day);
        const patch: { activity_start_time?: string; activity_end_time?: string } = {};
        if (startEl && startEl.value && startEl.value !== dc.activity_start_time) {
          patch.activity_start_time = startEl.value;
        }
        if (endEl && endEl.value && endEl.value !== dc.activity_end_time) {
          patch.activity_end_time = endEl.value;
        }
        if (Object.keys(patch).length > 0) {
          tasks.push(patchJson(`/api/trips/${tripId}/day-config`, { day: dc.day, ...patch }));
        }
      }
    }

    if (tasks.length > 0) {
      await Promise.all(tasks);
      await loadTrip();
    }
  }

  // --- プラン生成 ---
  async function handleGeneratePlan() {
    setPlanLoading(true);
    setPlanError(null);
    try {
      await flushPendingInputs();

      const res = await apiFetch(`/api/trips/${tripId}/plan`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setPlanError(data.error ?? "プランの作成に失敗しました。");
        return;
      }
      setTrip(data.trip);
      setPlanView(data.plan);
      setParkingLists({}); // 新しいプランなので、以前開いていた駐車場一覧はリセットする
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : "プランの作成に失敗しました。");
    } finally {
      setPlanLoading(false);
    }
  }

  // --- 旅程の共有 ---
  async function handleShareTrip() {
    if (!trip) return;
    const url = typeof window !== "undefined" ? window.location.href : undefined;
    const dateRange = `${trip.start_date} 〜 ${trip.end_date}`;
    const result = await shareOrCopy({
      title: trip.name,
      text: `${trip.name}（${dateRange}）の旅程です。`,
      url,
    });
    if (result === "copied") setShareMessage("リンクをコピーしました");
    if (result === "failed") return;
    setTimeout(() => setShareMessage(null), 2500);
  }

  // --- 日程(開始日・終了日)の変更 ---
  async function handleUpdateDates(formData: FormData) {
    const startDate = formData.get("start_date") as string;
    const endDate = formData.get("end_date") as string;
    if (!startDate || !endDate) return;

    setDatesError(null);
    setDatesSaving(true);
    try {
      const res = await apiFetch(`/api/trips/${tripId}/dates`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start_date: startDate, end_date: endDate }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDatesError(data.error ?? "日程の変更に失敗しました。");
        return;
      }
      setEditingDates(false);
      await loadTrip();
    } catch {
      setDatesError("日程の変更に失敗しました。");
    } finally {
      setDatesSaving(false);
    }
  }

  // --- 駐車場の一覧を都度取得(保存はしない。ボタンを押した時だけ検索する) ---
  async function handleToggleParking(tripPlaceId: string) {
    const willExpand = expandedParking !== tripPlaceId;
    setExpandedParking((cur) => (cur === tripPlaceId ? null : tripPlaceId));

    if (willExpand && !parkingLists[tripPlaceId]) {
      setParkingLoadingId(tripPlaceId);
      setParkingActionError(null);
      try {
        const res = await apiFetch(`/api/trips/${tripId}/plan/stops/${tripPlaceId}/parking`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (!res.ok) {
          setParkingActionError(data.error ?? "駐車場の検索に失敗しました。");
          return;
        }
        setParkingLists((prev) => ({ ...prev, [tripPlaceId]: data.parking ?? [] }));
      } catch {
        setParkingActionError("駐車場の検索に失敗しました。");
      } finally {
        setParkingLoadingId(null);
      }
    }
  }

  // --- 駐車場の選択 ---
  // 選択した駐車場のPlace IDと徒歩時間計算用の距離だけをサーバーに送る(名称等は送らない=保存しない)。
  async function handleSelectParking(
    day: number,
    tripPlaceId: string,
    parking: { place_id: string; distance_meters: number | null } | null
  ) {
    setParkingActionError(null);
    try {
      await postJson(`/api/trips/${tripId}/plan/select-parking`, {
        day,
        trip_place_id: tripPlaceId,
        parking_place_id: parking?.place_id ?? null,
        distance_meters: parking?.distance_meters ?? null,
      });
      // 選択に応じて時刻が再計算されるため、表示用プランを取得し直す
      await loadTrip();
    } catch (err) {
      setParkingActionError(err instanceof Error ? err.message : "駐車場の選択に失敗しました。");
    }
  }

  if (places === null) {
    return <p className="text-sm text-mute">読み込み中...</p>;
  }

  if (!trip) {
    return (
      <div>
        <p className="text-sm text-alert">{loadError ?? "旅行が見つかりませんでした。"}</p>
        <Link href="/" className="mt-4 inline-block text-sm text-route underline">
          旅行一覧に戻る
        </Link>
      </div>
    );
  }

  const addedPlaceIds = new Set(places.map((p) => p.google_place_id));

  return (
    <main>
      <Link href="/" className="text-xs text-mute hover:text-route">
        ← 旅行一覧
      </Link>

      <header className="mb-6 mt-3">
        <h1 className="font-display text-xl font-bold text-ink sm:text-2xl">{trip.name}</h1>
        <p className="mt-1 text-sm text-mute">{trip.destination}</p>

        {!editingDates ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <p className="inline-block rounded-md bg-route/10 px-2 py-1 font-mono text-sm text-route">
              {trip.start_date} → {trip.end_date}
            </p>
            <button
              onClick={() => {
                setDatesError(null);
                setEditingDates(true);
              }}
              className="rounded-md border border-route/30 px-2 py-1 text-xs text-route hover:border-route hover:bg-route/5"
            >
              ✏ 日程を変更
            </button>
          </div>
        ) : (
          <form
            action={handleUpdateDates}
            className="mt-2 space-y-2 rounded-lg border border-route/20 bg-card p-3 shadow-sm"
          >
            <p className="text-xs text-mute">
              日程を変更すると、生成済みのプランはリセットされます（もう一度「プランを作成」が必要です）。日ごとの活動時間・出発地/到着地は、同じ日付が残っていればそのまま引き継がれます。
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label className="mb-1 block text-[11px] text-mute">開始日</label>
                <input
                  type="date"
                  name="start_date"
                  defaultValue={trip.start_date}
                  required
                  className="rounded-md border border-route/30 bg-paper px-2 py-1.5 font-mono text-sm text-ink focus:border-route focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-mute">終了日</label>
                <input
                  type="date"
                  name="end_date"
                  defaultValue={trip.end_date}
                  required
                  className="rounded-md border border-route/30 bg-paper px-2 py-1.5 font-mono text-sm text-ink focus:border-route focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={datesSaving}
                className="rounded-md bg-route px-3 py-1.5 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50"
              >
                {datesSaving ? "更新中..." : "更新する"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingDates(false);
                  setDatesError(null);
                }}
                className="rounded-md border border-route/30 px-3 py-1.5 text-sm text-mute hover:border-route"
              >
                キャンセル
              </button>
            </div>
            {datesError && <p className="text-sm text-alert">⚠ {datesError}</p>}
          </form>
        )}
      </header>

      {holidays.length > 0 && (
        <div className="mb-6 rounded-lg border border-[#E0B84D]/50 bg-[#FBF3DE] p-4 text-sm text-[#8a5a12]">
          <p className="font-medium">⚠ 旅行期間中に祝日が含まれています</p>
          <ul className="mt-1 list-inside list-disc">
            {holidays.map((h) => (
              <li key={h.date}>
                {h.date}（{h.name}）
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs">
            祝日は通常と営業時間が異なる場合があります。念のため各施設の公式情報もご確認ください。
          </p>
        </div>
      )}

      {/* 行きたい場所の検索 */}
      <section className="mb-8">
        <h2 className="mb-3 font-display text-sm font-medium text-ink">
          行きたい場所を検索
        </h2>
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="例: 清水寺"
            className="flex-1 rounded-md border border-route/30 bg-card px-3 py-2 text-ink placeholder:text-mute focus:border-route focus:outline-none"
          />
          <button
            type="submit"
            disabled={searching}
            className="rounded-md bg-amber px-4 py-2 font-display text-sm font-medium text-ink transition hover:brightness-105 disabled:opacity-50"
          >
            {searching ? "検索中..." : "検索"}
          </button>
        </form>

        {searchError && <p className="mt-2 text-sm text-alert">{searchError}</p>}
        {addError && <p className="mt-2 text-sm text-alert">{addError}</p>}

        {searchResults && (
          <ul className="mt-3 space-y-2">
            {searchResults.length === 0 && (
              <p className="text-sm text-mute">該当する場所が見つかりませんでした。</p>
            )}
            {searchResults.map((r) => {
              const already = addedPlaceIds.has(r.place_id);
              return (
                <li
                  key={r.place_id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-route/20 bg-card px-3 py-2 shadow-sm"
                >
                  <div>
                    <p className="text-sm text-ink">{r.name}</p>
                    <p className="text-xs text-mute">{r.formatted_address}</p>
                  </div>
                  <button
                    onClick={() => handleAdd(r.place_id)}
                    disabled={already}
                    className="shrink-0 rounded-md border border-route/30 px-3 py-1 text-xs text-ink hover:border-route hover:text-route disabled:opacity-40"
                  >
                    {already ? "追加済み" : "追加"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 行きたい場所一覧 */}
      <section className="mb-10">
        <h2 className="mb-3 font-display text-sm font-medium text-ink">
          行きたい場所一覧（{places.length}件）
        </h2>

        {places.length === 0 && (
          <p className="rounded-lg border border-dashed border-route/30 p-6 text-sm text-mute">
            まだ場所が登録されていません。上の検索から追加してください。
          </p>
        )}

        <ul className="space-y-3">
          {places.map((p) => {
            return (
              <li key={p.id} className={`rounded-lg border-l-4 ${PLACE_ACCENT.border} ${PLACE_ACCENT.bg} p-4 shadow-sm`}>
                {p.place_info ? (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="font-display text-sm font-medium text-ink">{p.place_info.name}</p>
                      <button
                        onClick={() => handleRemove(p.id)}
                        className="text-xs text-mute hover:text-alert"
                      >
                        削除
                      </button>
                    </div>
                    <p className="mt-1 text-xs text-mute">{p.place_info.formatted_address}</p>

                    {/* 旅行日程に対応する日付分だけの営業時間 */}
                    <ul className="mt-2 space-y-0.5 font-mono text-xs text-mute">
                      {p.hours_for_trip_dates.map((h) => (
                        <li key={h.date} className="flex gap-2">
                          <span className="w-24 shrink-0">
                            {h.date.slice(5).replace("-", "/")}（{h.weekday_label}）
                          </span>
                          <span className={h.status === "closed" ? "text-alert" : ""}>{h.text}</span>
                        </li>
                      ))}
                    </ul>

                    <div className="mt-3 flex items-center gap-2">
                      <span className="text-xs text-mute">滞在時間:</span>
                      <input
                        key={p.id}
                        ref={(el) => {
                          if (el) stayInputRefs.current.set(p.id, el);
                          else stayInputRefs.current.delete(p.id);
                        }}
                        type="number"
                        min={0}
                        step={15}
                        defaultValue={p.user_defined_stay_duration ?? ""}
                        placeholder="自動推定"
                        className="w-28 rounded-md border border-amber/40 bg-paper px-2 py-1 text-xs text-ink placeholder:text-mute focus:border-amber focus:outline-none"
                      />
                      <span className="text-xs text-mute">
                        分（空欄なら自動推定: 約
                        {estimateStayMinutes(p.place_info.primary_type, trip.pace)}分）
                      </span>
                    </div>

                    {p.place_info.google_maps_uri && (
                      <a
                        href={p.place_info.google_maps_uri}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-block text-xs text-[#8a5a12] underline"
                      >
                        Google Mapsで開く
                      </a>
                    )}
                  </>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-alert">⚠ この場所の情報を取得できませんでした。</p>
                    <button onClick={() => handleRemove(p.id)} className="text-xs text-mute hover:text-alert">
                      削除
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* 旅程設定 */}
      <section className="mb-10">
        <h2 className="mb-3 font-display text-sm font-medium text-ink">旅程設定</h2>

        {settingsError && <p className="mb-2 text-sm text-alert">⚠ {settingsError}</p>}

        <div className="space-y-4 rounded-lg border border-route/20 bg-card p-5 shadow-sm">
          <div className="flex flex-wrap gap-6">
            <div>
              <label className="mb-1 block text-xs text-mute">活動ペース</label>
              <div className="flex flex-wrap gap-2">
                {(["relaxed", "packed"] as PaceMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => handlePaceChange(m)}
                    className={`rounded-md border px-3 py-1.5 text-xs transition ${
                      trip.pace === m
                        ? "border-leaf bg-leaf text-white"
                        : "border-leaf/30 text-ink hover:border-leaf"
                    }`}
                  >
                    {paceLabel[m]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs text-mute">経路の希望</label>
              <div className="flex flex-wrap gap-2">
                {(["fastest", "cheapest"] as RoutePreference[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => handleRoutePreferenceChange(m)}
                    className={`rounded-md border px-3 py-1.5 text-xs transition ${
                      trip.route_preference === m
                        ? "border-amber bg-amber text-ink"
                        : "border-amber/40 text-ink hover:border-amber"
                    }`}
                  >
                    {routePreferenceLabel[m]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-xs text-mute">日ごとの設定</label>
            <div className="space-y-4">
              {trip.day_configs.map((dc) => (
                <div key={dc.day} className="rounded-md border-l-4 border-amber bg-amber/10 p-3">
                  <p className="mb-2">
                    <span className="rounded-full bg-amber/30 px-2 py-0.5 font-mono text-[11px] text-[#8a5a12]">
                      Day{dc.day}（{dc.date.slice(5).replace("-", "/")}）
                    </span>
                  </p>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <PlacePickerField
                      label="出発地"
                      placeholder="例: 京都駅"
                      selected={dayPlaceInfo[dc.day]?.origin ?? null}
                      onSelect={(placeId) => handleSelectDayOrigin(dc.day, placeId)}
                    />
                    <PlacePickerField
                      label="到着地"
                      placeholder="例: 京都駅前 ホテル"
                      selected={dayPlaceInfo[dc.day]?.destination ?? null}
                      onSelect={(placeId) => handleSelectDayDestination(dc.day, placeId)}
                    />
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-[11px] text-mute">活動時間</span>
                    <input
                      ref={(el) => {
                        if (el) dayStartRefs.current.set(dc.day, el);
                        else dayStartRefs.current.delete(dc.day);
                      }}
                      type="time"
                      defaultValue={dc.activity_start_time}
                      className="rounded-md border border-amber/40 bg-card px-2 py-1 font-mono text-xs text-ink focus:border-amber focus:outline-none"
                    />
                    <span className="text-mute">〜</span>
                    <input
                      ref={(el) => {
                        if (el) dayEndRefs.current.set(dc.day, el);
                        else dayEndRefs.current.delete(dc.day);
                      }}
                      type="time"
                      defaultValue={dc.activity_end_time}
                      className="rounded-md border border-amber/40 bg-card px-2 py-1 font-mono text-xs text-ink focus:border-amber focus:outline-none"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* プラン生成 */}
      <section className="mb-10">
        <button
          onClick={handleGeneratePlan}
          disabled={planLoading || places.length === 0}
          className="w-full rounded-lg bg-amber px-4 py-3 font-display text-sm font-medium text-ink shadow-sm transition hover:brightness-105 disabled:opacity-50"
        >
          {planLoading ? "ルートを計算しています..." : "プランを作成"}
        </button>
        {planError && <p className="mt-2 text-sm text-alert">{planError}</p>}

        {planView && (
          <PlanResult
            plan={planView}
            expandedParking={expandedParking}
            onToggleParking={handleToggleParking}
            onSelectParking={handleSelectParking}
            parkingLists={parkingLists}
            parkingLoadingId={parkingLoadingId}
            parkingActionError={parkingActionError}
            onShare={handleShareTrip}
            shareMessage={shareMessage}
            tripId={tripId}
          />
        )}
      </section>

      <p className="mt-10 text-center text-[10px] text-mute">Powered by Google</p>
    </main>
  );
}

function PlanResult({
  plan,
  tripId,
  expandedParking,
  onToggleParking,
  onSelectParking,
  parkingLists,
  parkingLoadingId,
  parkingActionError,
  onShare,
  shareMessage,
}: {
  plan: TripPlanView;
  tripId: string;
  expandedParking: string | null;
  onToggleParking: (tripPlaceId: string) => void;
  onSelectParking: (
    day: number,
    tripPlaceId: string,
    parking: { place_id: string; distance_meters: number | null } | null
  ) => void;
  parkingLists: Record<string, ParkingCandidate[]>;
  parkingLoadingId: string | null;
  parkingActionError: string | null;
  onShare: () => void;
  shareMessage: string | null;
}) {
  return (
    <div className="mt-6 space-y-6">
      {parkingActionError && <p className="text-sm text-alert">⚠ {parkingActionError}</p>}

      {plan.days.map((day) => (
        <DayTimeline
          key={day.day}
          day={day}
          expandedParking={expandedParking}
          onToggleParking={onToggleParking}
          onSelectParking={onSelectParking}
          parkingLists={parkingLists}
          parkingLoadingId={parkingLoadingId}
        />
      ))}

      {plan.unassigned.length > 0 && (
        <div className="rounded-lg border border-alert/40 bg-[#FBE9E4] p-4 text-sm text-alert">
          <p className="font-medium">⚠ 組み込めなかった場所があります</p>
          <ul className="mt-1 list-inside list-disc text-xs">
            {plan.unassigned.map((u) => (
              <li key={u.trip_place_id}>
                {u.name}：{u.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Googleでの表示・保存は最下部にまとめる */}
      <div className="rounded-lg border border-route/20 bg-card p-4 shadow-sm">
        <p className="text-sm font-medium text-ink">Googleマップに保存する（KML）</p>
        <a
          href={apiUrl(`/api/trips/${tripId}/export/kml`)}
          className="mt-2 inline-block rounded-md border border-route/30 px-3 py-1.5 text-xs text-route hover:border-route"
        >
          KMLファイルをダウンロード
        </a>
        <ol className="mt-3 list-inside list-decimal space-y-1 text-xs text-mute">
          <li>上のボタンでKMLファイルをダウンロードする</li>
          <li>
            <a
              href="https://mymaps.google.com/"
              target="_blank"
              rel="noreferrer"
              className="text-route underline"
            >
              Googleマイマップ
            </a>
            を開き、「新しい地図を作成」をクリックする
          </li>
          <li>「インポート」からダウンロードしたKMLファイルを選択する</li>
          <li>地図が作成され、Googleアカウント上に保存される（スマホのGoogleマップアプリからも閲覧可能）</li>
        </ol>
      </div>

      {/* 旅程のエクスポート */}
      <div className="rounded-lg border border-route/20 bg-card p-4 shadow-sm">
        <p className="text-sm font-medium text-ink">旅程をエクスポート</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <a
            href={apiUrl(`/api/trips/${tripId}/export/docx`)}
            className="rounded-md border border-route/30 bg-paper px-3 py-1.5 text-xs text-route hover:border-route hover:bg-route/10"
          >
            📄 Word（.docx）
          </a>
          <a
            href={apiUrl(`/api/trips/${tripId}/export/xlsx`)}
            className="rounded-md border border-leaf/30 bg-paper px-3 py-1.5 text-xs text-leaf hover:border-leaf hover:bg-leaf/10"
          >
            📊 Excel（.xlsx）
          </a>
          <a
            href={apiUrl(`/api/trips/${tripId}/export/print`)}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-alert/30 bg-paper px-3 py-1.5 text-xs text-alert hover:border-alert hover:bg-alert/10"
          >
            🖨 印刷 / PDF保存
          </a>
          <a
            href={apiUrl(`/api/trips/${tripId}/export/ics`)}
            className="rounded-md border border-amber/40 bg-paper px-3 py-1.5 text-xs text-[#8a5a12] hover:border-amber hover:bg-amber/10"
          >
            📅 カレンダーに追加（.ics）
          </a>
          <a
            href={apiUrl(`/api/trips/${tripId}/export/txt`)}
            className="rounded-md border border-route/30 bg-paper px-3 py-1.5 text-xs text-ink hover:border-route hover:text-route"
          >
            📝 テキスト（.txt）
          </a>
        </div>
        <p className="mt-2 text-[11px] text-mute">
          「印刷 / PDF保存」は新しいタブでページを開きます。ブラウザの印刷機能（Ctrl+P / ⌘+P）から「PDFとして保存」を選ぶとPDF化できます。「カレンダーに追加」はGoogleカレンダー・Appleカレンダー・Outlook等にインポートできます。
        </p>
      </div>

      {/* 旅程の共有 */}
      <div className="relative rounded-lg border border-leaf/30 bg-leaf/5 p-4 text-center shadow-sm">
        <button
          onClick={onShare}
          className="rounded-full border border-leaf bg-leaf/10 px-4 py-2 text-sm text-leaf hover:bg-leaf/20"
        >
          🔗 旅程を共有
        </button>
        {shareMessage && <p className="mt-2 text-[11px] text-leaf">{shareMessage}</p>}
      </div>
    </div>
  );
}

// タイムライン1行分のデータ。kind="place" の行だけ左側にドット(訪問地点マーカー)を表示する。
type TimelineRow =
  | { kind: "origin" | "destination"; time: string; label: string }
  | { kind: "stop"; stop: PlanStopView; arriveTime: string; departTime: string }
  | { kind: "travel"; minutes: number; tollCash: number | null; tollEtc: number | null };

function buildTimelineRows(day: DayPlanView): TimelineRow[] {
  const rows: TimelineRow[] = [];

  if (day.start_location_name) {
    rows.push({ kind: "origin", time: day.start_time, label: `${day.start_location_name}（出発）` });
  }

  day.stops.forEach((stop, i) => {
    if (i === 0 && stop.travel_minutes_from_prev != null) {
      rows.push({
        kind: "travel",
        minutes: stop.travel_minutes_from_prev,
        tollCash: stop.toll_cash_yen,
        tollEtc: stop.toll_etc_yen,
      });
    }

    rows.push({ kind: "stop", stop, arriveTime: stop.arrival_time, departTime: stop.departure_time });

    const nextTravel =
      i < day.stops.length - 1
        ? day.stops[i + 1].travel_minutes_from_prev
        : day.end_location_name
        ? day.travel_minutes_to_end
        : null;
    const nextTollCash = i < day.stops.length - 1 ? day.stops[i + 1].toll_cash_yen : day.toll_cash_yen_to_end;
    const nextTollEtc = i < day.stops.length - 1 ? day.stops[i + 1].toll_etc_yen : day.toll_etc_yen_to_end;
    if (nextTravel != null) {
      rows.push({ kind: "travel", minutes: nextTravel, tollCash: nextTollCash, tollEtc: nextTollEtc });
    }
  });

  // 訪問地が1件も無い日(出発地から到着地へ直行するだけの日)は、上のforEachが1度も回らず
  // 移動区間の行が抜け落ちてしまうため、ここで出発地→到着地の移動・通行料金を補う。
  if (day.stops.length === 0 && day.end_location_name && day.travel_minutes_to_end != null) {
    rows.push({
      kind: "travel",
      minutes: day.travel_minutes_to_end,
      tollCash: day.toll_cash_yen_to_end,
      tollEtc: day.toll_etc_yen_to_end,
    });
  }

  if (day.end_location_name) {
    rows.push({
      kind: "destination",
      time: day.arrival_at_end_time ?? "--:--",
      label: `${day.end_location_name}（到着）`,
    });
  }

  return rows;
}

// 縦のネイビー線+ドットで巡回順を表すタイムライン表示。
function DayTimeline({
  day,
  expandedParking,
  onToggleParking,
  onSelectParking,
  parkingLists,
  parkingLoadingId,
}: {
  day: DayPlanView;
  expandedParking: string | null;
  onToggleParking: (tripPlaceId: string) => void;
  onSelectParking: (
    day: number,
    tripPlaceId: string,
    parking: { place_id: string; distance_meters: number | null } | null
  ) => void;
  parkingLists: Record<string, ParkingCandidate[]>;
  parkingLoadingId: string | null;
}) {
  const rows = buildTimelineRows(day);

  return (
    <div className="rounded-lg border border-route/20 bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-display text-sm font-semibold text-ink">
          <span className="mr-2 inline-block rounded-full bg-route px-2.5 py-0.5 text-[11px] font-medium text-white">
            DAY {day.day}
          </span>
          {day.date}
        </p>
        {day.google_maps_url && (
          <a
            href={day.google_maps_url}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-leaf bg-leaf/10 px-2 py-1 text-xs font-medium text-leaf hover:bg-leaf/20"
          >
            🗺 Googleマップで開く
          </a>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="mt-2 text-xs text-mute">この日に組み込める場所がありませんでした。</p>
      ) : (
        <div className="relative mt-4">
          <div className="absolute bottom-2 left-[9px] top-2 w-px bg-route/30" />
          <div className="space-y-3 pl-7">
            {rows.map((row, i) => {
              if (row.kind === "travel") {
                // ETC・現金のどちらかが正の金額 → 有料道路を使う区間とみなして表示する。
                // 値がnullの場合は「価格データなし」であり0円ではないので「不明」と表示する。
                const usesToll = (row.tollCash ?? 0) > 0 || (row.tollEtc ?? 0) > 0;
                return (
                  <p key={i} className="text-xs text-mute">
                    移動：{row.minutes}分
                    {usesToll && (
                      <span className="text-amber">
                        {" "}
                        / 通行料 ETC {row.tollEtc != null ? `${row.tollEtc}円` : "不明"}
                        {" ・ "}
                        現金 {row.tollCash != null ? `${row.tollCash}円` : "不明"}
                      </span>
                    )}
                  </p>
                );
              }

              if (row.kind === "origin" || row.kind === "destination") {
                const dotColor = row.kind === "origin" ? "bg-leaf" : "bg-alert";
                return (
                  <div key={i} className="relative">
                    <span className={`absolute -left-[19px] top-1 h-2.5 w-2.5 rounded-full ${dotColor}`} />
                    <p className="font-mono text-xs text-ink">{row.time}</p>
                    <p className="text-sm font-medium text-ink">
                      {row.kind === "origin" ? "🚗 " : "🏁 "}
                      {row.label}
                    </p>
                  </div>
                );
              }

              // ここまでで travel / origin / destination のいずれでもないため、
              // 残りは必ず "stop" のはずだが、TypeScriptに明示的に絞り込ませるためガードを入れる。
              if (row.kind !== "stop") {
                return null;
              }

              const stop = row.stop;
              const isExpanded = expandedParking === stop.trip_place_id;

              return (
                <div key={i} className="relative">
                  <span className="absolute -left-[19px] top-1 h-2.5 w-2.5 rounded-full bg-route" />
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-mono text-xs text-ink">
                        {row.arriveTime}
                        {row.departTime !== row.arriveTime && (
                          <span className="text-ink"> 〜 {row.departTime}</span>
                        )}
                      </p>
                      <p className="text-sm font-medium text-ink">
                        {stop.name}
                        <span className="ml-1 font-normal text-mute">（滞在{stop.stay_minutes}分）</span>
                        {stop.hours_uncertain && <span className="ml-1 text-[10px] text-[#9C6A13]">※営業時間不明</span>}
                      </p>
                      {stop.selected_parking && (
                        <p className="mt-0.5 text-[11px] text-leaf">
                          🅿 {stop.selected_parking.name}（徒歩{stop.parking_walk_minutes}分）を利用
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => onToggleParking(stop.trip_place_id)}
                      className="shrink-0 rounded-md border border-route/30 bg-route/5 px-2 py-1 text-[11px] text-route hover:border-route hover:bg-route/10"
                    >
                      🅿 周辺駐車場
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="mt-2 space-y-1.5 rounded-md border border-route/20 bg-paper p-2">
                      {parkingLoadingId === stop.trip_place_id && (
                        <p className="text-[11px] text-mute">検索中...</p>
                      )}
                      {parkingLoadingId !== stop.trip_place_id &&
                        (parkingLists[stop.trip_place_id]?.length ?? 0) === 0 && (
                          <p className="text-[11px] text-mute">周辺に駐車場候補が見つかりませんでした。</p>
                        )}
                      {(parkingLists[stop.trip_place_id] ?? []).map((pk) => {
                        const selected = stop.selected_parking?.place_id === pk.place_id;
                        return (
                          <div
                            key={pk.place_id}
                            className={`flex flex-wrap items-center justify-between gap-2 rounded-md border px-2 py-1.5 ${
                              selected ? "border-leaf bg-leaf/10" : "border-route/20"
                            }`}
                          >
                            <div>
                              <p className="text-xs text-ink">{pk.name}</p>
                              <p className="text-[10px] text-mute">
                                {pk.distance_meters != null ? `名所から約${pk.distance_meters}m` : "距離不明"}
                              </p>
                            </div>
                            <button
                              onClick={() =>
                                onSelectParking(
                                  day.day,
                                  stop.trip_place_id,
                                  selected
                                    ? null
                                    : { place_id: pk.place_id, distance_meters: pk.distance_meters }
                                )
                              }
                              className={`shrink-0 rounded-md border px-2 py-1 text-[11px] ${
                                selected
                                  ? "border-alert text-alert hover:bg-alert/10"
                                  : "border-leaf/40 text-leaf hover:border-leaf hover:bg-leaf/10"
                              }`}
                            >
                              {selected ? "選択解除" : "選択"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
