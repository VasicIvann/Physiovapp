"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { auth, db, isFirebaseConfigured } from "@/lib/firebase";
import {
  chartStyleOptions,
  formatHoursToHHMM,
  isBinaryMetric,
  metricColors,
  metricOptions,
  type ChartStyleKey,
  timeRangeOptions,
  type MetricKey,
  type TimeRangeKey,
} from "@/lib/statsApi";

type DailyLogEntry = {
  date?: string;
  userId?: string;
  weight?: number;
  exercises?: string[];
  sleepTime?: string;
  toothBrushing?: number;
  skinCareMatin?: "done" | "not done";
  skinCareEvening?: "done" | "not done";
  shower?: "done" | "not done";
  supplementMatin?: "done" | "not done";
  supplementEvening?: "done" | "not done";
  anki?: "done" | "not done";
  nutritionCalorieScore?: number;
  nutritionProteinScore?: number;
  nutritionQualityScore?: number;
};

type ChartPoint = {
  dateKey: string;
  label: string;
  value: number | null;
  nutritionCalorieScore?: number | null;
  nutritionProteinScore?: number | null;
  nutritionQualityScore?: number | null;
  foodHealthScore?: number | null;
};

type AiFeaturePoint = {
  dateKey: string;
  label: string;
  sportVolume: number | null;
  sleepHours: number | null;
  sleepScore: number | null;
  nutritionScore: number | null;
  calorieScore: number | null;
  proteinScore: number | null;
  qualityScore: number | null;
  hygieneScore: number | null;
  focusScore: number | null;
  formScore: number | null;
  healthScore: number | null;
  productivityScore: number | null;
};

type CorrelationResult = {
  title: string;
  coefficient: number;
  sampleSize: number;
};

const timeRangeDays: Record<TimeRangeKey, number> = {
  "7d": 7,
  "30d": 30,
  "365d": 365,
};

const dateKeyFromDate = (date: Date) => date.toISOString().slice(0, 10);

const buildDateRange = (days: number) => {
  const today = new Date();
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    dates.push(dateKeyFromDate(d));
  }
  return dates;
};

const parseSleepToHours = (value?: string) => {
  if (!value || !value.includes(":")) return null;
  const [h, m] = value.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m) || m < 0 || m > 59) return null;
  return h + m / 60;
};

const formatDateLabel = (dateKey: string) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return dateKey;
  return `${day.toString().padStart(2, "0")}/${month.toString().padStart(2, "0")}`;
};

const buildMetricValue = (metric: MetricKey, entry?: DailyLogEntry) => {
  if (!entry) return null;

  if (metric === "weight") {
    return typeof entry.weight === "number" ? entry.weight : null;
  }

  if (metric === "activities") {
    return Array.isArray(entry.exercises) ? entry.exercises.length : null;
  }

  if (metric === "sleepTime") {
    return parseSleepToHours(entry.sleepTime);
  }

  if (metric === "toothBrushing") {
    return typeof entry.toothBrushing === "number" ? entry.toothBrushing : 0;
  }

  if (metric === "skinCare") {
    const matin = entry.skinCareMatin;
    const evening = entry.skinCareEvening;
    let count = 0;
    if (matin === "done") count += 1;
    if (evening === "done") count += 1;
    return count;
  }

  if (metric === "supplement") {
    const matin = entry.supplementMatin;
    const evening = entry.supplementEvening;
    let count = 0;
    if (matin === "done") count += 1;
    if (evening === "done") count += 1;
    return count;
  }

  if (metric === "shower" || metric === "anki") {
    const value = entry[metric];
    if (value !== "done" && value !== "not done") return null;
    return value === "done" ? 1 : 0;
  }

  if (metric === "nutritionCalorieScore" || metric === "nutritionProteinScore" || metric === "nutritionQualityScore") {
    const value = entry[metric];
    return typeof value === "number" ? value : null;
  }

  const a = entry.nutritionCalorieScore;
  const b = entry.nutritionProteinScore;
  const c = entry.nutritionQualityScore;
  if ([a, b, c].every((v) => typeof v === "number")) {
    return ((a as number) + (b as number) + (c as number)) / 3;
  }
  return null;
};

const resolveYAxisDomain = (values: number[], isBinary: boolean): [number, number] | ["auto", "auto"] => {
  if (!values.length) return ["auto", "auto"];
  if (isBinary) return [0, 1];

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const padding = range === 0 ? Math.max(1, Math.abs(min) * 0.05) : Math.max(range * 0.2, 0.5);
  return [min - padding, max + padding];
};

