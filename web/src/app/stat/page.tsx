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
  nutritionNumberSeries,
  nutritionScoreSeries,
  type ChartStyleKey,
  timeRangeOptions,
  type MetricKey,
  type NutritionMode,
  type NutritionNumberSeriesKey,
  type NutritionScoreSeriesKey,
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
  calories?: number;
  proteins?: number;
  carbs?: number;
  fat?: number;
  nutritionCalorieScore?: number;
  nutritionProteinScore?: number;
  nutritionQualityScore?: number;
};

type ChartPoint = {
  dateKey: string;
  label: string;
  value: number | null;
  scoreCalories?: number | null;
  scoreProteins?: number | null;
  scoreHealth?: number | null;
  scoreGlobal?: number | null;
  numCalories?: number | null;
  numProteins?: number | null;
  numCarbs?: number | null;
  numFat?: number | null;
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
    let count = 0;
    if (entry.skinCareMatin === "done") count += 1;
    if (entry.skinCareEvening === "done") count += 1;
    return count;
  }

  if (metric === "supplement") {
    let count = 0;
    if (entry.supplementMatin === "done") count += 1;
    if (entry.supplementEvening === "done") count += 1;
    return count;
  }

  if (metric === "shower" || metric === "anki") {
    const value = entry[metric];
    if (value !== "done" && value !== "not done") return null;
    return value === "done" ? 1 : 0;
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

const scoreKeyMap: Record<NutritionScoreSeriesKey, keyof ChartPoint> = {
  calories: "scoreCalories",
  proteins: "scoreProteins",
  health: "scoreHealth",
  global: "scoreGlobal",
};

const numberKeyMap: Record<NutritionNumberSeriesKey, keyof ChartPoint> = {
  calories: "numCalories",
  proteins: "numProteins",
  carbs: "numCarbs",
  fat: "numFat",
};

export default function StatPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRangeKey>("7d");
  const [metric, setMetric] = useState<MetricKey>("nutrition");
  const [chartStyle, setChartStyle] = useState<ChartStyleKey>("auto");
  const [dailyLogsByDate, setDailyLogsByDate] = useState<Record<string, DailyLogEntry>>({});
  const [loading, setLoading] = useState(false);

  const [nutritionMode, setNutritionMode] = useState<NutritionMode>("score");
  const [scoreSelected, setScoreSelected] = useState<Set<NutritionScoreSeriesKey>>(
    () => new Set<NutritionScoreSeriesKey>(["global"]),
  );
  const [numberSelected, setNumberSelected] = useState<Set<NutritionNumberSeriesKey>>(
    () => new Set<NutritionNumberSeriesKey>(),
  );

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
    if (metric === "nutrition") {
      return chartStyle === "auto" ? "line" : chartStyle;
    }
    if (chartStyle !== "auto") return chartStyle;
    return isBinaryMetric(metric) ? "bar" : "line";
  }, [chartStyle, metric]);

  const chartData = useMemo<ChartPoint[]>(() => {
    const days = timeRangeDays[timeRange];
    const labels = buildDateRange(days);
    return labels.map((dateKey) => {
      const entry = dailyLogsByDate[dateKey];
      const calorieScore = typeof entry?.nutritionCalorieScore === "number" ? entry.nutritionCalorieScore : null;
      const proteinScore = typeof entry?.nutritionProteinScore === "number" ? entry.nutritionProteinScore : null;
      const qualityScore = typeof entry?.nutritionQualityScore === "number" ? entry.nutritionQualityScore : null;
      const globalScore = [calorieScore, proteinScore, qualityScore].every((v) => typeof v === "number")
        ? (((calorieScore as number) + (proteinScore as number) + (qualityScore as number)) / 3)
        : null;

      return {
        dateKey,
        label: formatDateLabel(dateKey),
        value: metric === "nutrition" ? null : buildMetricValue(metric, entry),
        scoreCalories: calorieScore,
        scoreProteins: proteinScore,
        scoreHealth: qualityScore,
        scoreGlobal: globalScore,
        numCalories: typeof entry?.calories === "number" ? entry.calories : null,
        numProteins: typeof entry?.proteins === "number" ? entry.proteins : null,
        numCarbs: typeof entry?.carbs === "number" ? entry.carbs : null,
        numFat: typeof entry?.fat === "number" ? entry.fat : null,
      };
    });
  }, [dailyLogsByDate, metric, timeRange]);

  const numericValues = useMemo(() => {
    if (metric === "nutrition") {
      const keys: Array<keyof ChartPoint> =
        nutritionMode === "score"
          ? Array.from(scoreSelected).map((k) => scoreKeyMap[k])
          : Array.from(numberSelected).map((k) => numberKeyMap[k]);
      return chartData
        .flatMap((row) => keys.map((k) => row[k]))
        .filter((v): v is number => typeof v === "number");
    }
    return chartData.map((row) => row.value).filter((v): v is number => typeof v === "number");
  }, [chartData, metric, nutritionMode, scoreSelected, numberSelected]);

  const metricStats = useMemo(() => {
    if (!numericValues.length) return null;
    const min = Math.min(...numericValues);
    const max = Math.max(...numericValues);
    const avg = numericValues.reduce((acc, value) => acc + value, 0) / numericValues.length;
    return { count: numericValues.length, min, max, avg };
  }, [numericValues]);

  const hasData = numericValues.length > 0;

  const lastValue = useMemo(() => {
    if (metric === "nutrition") return null;
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

  const formatMetricValue = (value: number) => {
    if (metric === "sleepTime") {
      return formatHoursToHHMM(value);
    }
    if (isBinaryMetric(metric)) {
      return value >= 1 ? "Fait" : "Non fait";
    }
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  };

  const chartColor = metric === "nutrition" ? metricColors.nutrition : metricColors[metric];

  const toggleScore = (key: NutritionScoreSeriesKey) => {
    setScoreSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleNumber = (key: NutritionNumberSeriesKey) => {
    setNumberSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const setMode = (mode: NutritionMode) => {
    setNutritionMode(mode);
    if (mode === "score") {
      setNumberSelected(new Set());
      setScoreSelected((prev) => (prev.size === 0 ? new Set<NutritionScoreSeriesKey>(["global"]) : prev));
    } else {
      setScoreSelected(new Set());
      setNumberSelected((prev) => (prev.size === 0 ? new Set<NutritionNumberSeriesKey>(["calories"]) : prev));
    }
  };

  const nutritionNumberLatest = useMemo(() => {
    if (metric !== "nutrition" || nutritionMode !== "number") return null;
    const findLast = (key: keyof ChartPoint) => {
      for (let idx = chartData.length - 1; idx >= 0; idx--) {
        const v = chartData[idx][key];
        if (typeof v === "number") return v;
      }
      return null;
    };
    return {
      calories: findLast("numCalories"),
      proteins: findLast("numProteins"),
      carbs: findLast("numCarbs"),
      fat: findLast("numFat"),
    };
  }, [chartData, metric, nutritionMode]);

  const nutritionScoreLatest = useMemo(() => {
    if (metric !== "nutrition" || nutritionMode !== "score") return null;
    const findLast = (key: keyof ChartPoint) => {
      for (let idx = chartData.length - 1; idx >= 0; idx--) {
        const v = chartData[idx][key];
        if (typeof v === "number") return v;
      }
      return null;
    };
    return {
      global: findLast("scoreGlobal"),
      calories: findLast("scoreCalories"),
      proteins: findLast("scoreProteins"),
      health: findLast("scoreHealth"),
    };
  }, [chartData, metric, nutritionMode]);

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

  const renderNutritionChart = () => {
    if (nutritionMode === "score") {
      const activeSeries = nutritionScoreSeries.filter((s) => scoreSelected.has(s.key));
      const ChartComponent =
        chartStyleResolved === "bar" ? BarChart : chartStyleResolved === "area" ? AreaChart : LineChart;
      return (
        <ChartComponent data={chartData} margin={{ top: 16, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "#6b7280", fontSize: 11 }} tickMargin={8} />
          <YAxis domain={[0, 10]} tick={{ fill: "#6b7280", fontSize: 11 }} />
          <Tooltip
            contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb" }}
            labelStyle={{ color: "#111827", fontWeight: 700 }}
            formatter={(value: number | string, name: string) => {
              const numeric = typeof value === "number" ? value : Number(value);
              return [Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(2), name];
            }}
          />
          <Legend verticalAlign="top" height={34} wrapperStyle={{ fontSize: "12px" }} />
          {activeSeries.map((series) => {
            const dataKey = scoreKeyMap[series.key] as string;
            if (chartStyleResolved === "bar") {
              return (
                <Bar
                  key={series.key}
                  dataKey={dataKey}
                  name={series.label}
                  fill={series.color}
                  radius={[6, 6, 0, 0]}
                />
              );
            }
            if (chartStyleResolved === "area") {
              return (
                <Area
                  key={series.key}
                  type="monotone"
                  dataKey={dataKey}
                  name={series.label}
                  stroke={series.color}
                  fill={series.color}
                  fillOpacity={0.15}
                  strokeWidth={series.key === "global" ? 3 : 2}
                  connectNulls
                />
              );
            }
            return (
              <Line
                key={series.key}
                type="monotone"
                dataKey={dataKey}
                name={series.label}
                stroke={series.color}
                strokeWidth={series.key === "global" ? 3.4 : 2.1}
                dot={false}
                activeDot={{ r: series.key === "global" ? 4.5 : 3.5 }}
                connectNulls
              />
            );
          })}
        </ChartComponent>
      );
    }

    const activeSeries = nutritionNumberSeries.filter((s) => numberSelected.has(s.key));
    const ChartComponent =
      chartStyleResolved === "bar" ? BarChart : chartStyleResolved === "area" ? AreaChart : LineChart;
    const useRightAxis = activeSeries.some((s) => s.axis === "right");
    return (
      <ChartComponent data={chartData} margin={{ top: 16, right: 16, bottom: 8, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
        <XAxis dataKey="label" tick={{ fill: "#6b7280", fontSize: 11 }} tickMargin={8} />
        <YAxis
          yAxisId="left"
          tick={{ fill: "#f59e0b", fontSize: 11 }}
          label={{ value: "kcal", angle: -90, position: "insideLeft", style: { fill: "#f59e0b", fontSize: 10 } }}
        />
        {useRightAxis && (
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fill: "#22c55e", fontSize: 11 }}
            label={{ value: "g", angle: 90, position: "insideRight", style: { fill: "#22c55e", fontSize: 10 } }}
          />
        )}
        <Tooltip
          contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb" }}
          labelStyle={{ color: "#111827", fontWeight: 700 }}
          formatter={(value: number | string, name: string) => {
            const numeric = typeof value === "number" ? value : Number(value);
            const series = nutritionNumberSeries.find((s) => s.label === name);
            const unit = series?.unit ?? "";
            return [`${Number.isInteger(numeric) ? numeric : numeric.toFixed(1)} ${unit}`.trim(), name];
          }}
        />
        <Legend verticalAlign="top" height={34} wrapperStyle={{ fontSize: "12px" }} />
        {activeSeries.map((series) => {
          const dataKey = numberKeyMap[series.key] as string;
          const axisId = series.axis === "right" && useRightAxis ? "right" : "left";
          if (chartStyleResolved === "bar") {
            return (
              <Bar
                key={series.key}
                yAxisId={axisId}
                dataKey={dataKey}
                name={series.label}
                fill={series.color}
                radius={[6, 6, 0, 0]}
              />
            );
          }
          if (chartStyleResolved === "area") {
            return (
              <Area
                key={series.key}
                yAxisId={axisId}
                type="monotone"
                dataKey={dataKey}
                name={series.label}
                stroke={series.color}
                fill={series.color}
                fillOpacity={0.15}
                strokeWidth={2.4}
                connectNulls
              />
            );
          }
          return (
            <Line
              key={series.key}
              yAxisId={axisId}
              type="monotone"
              dataKey={dataKey}
              name={series.label}
              stroke={series.color}
              strokeWidth={2.6}
              dot={{ r: 3, fill: series.color }}
              activeDot={{ r: 4.5 }}
              connectNulls
            />
          );
        })}
      </ChartComponent>
    );
  };

  const renderStandardChart = () => {
    if (chartStyleResolved === "bar") {
      return (
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
      );
    }
    if (chartStyleResolved === "area") {
      return (
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
      );
    }
    return (
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
    );
  };

  const noNutritionSelection =
    metric === "nutrition" &&
    ((nutritionMode === "score" && scoreSelected.size === 0) ||
      (nutritionMode === "number" && numberSelected.size === 0));

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
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm font-medium text-slate-100 shadow-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/25 transition-all"
              >
                {chartStyleOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
          </div>

          {/* Nutrition Panel */}
          {metric === "nutrition" && (
            <div className="rounded-2xl border border-indigo-500/30 bg-slate-950/60 p-4 space-y-4">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMode("score")}
                  className={`flex-1 rounded-xl px-3 py-2 text-xs font-bold transition active:scale-95 ${
                    nutritionMode === "score"
                      ? "bg-indigo-500 text-slate-50 shadow"
                      : "bg-slate-900 text-slate-300 ring-1 ring-slate-700 hover:bg-slate-800"
                  }`}
                >
                  Score (/10)
                </button>
                <button
                  type="button"
                  onClick={() => setMode("number")}
                  className={`flex-1 rounded-xl px-3 py-2 text-xs font-bold transition active:scale-95 ${
                    nutritionMode === "number"
                      ? "bg-indigo-500 text-slate-50 shadow"
                      : "bg-slate-900 text-slate-300 ring-1 ring-slate-700 hover:bg-slate-800"
                  }`}
                >
                  Nombres (kcal/g)
                </button>
              </div>

              {nutritionMode === "score" ? (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                    Series a afficher
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {nutritionScoreSeries.map((s) => {
                      const checked = scoreSelected.has(s.key);
                      return (
                        <label
                          key={s.key}
                          className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold cursor-pointer transition ${
                            checked
                              ? "bg-slate-800 ring-1 ring-slate-600"
                              : "bg-slate-900 ring-1 ring-slate-800 hover:bg-slate-800/60"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleScore(s.key)}
                            className="h-4 w-4 rounded accent-indigo-500"
                          />
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                          <span className="text-slate-100">{s.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                    Series a afficher (axe gauche: kcal, axe droit: g)
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {nutritionNumberSeries.map((s) => {
                      const checked = numberSelected.has(s.key);
                      return (
                        <label
                          key={s.key}
                          className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold cursor-pointer transition ${
                            checked
                              ? "bg-slate-800 ring-1 ring-slate-600"
                              : "bg-slate-900 ring-1 ring-slate-800 hover:bg-slate-800/60"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleNumber(s.key)}
                            className="h-4 w-4 rounded accent-indigo-500"
                          />
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                          <span className="text-slate-100">
                            {s.label} <span className="text-slate-400">({s.unit})</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-6">
          {loading ? (
            <div className="flex h-64 items-center justify-center rounded-2xl bg-slate-900/75 ring-1 ring-slate-800">
              <p className="text-sm text-slate-300 animate-pulse">Chargement...</p>
            </div>
          ) : (
            <div className="space-y-4">
              {!hasData && !noNutritionSelection && (
                <div className="rounded-xl bg-slate-900 p-3 text-center ring-1 ring-slate-700">
                  <p className="text-xs text-slate-300">Aucune donnée sur la période.</p>
                </div>
              )}
              {noNutritionSelection && (
                <div className="rounded-xl bg-slate-900 p-3 text-center ring-1 ring-slate-700">
                  <p className="text-xs text-slate-300">Selectionne au moins une serie a afficher.</p>
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
                    {metric === "nutrition" ? renderNutritionChart() : renderStandardChart()}
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

        {metric === "nutrition" && nutritionMode === "score" && nutritionScoreLatest && (
          <div className="grid grid-cols-2 gap-3">
            {nutritionScoreSeries.map((series) => {
              const value = nutritionScoreLatest[series.key];
              const isActive = scoreSelected.has(series.key);
              return (
                <div
                  key={series.key}
                  className={`rounded-2xl border p-4 shadow-sm ${
                    isActive ? "border-slate-600 bg-slate-900/90" : "border-slate-800 bg-slate-900/40 opacity-60"
                  }`}
                >
                  <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: series.color }}>
                    {series.label}
                  </p>
                  <p className="mt-1 text-base font-bold text-slate-100">
                    {typeof value === "number" ? (Number.isInteger(value) ? value : value.toFixed(2)) : "-"}
                    {typeof value === "number" && <span className="text-xs text-slate-400"> /10</span>}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {metric === "nutrition" && nutritionMode === "number" && nutritionNumberLatest && (
          <div className="grid grid-cols-2 gap-3">
            {nutritionNumberSeries.map((series) => {
              const value = nutritionNumberLatest[series.key];
              const isActive = numberSelected.has(series.key);
              return (
                <div
                  key={series.key}
                  className={`rounded-2xl border p-4 shadow-sm ${
                    isActive ? "border-slate-600 bg-slate-900/90" : "border-slate-800 bg-slate-900/40 opacity-60"
                  }`}
                >
                  <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: series.color }}>
                    {series.label}
                  </p>
                  <p className="mt-1 text-base font-bold text-slate-100">
                    {typeof value === "number" ? (Number.isInteger(value) ? value : value.toFixed(1)) : "-"}
                    {typeof value === "number" && <span className="text-xs text-slate-400"> {series.unit}</span>}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {metric !== "nutrition" && lastValue !== null && (
          <div className="mb-3 rounded-2xl border border-indigo-500/30 bg-indigo-950/35 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-300">Derniere valeur</p>
            <p className="mt-1 text-sm font-bold text-indigo-100">{formatMetricValue(lastValue)}</p>
          </div>
        )}

        {metric !== "nutrition" && metricStats ? (
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
        ) : metric !== "nutrition" ? (
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
