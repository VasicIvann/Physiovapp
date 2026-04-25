export type TimeRangeKey = "7d" | "30d" | "365d";
export type ChartStyleKey = "auto" | "bar" | "line" | "area";

export type MetricKey =
  | "weight"
  | "activities"
  | "sleepTime"
  | "skinCare"
  | "shower"
  | "supplement"
  | "anki"
  | "toothBrushing"
  | "nutrition";

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
  { key: "auto", label: "Auto" },
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
  { key: "anki", label: "Anki" },
  { key: "toothBrushing", label: "Brosser dent" },
  { key: "nutrition", label: "Nutrition" },
];

export const timeRangeOptions: Array<{ key: TimeRangeKey; label: string }> = [
  { key: "7d", label: "Derniere semaine" },
  { key: "30d", label: "Dernier mois" },
  { key: "365d", label: "Derniere annee" },
];

export const isBinaryMetric = (metric: MetricKey) =>
  metric === "shower" || metric === "anki";

export const formatHoursToHHMM = (hoursValue: number) => {
  const totalMinutes = Math.max(0, Math.round(hoursValue * 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}:${minutes.toString().padStart(2, "0")}`;
};

export const metricColors: Record<MetricKey, string> = {
  weight: "#2563eb",
  activities: "#0ea5e9",
  sleepTime: "#7c3aed",
  skinCare: "#059669",
  shower: "#06b6d4",
  supplement: "#22c55e",
  anki: "#3b82f6",
  toothBrushing: "#0d9488",
  nutrition: "#4f46e5",
};

export type NutritionMode = "score" | "number";

export type NutritionScoreSeriesKey = "calories" | "proteins" | "health" | "global";
export type NutritionNumberSeriesKey = "calories" | "proteins" | "carbs" | "fat";

export const nutritionScoreSeries: Array<{
  key: NutritionScoreSeriesKey;
  label: string;
  color: string;
}> = [
  { key: "global", label: "Global (moy.)", color: "#4f46e5" },
  { key: "calories", label: "Calories", color: "#f59e0b" },
  { key: "proteins", label: "Proteines", color: "#f97316" },
  { key: "health", label: "Health", color: "#ef4444" },
];

export const nutritionNumberSeries: Array<{
  key: NutritionNumberSeriesKey;
  label: string;
  unit: string;
  axis: "left" | "right";
  color: string;
}> = [
  { key: "calories", label: "Calories", unit: "kcal", axis: "left", color: "#f59e0b" },
  { key: "proteins", label: "Proteines", unit: "g", axis: "right", color: "#f97316" },
  { key: "carbs", label: "Glucides", unit: "g", axis: "right", color: "#22c55e" },
  { key: "fat", label: "Lipides", unit: "g", axis: "right", color: "#ef4444" },
];