const nutritionSeriesConfig = [
  { key: "nutritionCalorieScore", label: "Calories", color: "#f59e0b" },
  { key: "nutritionProteinScore", label: "Proteines", color: "#f97316" },
  { key: "nutritionQualityScore", label: "Qualite", color: "#ef4444" },
  { key: "foodHealthScore", label: "Globale", color: "#4f46e5" },
] as const;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const weightedScore = (items: Array<{ value: number | null; weight: number }>) => {
  let weightedTotal = 0;
  let weightTotal = 0;
  items.forEach((item) => {
    if (typeof item.value !== "number" || Number.isNaN(item.value)) return;
    weightedTotal += item.value * item.weight;
    weightTotal += item.weight;
  });
  if (weightTotal === 0) return null;
  return clamp(weightedTotal / weightTotal, 0, 100);
};

const pearsonCorrelation = (xValues: number[], yValues: number[]) => {
  const n = xValues.length;
  if (n < 3) return null;

  const meanX = xValues.reduce((acc, v) => acc + v, 0) / n;
  const meanY = yValues.reduce((acc, v) => acc + v, 0) / n;

  let numerator = 0;
  let denomX = 0;
  let denomY = 0;

  for (let i = 0; i < n; i += 1) {
    const dx = xValues[i] - meanX;
    const dy = yValues[i] - meanY;
    numerator += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }

  const denominator = Math.sqrt(denomX * denomY);
  if (denominator === 0) return null;
  return numerator / denominator;
};

const buildCorrelation = (title: string, xSeries: Array<number | null>, ySeries: Array<number | null>): CorrelationResult | null => {
  const xValues: number[] = [];
  const yValues: number[] = [];

  for (let i = 0; i < xSeries.length; i += 1) {
    const x = xSeries[i];
    const y = ySeries[i];
    if (typeof x !== "number" || typeof y !== "number") continue;
    xValues.push(x);
    yValues.push(y);
  }

  const coefficient = pearsonCorrelation(xValues, yValues);
  if (typeof coefficient !== "number") return null;
  return { title, coefficient, sampleSize: xValues.length };
};

const trendPrediction = (series: Array<number | null>, min = 0, max = 100) => {
  const points = series
    .map((value, idx) => ({ x: idx, y: value }))
    .filter((point): point is { x: number; y: number } => typeof point.y === "number");

  if (points.length < 2) return null;

  const n = points.length;
  const sumX = points.reduce((acc, p) => acc + p.x, 0);
  const sumY = points.reduce((acc, p) => acc + p.y, 0);
  const sumXY = points.reduce((acc, p) => acc + p.x * p.y, 0);
  const sumXX = points.reduce((acc, p) => acc + p.x * p.x, 0);

  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) return clamp(points[points.length - 1].y, min, max);

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;
  const nextX = points[points.length - 1].x + 1;
  return clamp(slope * nextX + intercept, min, max);
};

const regressionLineFromScatter = (points: Array<{ x: number; y: number }>) => {
  if (points.length < 2) return [] as Array<{ x: number; y: number }>;

  const n = points.length;
  const sumX = points.reduce((acc, p) => acc + p.x, 0);
  const sumY = points.reduce((acc, p) => acc + p.y, 0);
  const sumXY = points.reduce((acc, p) => acc + p.x * p.y, 0);
  const sumXX = points.reduce((acc, p) => acc + p.x * p.x, 0);
  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) return [] as Array<{ x: number; y: number }>;

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;
  const xValues = points.map((p) => p.x);
  const minX = Math.min(...xValues);
  const maxX = Math.max(...xValues);

  return [
    { x: minX, y: slope * minX + intercept },
    { x: maxX, y: slope * maxX + intercept },
  ];
};

const correlationStrengthLabel = (coefficient: number) => {
  const abs = Math.abs(coefficient);
  if (abs >= 0.75) return "Forte";
  if (abs >= 0.45) return "Moderee";
  return "Faible";
};

