// Google Routes API (computeRoutes) を叩くサーバー側専用のラッパー。
// ドライブ専用アプリのため、自動車(DRIVE)の移動時間のみを取得する(13章)。
//
// 旅程は基本的に未来の予定なので、リアルタイム交通状況(TRAFFIC_AWARE)は使わず、
// 統計的な標準所要時間(TRAFFIC_UNAWARE)を使う。
import { getApiKey } from "./places";

const ROUTES_ENDPOINT = "https://routes.googleapis.com/directions/v2:computeRoutes";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface RouteOptions {
  avoidTolls?: boolean; // 安さ優先(有料道路回避)の場合true
}

// 移動時間(分)を返す。取得できなかった場合はnull(呼び出し側で「移動時間取得失敗」として扱う, 19章)。
export async function getTravelMinutes(
  origin: LatLng,
  destination: LatLng,
  options?: RouteOptions
): Promise<number | null> {
  try {
    const res = await fetch(ROUTES_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": getApiKey(),
        "X-Goog-FieldMask": "routes.duration",
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
        destination: {
          location: { latLng: { latitude: destination.lat, longitude: destination.lng } },
        },
        travelMode: "DRIVE",
        // 未来の旅程なのでリアルタイム交通は考慮しない(統計的な標準所要時間を使う)
        routingPreference: "TRAFFIC_UNAWARE",
        routeModifiers: {
          avoidTolls: options?.avoidTolls ?? false,
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`Routes API 呼び出しに失敗しました (${res.status}): ${body}`);
      return null;
    }

    const data = await res.json();
    const durationStr: string | undefined = data.routes?.[0]?.duration; // 例: "1830s"
    if (!durationStr) {
      console.error("Routes API のレスポンスに duration が含まれていませんでした:", JSON.stringify(data));
      return null;
    }

    const seconds = parseInt(durationStr.replace("s", ""), 10);
    if (Number.isNaN(seconds)) return null;

    return Math.round(seconds / 60);
  } catch (err) {
    console.error("Routes API 呼び出し中に例外が発生しました:", err);
    return null;
  }
}

export interface TollEstimate {
  cash_yen: number | null; // 現金料金(通行券取得を想定)
  etc_yen: number | null; // ETC料金
}

function moneyToYen(money: { units?: string; nanos?: number } | undefined): number | null {
  if (!money) return null;
  const units = money.units ? parseInt(money.units, 10) : 0;
  const nanos = money.nanos ?? 0;
  return Math.round(units + nanos / 1e9);
}

// 1区間の通行料金を、通行券(現金)想定とETC想定の両方で取得する。
// Google Routes API は「tollPassesを指定しない場合は現金料金、指定した場合はそのパスの料金」を返す仕様のため、
// 2回リクエストする必要がある(料金計算リクエストは通常より課金レートが高い点に注意)。
// 有料道路を通らない経路(安さ優先時など)や取得失敗時はどちらもnullを返す。
export async function getTollEstimate(origin: LatLng, destination: LatLng): Promise<TollEstimate> {
  async function fetchOnce(tollPasses?: string[]): Promise<number | null> {
    try {
      const res = await fetch(ROUTES_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": getApiKey(),
          "X-Goog-FieldMask": "routes.travelAdvisory.tollInfo",
        },
        body: JSON.stringify({
          origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
          destination: {
            location: { latLng: { latitude: destination.lat, longitude: destination.lng } },
          },
          travelMode: "DRIVE",
          routingPreference: "TRAFFIC_UNAWARE",
          extraComputations: ["TOLLS"],
          routeModifiers: {
            avoidTolls: false,
            vehicleInfo: { emissionType: "GASOLINE" },
            ...(tollPasses ? { tollPasses } : {}),
          },
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        console.error(`通行料金取得(Routes API)に失敗しました (${res.status}): ${body}`);
        return null;
      }

      const data = await res.json();
      const prices = data.routes?.[0]?.travelAdvisory?.tollInfo?.estimatedPrice as
        | { currencyCode?: string; units?: string; nanos?: number }[]
        | undefined;
      // 価格データが返ってこない場合、「有料道路を通らない」のか「Google側に価格データが無いだけ」なのか
      // この時点では判別できないため、ここでは0円と決めつけずnull(不明)として返す。
      // 最終判定はgetTollEstimate側で、ETC/現金の両方の結果を見比べてから行う。
      if (!prices || prices.length === 0) return null;

      const jpy = prices.find((p) => p.currencyCode === "JPY") ?? prices[0];
      return moneyToYen(jpy);
    } catch (err) {
      console.error("通行料金取得中に例外が発生しました:", err);
      return null;
    }
  }

  const [cash_yen_raw, etc_yen_raw] = await Promise.all([fetchOnce(), fetchOnce(["JP_ETC"])]);

  // 両方とも価格データが無い場合は「有料道路を通らない経路」とみなし0円/0円とする。
  // 片方だけ価格データが無い場合(例: ETCは3000円取れたが現金は取れない)は、
  // 実際には無料ではなく単にデータが無いだけと判断し、0円にせずnull(不明)のままにする。
  if (cash_yen_raw === null && etc_yen_raw === null) {
    return { cash_yen: 0, etc_yen: 0 };
  }
  return { cash_yen: cash_yen_raw, etc_yen: etc_yen_raw };
}
