import { auth } from "@/lib/firebase";

export type TimeRangeKey = "7d" | "30d" | "365d";
export type ChartStyleKey = "auto" | "bar" | "line" | "area";

export type MetricKey =
  | "weight"
  | "activities"
  | "sleepTime"
  | "skinCare"
  | "shower"
  | "supplement"
  | "nutritionCalorieScore"
  | "nutritionProteinScore"
  | "nutritionQualityScore"
  | "foodHealthScore";

export type StatsSeriesResponse = {
  metric: MetricKey;
  metricLabel: string;
  timeRange: TimeRangeKey;
  labels: string[];
  values: Array<number | null>;
  hasData: boolean;
  stats: {
    count: number;
    min: number;
    max: number;
    avg: number;
  } | null;
  chart?: {
    label: string;
    defaultStyle: Exclude<ChartStyleKey, "auto">;
    color: string;
    recommendedSmoothing: boolean;
  };
  generatedAt: string;
};

export const chartStyleOptions: Array<{ key: ChartStyleKey; label: string }> = [
  { key: "auto", label: "Auto (Python)" },
  { key: "bar", label: "Barres" },
  { key: "line", label: "Courbe" },
  { key: "area", label: "Aire" },
];

export const metricOptions: Array<{ key: MetricKey; label: string }> = [
  { key: "weight", label: "Poids" },
  { key: "activities", label: "Nb activites" },
  { key: "sleepTime", label: "Temps de sommeil" },
  { key: "skinCare", label: "Skin care" },
  { key: "shower", label: "Shower" },
  { key: "supplement", label: "Supplement" },
  { key: "nutritionCalorieScore", label: "Nutrition calories" },
  { key: "nutritionProteinScore", label: "Nutrition proteines" },
  { key: "nutritionQualityScore", label: "Nutrition qualite" },
  { key: "foodHealthScore", label: "Food health score" },
];

export const timeRangeOptions: Array<{ key: TimeRangeKey; label: string }> = [
  { key: "7d", label: "Derniere semaine" },
  { key: "30d", label: "Dernier mois" },
  { key: "365d", label: "Derniere annee" },
];

const getApiBaseUrl = () => {
  const value = process.env.NEXT_PUBLIC_STATS_API_BASE_URL ?? "";
  return value.trim().replace(/\/+$/, "");
};

const getUserToken = async (forceRefresh = false) => {
  const user = auth?.currentUser;
  if (!user) {
    throw new Error("Utilisateur non connecte.");
  }
  return user.getIdToken(forceRefresh);
};

const requestWithBearer = async (fullUrl: string, token: string) => {
  return fetch(fullUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });
};

const fetchWithAuth = async (path: string) => {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) {
    throw new Error("API stats non configuree (NEXT_PUBLIC_STATS_API_BASE_URL).");
  }

  const fullUrl = `${baseUrl}${path}`;
  console.log("[statsApi] Fetching:", fullUrl);

  let response: Response;
  try {
    const token = await getUserToken();
    response = await requestWithBearer(fullUrl, token);
  } catch (err) {
    console.error("[statsApi] Fetch failed:", err);
    throw new Error(`Impossible de joindre l API (${baseUrl}): ${err instanceof Error ? err.message : String(err)}`);
  }

  if (response.status === 401) {
    const firstBody = await response.text();
    console.warn("[statsApi] 401 recu, tentative avec token rafraichi:", firstBody);

    try {
      const refreshedToken = await getUserToken(true);
      response = await requestWithBearer(fullUrl, refreshedToken);
    } catch (err) {
      console.error("[statsApi] Retry after refresh failed:", err);
      throw new Error("Token Firebase invalide ou expire. Deconnecte-toi puis reconnecte-toi.");
    }
  }

  if (!response.ok) {
    const text = await response.text();
    console.error("[statsApi] API error:", response.status, text);
    if (response.status === 401) {
      throw new Error(
        "Token Firebase invalide ou expire. Deconnecte-toi puis reconnecte-toi. Si le probleme persiste, verifie que l API Python utilise le meme projet Firebase.",
      );
    }
    throw new Error(`Erreur API stats (${response.status}): ${text || response.statusText}`);
  }

  return response;
};

export const fetchStatsSeries = async (
  metric: MetricKey,
  timeRange: TimeRangeKey,
): Promise<StatsSeriesResponse> => {
  const response = await fetchWithAuth(
    `/v1/stats/series?metric=${encodeURIComponent(metric)}&timeRange=${encodeURIComponent(timeRange)}`,
  );
  return response.json() as Promise<StatsSeriesResponse>;
};

export const fetchStatsChartBlob = async (
  metric: MetricKey,
  timeRange: TimeRangeKey,
  chartStyle: ChartStyleKey = "auto",
) => {
  const response = await fetchWithAuth(
    `/v1/stats/chart.png?metric=${encodeURIComponent(metric)}&timeRange=${encodeURIComponent(timeRange)}&chartStyle=${encodeURIComponent(chartStyle)}`,
  );
  return response.blob();
};

export const isBinaryMetric = (metric: MetricKey) =>
  metric === "skinCare" || metric === "shower" || metric === "supplement";

export const formatHoursToHHMM = (hoursValue: number) => {
  const totalMinutes = Math.max(0, Math.round(hoursValue * 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}:${minutes.toString().padStart(2, "0")}`;
};
