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
  ResponsiveContainer,
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