export default function StatPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRangeKey>("7d");
  const [metric, setMetric] = useState<MetricKey>("nutritionQualityScore");
  const [chartStyle, setChartStyle] = useState<ChartStyleKey>("auto");
  const [dailyLogsByDate, setDailyLogsByDate] = useState<Record<string, DailyLogEntry>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!auth || !db || !isFirebaseConfigured) {
      return;
    }

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setUserId(null);
        setDailyLogsByDate({});
        setLoading(false);
        return;
      }

      setLoading(true);
      setUserId(user.uid);
    });

    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!db || !userId) {
      return;
    }

    const logsQuery = query(collection(db, "dailyLogs"), where("userId", "==", userId));
    const unsub = onSnapshot(
      logsQuery,
      (snapshot) => {
        const next: Record<string, DailyLogEntry> = {};
        snapshot.docs.forEach((docSnap) => {
          const data = docSnap.data() as DailyLogEntry;
          if (!data.date || typeof data.date !== "string") return;
          next[data.date] = data;
        });
        setDailyLogsByDate(next);
        setLoading(false);
      },
      (err) => {
        console.error("[stat/page] Firestore load error:", err);
        setLoading(false);
      },
    );

    return () => {
      unsub();
    };
  }, [userId]);

  const chartStyleResolved: Exclude<ChartStyleKey, "auto"> = useMemo(() => {
    if (metric === "nutritionGlobal") return "line";
    if (chartStyle !== "auto") return chartStyle;
    return isBinaryMetric(metric) ? "bar" : "line";
  }, [chartStyle, metric]);

  const chartData = useMemo<ChartPoint[]>(() => {
    const days = timeRangeDays[timeRange];
    const labels = buildDateRange(days);
    return labels.map((dateKey) => {
      const entry = dailyLogsByDate[dateKey];
      const calorie = typeof entry?.nutritionCalorieScore === "number" ? entry.nutritionCalorieScore : null;
      const protein = typeof entry?.nutritionProteinScore === "number" ? entry.nutritionProteinScore : null;
      const quality = typeof entry?.nutritionQualityScore === "number" ? entry.nutritionQualityScore : null;
      const global = [calorie, protein, quality].every((v) => typeof v === "number")
        ? (((calorie as number) + (protein as number) + (quality as number)) / 3)
        : null;

      return {
        dateKey,
        label: formatDateLabel(dateKey),
        value: metric === "nutritionGlobal" ? null : buildMetricValue(metric, entry),
        nutritionCalorieScore: calorie,
        nutritionProteinScore: protein,
        nutritionQualityScore: quality,
        foodHealthScore: global,
      };
    });
  }, [dailyLogsByDate, metric, timeRange]);

  const aiFeatures = useMemo<AiFeaturePoint[]>(() => {
    const days = timeRangeDays[timeRange];
    const labels = buildDateRange(days);

    return labels.map((dateKey) => {
      const entry = dailyLogsByDate[dateKey];
      const exercisesCount = Array.isArray(entry?.exercises) ? entry.exercises.length : null;
      const sportVolume = typeof exercisesCount === "number" ? clamp(exercisesCount * 25, 0, 100) : null;

      const sleepHours = parseSleepToHours(entry?.sleepTime);
      const sleepScore =
        typeof sleepHours === "number" ? clamp(100 - Math.abs(sleepHours - 8) * 18, 0, 100) : null;

      const calorie = typeof entry?.nutritionCalorieScore === "number" ? entry.nutritionCalorieScore : null;
      const protein = typeof entry?.nutritionProteinScore === "number" ? entry.nutritionProteinScore : null;
      const quality = typeof entry?.nutritionQualityScore === "number" ? entry.nutritionQualityScore : null;

      const nutritionRaw =
        typeof calorie === "number" && typeof protein === "number" && typeof quality === "number"
          ? (calorie + protein + quality) / 3
          : null;
      const nutritionScore = typeof nutritionRaw === "number" ? clamp(nutritionRaw * 20, 0, 100) : null;
      const calorieScore = typeof calorie === "number" ? clamp(calorie * 20, 0, 100) : null;
      const proteinScore = typeof protein === "number" ? clamp(protein * 20, 0, 100) : null;
      const qualityScore = typeof quality === "number" ? clamp(quality * 20, 0, 100) : null;

      const showerScore = entry?.shower === "done" ? 100 : entry?.shower === "not done" ? 0 : null;
      const toothScore =
        typeof entry?.toothBrushing === "number" ? clamp((entry.toothBrushing / 2) * 100, 0, 100) : null;

      let skinCount = 0;
      if (entry?.skinCareMatin === "done") skinCount += 1;
      if (entry?.skinCareEvening === "done") skinCount += 1;
      const skinScore = (entry?.skinCareMatin || entry?.skinCareEvening) ? (skinCount / 2) * 100 : null;

      let supplementCount = 0;
      if (entry?.supplementMatin === "done") supplementCount += 1;
      if (entry?.supplementEvening === "done") supplementCount += 1;
      const supplementScore = (entry?.supplementMatin || entry?.supplementEvening) ? (supplementCount / 2) * 100 : null;

      const hygieneScore = weightedScore([
        { value: showerScore, weight: 0.35 },
        { value: toothScore, weight: 0.35 },
        { value: skinScore, weight: 0.15 },
        { value: supplementScore, weight: 0.15 },
      ]);

      const ankiScore = entry?.anki === "done" ? 100 : entry?.anki === "not done" ? 0 : null;
      const focusScore = weightedScore([
        { value: ankiScore, weight: 0.6 },
        { value: sportVolume, weight: 0.2 },
        { value: sleepScore, weight: 0.2 },
      ]);

      const formScore = weightedScore([
        { value: sportVolume, weight: 0.45 },
        { value: sleepScore, weight: 0.3 },
        { value: nutritionScore, weight: 0.25 },
      ]);

      const healthScore = weightedScore([
        { value: sleepScore, weight: 0.35 },
        { value: nutritionScore, weight: 0.35 },
        { value: hygieneScore, weight: 0.2 },
        { value: sportVolume, weight: 0.1 },
      ]);

      const productivityScore = weightedScore([
        { value: focusScore, weight: 0.5 },
        { value: sleepScore, weight: 0.2 },
        { value: nutritionScore, weight: 0.15 },
        { value: hygieneScore, weight: 0.15 },
      ]);

      return {
        dateKey,
        label: formatDateLabel(dateKey),
        sportVolume,
        sleepHours,
        sleepScore,
        nutritionScore,
        calorieScore,
        proteinScore,
        qualityScore,
        hygieneScore,
        focusScore,
        formScore,
        healthScore,
        productivityScore,
      };
    });
  }, [dailyLogsByDate, timeRange]);

  const aiCorrelations = useMemo(() => {
    const correlations = [
      buildCorrelation(
        "Sport vs score calories",
        aiFeatures.map((p) => p.sportVolume),
        aiFeatures.map((p) => p.calorieScore),
      ),
      buildCorrelation(
        "Sport vs sommeil",
        aiFeatures.map((p) => p.sportVolume),
        aiFeatures.map((p) => p.sleepHours),
      ),
      buildCorrelation(
        "Sommeil vs productivite",
        aiFeatures.map((p) => p.sleepScore),
        aiFeatures.map((p) => p.productivityScore),
      ),
      buildCorrelation(
        "Nutrition vs sante",
        aiFeatures.map((p) => p.nutritionScore),
        aiFeatures.map((p) => p.healthScore),
      ),
      buildCorrelation(
        "Focus vs productivite",
        aiFeatures.map((p) => p.focusScore),
        aiFeatures.map((p) => p.productivityScore),
      ),
      buildCorrelation(
        "Sommeil vs forme",
        aiFeatures.map((p) => p.sleepScore),
        aiFeatures.map((p) => p.formScore),
      ),
    ]
      .filter((item): item is CorrelationResult => Boolean(item))
      .sort((a, b) => Math.abs(b.coefficient) - Math.abs(a.coefficient));

    return correlations.slice(0, 4);
  }, [aiFeatures]);

  const aiPredictions = useMemo(() => {
    const formPrediction = trendPrediction(aiFeatures.map((p) => p.formScore));
    const healthPrediction = trendPrediction(aiFeatures.map((p) => p.healthScore));
    const productivityPrediction = trendPrediction(aiFeatures.map((p) => p.productivityScore));
    return { formPrediction, healthPrediction, productivityPrediction };
  }, [aiFeatures]);

  const aiLatestScores = useMemo(() => {
    for (let idx = aiFeatures.length - 1; idx >= 0; idx -= 1) {
      const point = aiFeatures[idx];
      if (
        typeof point.formScore === "number" ||
        typeof point.healthScore === "number" ||
        typeof point.productivityScore === "number"
      ) {
        return point;
      }
    }
    return null;
  }, [aiFeatures]);

  const aiRadarData = useMemo(
    () => [
      { metric: "Forme", score: aiLatestScores?.formScore ?? 0 },
      { metric: "Sante", score: aiLatestScores?.healthScore ?? 0 },
      { metric: "Productivite", score: aiLatestScores?.productivityScore ?? 0 },
      { metric: "Sommeil", score: aiLatestScores?.sleepScore ?? 0 },
      { metric: "Nutrition", score: aiLatestScores?.nutritionScore ?? 0 },
      { metric: "Hygiene", score: aiLatestScores?.hygieneScore ?? 0 },
    ],
    [aiLatestScores],
  );

  const sportNutritionScatter = useMemo(
    () =>
      aiFeatures
        .map((p) => ({ x: p.sportVolume, y: p.nutritionScore }))
        .filter((p): p is { x: number; y: number } => typeof p.x === "number" && typeof p.y === "number"),
    [aiFeatures],
  );

  const sleepProductivityScatter = useMemo(
    () =>
      aiFeatures
        .map((p) => ({ x: p.sleepHours, y: p.productivityScore }))
        .filter((p): p is { x: number; y: number } => typeof p.x === "number" && typeof p.y === "number"),
    [aiFeatures],
  );

  const sportNutritionTrendLine = useMemo(
    () => regressionLineFromScatter(sportNutritionScatter),
    [sportNutritionScatter],
  );

  const sleepProductivityTrendLine = useMemo(
    () => regressionLineFromScatter(sleepProductivityScatter),
    [sleepProductivityScatter],
  );

  const numericValues = useMemo(() => {
    if (metric === "nutritionGlobal") {
      return chartData
        .flatMap((row) => [
          row.nutritionCalorieScore,
          row.nutritionProteinScore,
          row.nutritionQualityScore,
          row.foodHealthScore,
        ])
        .filter((v): v is number => typeof v === "number");
    }
    return chartData.map((row) => row.value).filter((v): v is number => typeof v === "number");
  }, [chartData, metric]);

  const metricStats = useMemo(() => {
    if (!numericValues.length) return null;
    const min = Math.min(...numericValues);
    const max = Math.max(...numericValues);
    const avg = numericValues.reduce((acc, value) => acc + value, 0) / numericValues.length;
    return { count: numericValues.length, min, max, avg };
  }, [numericValues]);

  const hasData = numericValues.length > 0;

  const lastValue = useMemo(() => {
    if (metric === "nutritionGlobal") return null;
    for (let idx = chartData.length - 1; idx >= 0; idx--) {
      const value = chartData[idx]?.value;
      if (typeof value === "number") {
        return value;
      }
    }
    return null;
  }, [chartData, metric]);

  const yAxisDomain = useMemo(
    () => resolveYAxisDomain(numericValues, isBinaryMetric(metric)),
    [metric, numericValues],
  );

  const nutritionLatest = useMemo(() => {
    if (metric !== "nutritionGlobal") return null;

    const findLast = (key: (typeof nutritionSeriesConfig)[number]["key"]) => {
      for (let idx = chartData.length - 1; idx >= 0; idx--) {
        const value = chartData[idx][key];
        if (typeof value === "number") return value;
      }
      return null;
    };

    return {
      nutritionCalorieScore: findLast("nutritionCalorieScore"),
      nutritionProteinScore: findLast("nutritionProteinScore"),
      nutritionQualityScore: findLast("nutritionQualityScore"),
      foodHealthScore: findLast("foodHealthScore"),
    };
  }, [chartData, metric]);

  const formatMetricValue = (value: number) => {
    if (metric === "sleepTime") {
      return formatHoursToHHMM(value);
    }
    if (isBinaryMetric(metric)) {
      return value >= 1 ? "Fait" : "Non fait";
    }
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  };

  const chartColor = metricColors[metric];

  if (!isFirebaseConfigured) {
    return (
      <div className="rounded-3xl border border-rose-500/35 bg-gradient-to-br from-rose-950/70 to-orange-950/60 p-6 shadow-sm">
        <p className="text-sm font-semibold text-rose-200">Configure Firebase pour afficher les statistiques en temps reel.</p>
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="rounded-3xl border border-slate-700/70 bg-slate-900/85 p-6 shadow-sm backdrop-blur-sm">
        <p className="text-sm font-semibold text-slate-100">Connecte-toi pour voir tes statistiques.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
      
      {/* --- Main Chart Section --- */}
      <section className="rounded-3xl border border-cyan-500/30 bg-gradient-to-br from-slate-900/95 via-slate-900 to-cyan-950/70 p-6 shadow-[0_14px_34px_rgba(2,6,23,0.52)]">
        <div className="flex flex-col gap-4">
          
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-black tracking-tight text-slate-100">Statistiques</h1>
            {/* Range Selector */}
            <div className="relative">
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value as TimeRangeKey)}
                className="appearance-none rounded-xl border border-slate-700 bg-slate-900 pl-3 pr-8 py-2 text-xs font-semibold text-slate-100 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/25 transition-all cursor-pointer"
              >
                {timeRangeOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
            </div>
          </div>

          {/* Metric Selector (Pills) */}
          <div className="flex overflow-x-auto pb-2 no-scrollbar gap-2">
              <select
                value={metric}
                onChange={(e) => setMetric(e.target.value as MetricKey)}
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm font-medium text-slate-100 shadow-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/25 transition-all"
              >
                {metricOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
              <select
                value={chartStyle}
                onChange={(e) => setChartStyle(e.target.value as ChartStyleKey)}
                disabled={metric === "nutritionGlobal"}
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm font-medium text-slate-100 shadow-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/25 transition-all"
              >
                {chartStyleOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
          </div>
        </div>

        <div className="mt-6">
          {loading ? (
            <div className="flex h-64 items-center justify-center rounded-2xl bg-slate-900/75 ring-1 ring-slate-800">
              <p className="text-sm text-slate-300 animate-pulse">Chargement...</p>
            </div>
          ) : (
            <div className="space-y-4">
              {!hasData && (
                <div className="rounded-xl bg-slate-900 p-3 text-center ring-1 ring-slate-700">
                  <p className="text-xs text-slate-300">Aucune donnée sur la période.</p>
                </div>
              )}

              <div className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-950/70">
                <div className="flex items-center justify-between border-b border-slate-700 bg-slate-900/75 px-4 py-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Graphique genere depuis Firestore
                  </p>
                  <div className="text-right">
                    <p className="text-xs font-semibold text-slate-400">{timeRange}</p>
                    <p className="text-[10px] font-semibold text-slate-400">
                      Style: {chartStyleResolved}
                    </p>
                  </div>
                </div>
                <div className="h-72 w-full p-2 sm:h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    {metric === "nutritionGlobal" ? (
                      <LineChart data={chartData} margin={{ top: 16, right: 16, bottom: 8, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                        <XAxis dataKey="label" tick={{ fill: "#6b7280", fontSize: 11 }} tickMargin={8} />
                        <YAxis domain={yAxisDomain} tick={{ fill: "#6b7280", fontSize: 11 }} />
                        <Tooltip
                          contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb" }}
                          labelStyle={{ color: "#111827", fontWeight: 700 }}
                          formatter={(value: number | string, name: string) => {
                            const numeric = typeof value === "number" ? value : Number(value);
                            return [Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(2), name];
                          }}
                        />
                        <Legend verticalAlign="top" height={34} wrapperStyle={{ fontSize: "12px" }} />
                        {nutritionSeriesConfig.map((series) => (
                          <Line
                            key={series.key}
                            type="monotone"
                            dataKey={series.key}
                            name={series.label}
                            stroke={series.color}
                            strokeWidth={series.key === "foodHealthScore" ? 3.4 : 2.1}
                            strokeOpacity={series.key === "foodHealthScore" ? 0.98 : 0.5}
                            dot={false}
                            activeDot={{ r: series.key === "foodHealthScore" ? 4.5 : 3.5 }}
                            connectNulls
                          />
                        ))}
                      </LineChart>
                    ) : chartStyleResolved === "bar" ? (
                      <BarChart data={chartData} margin={{ top: 16, right: 16, bottom: 8, left: 0 }}>
                        <defs>
                          <linearGradient id="barFade" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={chartColor} stopOpacity={0.9} />
                            <stop offset="100%" stopColor={chartColor} stopOpacity={0.5} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                        <XAxis dataKey="label" tick={{ fill: "#6b7280", fontSize: 11 }} tickMargin={8} />
                        <YAxis
                          domain={yAxisDomain}
                          tick={{ fill: "#6b7280", fontSize: 11 }}
                          tickFormatter={(value) => (metric === "sleepTime" ? formatHoursToHHMM(value) : value)}
                        />
                        <Tooltip
                          contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb" }}
                          labelStyle={{ color: "#111827", fontWeight: 700 }}
                          formatter={(value: number | string) => {
                            const numeric = typeof value === "number" ? value : Number(value);
                            return [formatMetricValue(numeric), metric];
                          }}
                        />
                        <Bar dataKey="value" fill="url(#barFade)" radius={[8, 8, 0, 0]} />
                      </BarChart>
                    ) : chartStyleResolved === "area" ? (
                      <AreaChart data={chartData} margin={{ top: 16, right: 16, bottom: 8, left: 0 }}>
                        <defs>
                          <linearGradient id="areaFade" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={chartColor} stopOpacity={0.45} />
                            <stop offset="95%" stopColor={chartColor} stopOpacity={0.06} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                        <XAxis dataKey="label" tick={{ fill: "#6b7280", fontSize: 11 }} tickMargin={8} />
                        <YAxis
                          domain={yAxisDomain}
                          tick={{ fill: "#6b7280", fontSize: 11 }}
                          tickFormatter={(value) => (metric === "sleepTime" ? formatHoursToHHMM(value) : value)}
                        />
                        <Tooltip
                          contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb" }}
                          labelStyle={{ color: "#111827", fontWeight: 700 }}
                          formatter={(value: number | string) => {
                            const numeric = typeof value === "number" ? value : Number(value);
                            return [formatMetricValue(numeric), metric];
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="value"
                          stroke={chartColor}
                          strokeWidth={2.5}
                          fill="url(#areaFade)"
                          connectNulls={metric === "weight"}
                        />
                      </AreaChart>
                    ) : (
                      <LineChart data={chartData} margin={{ top: 16, right: 16, bottom: 8, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                        <XAxis dataKey="label" tick={{ fill: "#6b7280", fontSize: 11 }} tickMargin={8} />
                        <YAxis
                          domain={yAxisDomain}
                          tick={{ fill: "#6b7280", fontSize: 11 }}
                          tickFormatter={(value) => (metric === "sleepTime" ? formatHoursToHHMM(value) : value)}
                        />
                        <Tooltip
                          contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb" }}
                          labelStyle={{ color: "#111827", fontWeight: 700 }}
                          formatter={(value: number | string) => {
                            const numeric = typeof value === "number" ? value : Number(value);
                            return [formatMetricValue(numeric), metric];
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="value"
                          stroke={chartColor}
                          strokeWidth={3}
                          dot={{ r: 3.5, fill: chartColor }}
                          activeDot={{ r: 5 }}
                          connectNulls={metric === "weight"}
                        />
                      </LineChart>
                    )}
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* --- Metrics Summary --- */}
      <section className="rounded-3xl border border-emerald-500/25 bg-gradient-to-br from-slate-900/95 to-emerald-950/70 p-6">
        <h2 className="mb-4 text-sm font-bold text-slate-100">Résumé {metric}</h2>

        {metric === "nutritionGlobal" && nutritionLatest && (
          <div className="grid grid-cols-2 gap-3">
            {nutritionSeriesConfig.map((series) => {
              const value = nutritionLatest[series.key];
              return (
                <div key={series.key} className="rounded-2xl border border-slate-700 bg-slate-900/80 p-4 shadow-sm">
                  <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: series.color }}>
                    {series.label}
                  </p>
                  <p className="mt-1 text-base font-bold text-slate-100">
                    {typeof value === "number" ? (Number.isInteger(value) ? value : value.toFixed(2)) : "-"}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {metric !== "nutritionGlobal" && lastValue !== null && (
          <div className="mb-3 rounded-2xl border border-indigo-500/30 bg-indigo-950/35 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-300">Derniere valeur</p>
            <p className="mt-1 text-sm font-bold text-indigo-100">{formatMetricValue(lastValue)}</p>
          </div>
        )}

        {metric !== "nutritionGlobal" && metricStats ? (
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-700 bg-slate-900/80 p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Min</p>
              <p className="mt-1 text-lg font-bold text-slate-100">
                {formatMetricValue(metricStats.min)}
              </p>
            </div>
            <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-700 bg-slate-900/80 p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Max</p>
              <p className="mt-1 text-lg font-bold text-slate-100">
                {formatMetricValue(metricStats.max)}
              </p>
            </div>
            <div className="flex flex-col items-center justify-center rounded-2xl border border-indigo-500/30 bg-slate-900/80 p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Moy</p>
              <p className="mt-1 text-lg font-bold text-indigo-300">
                {formatMetricValue(metricStats.avg)}
              </p>
            </div>
          </div>
        ) : metric !== "nutritionGlobal" ? (
          <div className="flex items-center justify-center rounded-2xl border border-slate-700 border-dashed bg-slate-900/75 p-6">
             <p className="text-xs text-slate-300">Pas de données suffisantes pour calculer les moyennes.</p>
          </div>
        ) : null}
      </section>

      <section className="space-y-4 rounded-3xl border border-cyan-500/20 bg-gradient-to-br from-slate-900/95 to-cyan-950/65 p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-100">Analyse IA & Machine Learning</h2>
            <p className="mt-1 text-xs text-slate-300">
              Correlations et predictions sur les donnees reelles (sport mesure via volume d activites, sommeil, nutrition et routines).
            </p>
          </div>
          <span className="rounded-full bg-cyan-500/15 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-cyan-200 ring-1 ring-cyan-500/30">
            Beta IA
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">Forme predite</p>
            <p className="mt-1 text-xl font-black text-slate-100">
              {typeof aiPredictions.formPrediction === "number" ? aiPredictions.formPrediction.toFixed(1) : "-"}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">Sante predite</p>
            <p className="mt-1 text-xl font-black text-slate-100">
              {typeof aiPredictions.healthPrediction === "number" ? aiPredictions.healthPrediction.toFixed(1) : "-"}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-300">Productivite predite</p>
            <p className="mt-1 text-xl font-black text-slate-100">
              {typeof aiPredictions.productivityPrediction === "number" ? aiPredictions.productivityPrediction.toFixed(1) : "-"}
            </p>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-300">Top correlations detectees</p>
            {aiCorrelations.length === 0 ? (
              <p className="mt-3 text-xs text-slate-400">Pas assez de donnees pour calculer des correlations fiables.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {aiCorrelations.map((item) => (
                  <div key={item.title} className="rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2">
                    <p className="text-xs font-semibold text-slate-200">{item.title}</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      r = {item.coefficient.toFixed(2)} ({correlationStrengthLabel(item.coefficient)}), echantillons: {item.sampleSize}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-300">Radar des scores du dernier jour</p>
            <div className="mt-2 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={aiRadarData} outerRadius="75%">
                  <PolarGrid stroke="#334155" />
                  <PolarAngleAxis dataKey="metric" tick={{ fill: "#cbd5e1", fontSize: 11 }} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: "#64748b", fontSize: 10 }} />
                  <Radar name="Score" dataKey="score" stroke="#22d3ee" fill="#22d3ee" fillOpacity={0.35} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-300">Sport vs nutrition (scatter)</p>
            <div className="mt-2 h-52">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 12, right: 12, bottom: 12, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis
                    type="number"
                    dataKey="x"
                    name="Sport"
                    domain={[0, 100]}
                    tick={{ fill: "#94a3b8", fontSize: 11 }}
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    name="Nutrition"
                    domain={[0, 100]}
                    tick={{ fill: "#94a3b8", fontSize: 11 }}
                  />
                  <Tooltip
                    cursor={{ strokeDasharray: "3 3" }}
                    contentStyle={{ borderRadius: 12, border: "1px solid #334155", backgroundColor: "#0f172a" }}
                    labelStyle={{ color: "#e2e8f0", fontWeight: 700 }}
                    formatter={(value: number | string, name: string) => [`${Number(value).toFixed(1)}`, name]}
                  />
                  <Scatter name="Jours" data={sportNutritionScatter} fill="#22d3ee" />
                  <Scatter
                    name="Tendance"
                    data={sportNutritionTrendLine}
                    line={{ stroke: "#38bdf8", strokeWidth: 2 }}
                    fill="transparent"
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-300">Sommeil vs productivite (scatter)</p>
            <div className="mt-2 h-52">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 12, right: 12, bottom: 12, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis
                    type="number"
                    dataKey="x"
                    name="Sommeil"
                    domain={[0, 12]}
                    tick={{ fill: "#94a3b8", fontSize: 11 }}
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    name="Productivite"
                    domain={[0, 100]}
                    tick={{ fill: "#94a3b8", fontSize: 11 }}
                  />
                  <Tooltip
                    cursor={{ strokeDasharray: "3 3" }}
                    contentStyle={{ borderRadius: 12, border: "1px solid #334155", backgroundColor: "#0f172a" }}
                    labelStyle={{ color: "#e2e8f0", fontWeight: 700 }}
                    formatter={(value: number | string, name: string) => [
                      name === "Sommeil" ? formatHoursToHHMM(Number(value)) : `${Number(value).toFixed(1)}`,
                      name,
                    ]}
                  />
                  <Scatter name="Jours" data={sleepProductivityScatter} fill="#10b981" />
                  <Scatter
                    name="Tendance"
                    data={sleepProductivityTrendLine}
                    line={{ stroke: "#34d399", strokeWidth: 2 }}
                    fill="transparent"
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </section>

      {/* Floating Back Button */}
      <Link
        href="/"
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-cyan-600 to-emerald-600 text-slate-950 shadow-[0_8px_30px_rgba(0,0,0,0.4)] transition-transform hover:scale-110 active:scale-95"
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M10 19l-7-7m0 0l7-7m-7 7h18" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </Link>
    </div>
  );
}
