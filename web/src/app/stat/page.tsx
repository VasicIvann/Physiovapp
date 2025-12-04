"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db, isFirebaseConfigured } from "@/lib/firebase";

type TimeRangeKey = "7d" | "30d" | "365d";
type MetricKey =
  | "weight"
  | "calories"
  | "protein"
  | "carbs"
  | "fat"
  | "activities"
  | "sleepTime"
  | "skinCare"
  | "shower"
  | "supplement";

type TimeRangeOption = { key: TimeRangeKey; label: string; days: number };
type MetricOption = { key: MetricKey; label: string };

type CalorieEntry = {
  date: string;
  calories?: number;
  proteins?: number;
  carbs?: number;
  fat?: number;
};
type DailyLogEntry = {
  date: string;
  weight?: number;
  exercises?: string[];
  sleepTime?: string;
  skinCare?: "done" | "not done";
  shower?: "done" | "not done";
  supplement?: "done" | "not done";
};

const timeRanges: TimeRangeOption[] = [
  { key: "7d", label: "Derniere semaine", days: 7 },
  { key: "30d", label: "Dernier mois", days: 30 },
  { key: "365d", label: "Derniere annee", days: 365 },
];

const metrics: MetricOption[] = [
  { key: "weight", label: "Poids" },
  { key: "calories", label: "Calories / jour" },
  { key: "protein", label: "Proteines / jour" },
  { key: "carbs", label: "Glucides / jour" },
  { key: "fat", label: "Lipides / jour" },
  { key: "activities", label: "Nb activites sportives / jour" },
  { key: "sleepTime", label: "Temps de sommeil" },
  { key: "skinCare", label: "Skin care (binaire)" },
  { key: "shower", label: "Shower (binaire)" },
  { key: "supplement", label: "Supplement (binaire)" },
];

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
  if (!value || !value.includes(":")) return 0;
  const [h, m] = value.split(":").map((n) => Number(n));
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h + m / 60;
};

const formatHoursToHHMM = (hoursValue: number) => {
  const totalMinutes = Math.max(0, Math.round(hoursValue * 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}:${minutes.toString().padStart(2, "0")}`;
};

export default function StatPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [caloriesByDate, setCaloriesByDate] = useState<Record<string, number>>({});
  const [proteinsByDate, setProteinsByDate] = useState<Record<string, number>>({});
  const [carbsByDate, setCarbsByDate] = useState<Record<string, number>>({});
  const [fatByDate, setFatByDate] = useState<Record<string, number>>({});
  const [dailyLogsByDate, setDailyLogsByDate] = useState<Record<string, DailyLogEntry>>({});
  const [timeRange, setTimeRange] = useState<TimeRangeKey>("7d");
  const [metric, setMetric] = useState<MetricKey>("calories");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth || !db || !isFirebaseConfigured) {
      return;
    }
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setUserId(null);
        setCaloriesByDate({});
        setDailyLogsByDate({});
        setLoading(false);
        return;
      }
      setUserId(user.uid);
      setLoading(true);

      const calQ = query(collection(db!, "calories"), where("userId", "==", user.uid));
      const logQ = query(collection(db!, "dailyLogs"), where("userId", "==", user.uid));

      const unsubCal = onSnapshot(calQ, (snap) => {
        const caloriesMap: Record<string, number> = {};
        const proteinsMap: Record<string, number> = {};
        const carbsMap: Record<string, number> = {};
        const fatMap: Record<string, number> = {};

        snap.docs.forEach((docSnap) => {
          const data = docSnap.data() as CalorieEntry;
          const date = data.date;
          if (!date) return;

          const calories = Number(data.calories) || 0;
          const proteins = Number(data.proteins) || 0;
          const carbs = Number(data.carbs) || 0;
          const fat = Number(data.fat) || 0;

          caloriesMap[date] = (caloriesMap[date] || 0) + calories;
          proteinsMap[date] = (proteinsMap[date] || 0) + proteins;
          carbsMap[date] = (carbsMap[date] || 0) + carbs;
          fatMap[date] = (fatMap[date] || 0) + fat;
        });

        setCaloriesByDate(caloriesMap);
        setProteinsByDate(proteinsMap);
        setCarbsByDate(carbsMap);
        setFatByDate(fatMap);
        setLoading(false);
      });

      const unsubLogs = onSnapshot(logQ, (snap) => {
        const next: Record<string, DailyLogEntry> = {};
        snap.docs.forEach((docSnap) => {
          const data = docSnap.data() as DailyLogEntry;
          if (!data.date) return;
          next[data.date] = {
            date: data.date,
            weight: data.weight,
            exercises: Array.isArray(data.exercises) ? data.exercises : [],
            sleepTime: data.sleepTime,
            skinCare: data.skinCare,
            shower: data.shower,
            supplement: data.supplement,
          };
        });
        setDailyLogsByDate(next);
      });

      return () => {
        unsubCal();
        unsubLogs();
      };
    });

    return () => unsubAuth();
  }, []);

  const dates = useMemo(() => {
    const range = timeRanges.find((r) => r.key === timeRange)?.days ?? 7;
    return buildDateRange(range);
  }, [timeRange]);

  const values = useMemo(() => {
    return dates.map((date) => {
      if (metric === "calories") {
        return caloriesByDate[date] ?? null;
      }
      if (metric === "protein") {
        return proteinsByDate[date] ?? null;
      }
      if (metric === "carbs") {
        return carbsByDate[date] ?? null;
      }
      if (metric === "fat") {
        return fatByDate[date] ?? null;
      }
      if (metric === "weight") {
        return dailyLogsByDate[date]?.weight ?? null;
      }
      if (metric === "activities") {
        if (!dailyLogsByDate[date]?.exercises) return null;
        return dailyLogsByDate[date]?.exercises?.length ?? 0;
      }
      if (metric === "sleepTime") {
        const sleep = dailyLogsByDate[date]?.sleepTime;
        if (!sleep) return null;
        return parseSleepToHours(sleep);
      }
      if (metric === "skinCare") {
        if (!dailyLogsByDate[date]?.skinCare) return null;
        return dailyLogsByDate[date]?.skinCare === "done" ? 1 : 0;
      }
      if (metric === "shower") {
        if (!dailyLogsByDate[date]?.shower) return null;
        return dailyLogsByDate[date]?.shower === "done" ? 1 : 0;
      }
      if (metric === "supplement") {
        if (!dailyLogsByDate[date]?.supplement) return null;
        return dailyLogsByDate[date]?.supplement === "done" ? 1 : 0;
      }
      return 0;
    });
  }, [dates, metric, caloriesByDate, proteinsByDate, carbsByDate, fatByDate, dailyLogsByDate]);

  const isBinaryMetric = metric === "skinCare" || metric === "shower" || metric === "supplement";

  const { yMin, yMax, ticks } = useMemo(() => {
    const dataPoints = values.filter((v) => v !== null && v !== undefined) as number[];
    if (dataPoints.length === 0) {
      return { yMin: 0, yMax: 1, ticks: [0, 0.25, 0.5, 0.75, 1] };
    }

    if (isBinaryMetric) {
      return { yMin: 0, yMax: 1, ticks: [0, 0.25, 0.5, 0.75, 1] };
    }

    const rawMin = Math.min(...dataPoints);
    const rawMax = Math.max(...dataPoints);
    const range = rawMax - rawMin || 1;

    const padding = Math.max(range * 0.1, rawMax === rawMin ? Math.max(1, rawMax * 0.1 || 1) : 1);
    const yMinCandidate = rawMin - padding;
    const yMaxCandidate = rawMax + padding;
    const safeRange = yMaxCandidate - yMinCandidate || 1;

    const step = safeRange / 4;
    const ticks = Array.from({ length: 5 }, (_, i) => yMinCandidate + step * i);

    return { yMin: yMinCandidate, yMax: yMaxCandidate, ticks };
  }, [isBinaryMetric, values]);

  const labelEvery = useMemo(() => {
    if (timeRange === "30d") return 4;
    if (timeRange === "365d") return 30;
    return 1;
  }, [timeRange]);

  const labelIndexesToShow = useMemo(() => {
    const indices = new Set<number>();
    if (dates.length === 0) return indices;
    if (labelEvery === 1) {
      dates.forEach((_, idx) => indices.add(idx));
      return indices;
    }
    const lastIndex = dates.length - 1;
    for (let idx = lastIndex; idx >= 0; idx--) {
      if ((lastIndex - idx) % labelEvery === 0) {
        indices.add(idx);
      }
    }
    return indices;
  }, [dates, labelEvery]);

  const metricNumbers = useMemo(() => {
    return values.filter((v) => typeof v === "number" && v > 0) as number[];
  }, [values]);

  const metricStats = useMemo(() => {
    if (metricNumbers.length === 0) return null;
    const min = Math.min(...metricNumbers);
    const max = Math.max(...metricNumbers);
    const avg = metricNumbers.reduce((sum, v) => sum + v, 0) / metricNumbers.length;
    return { min, max, avg };
  }, [metricNumbers]);

  const hasData = values.some((v) => typeof v === "number" && v > 0);

  if (!isFirebaseConfigured) {
    return (
      <div className="rounded-3xl bg-white p-6 shadow-sm border border-neutral-100">
        <p className="text-sm font-semibold text-rose-600">Configure Firebase pour afficher les statistiques en temps reel.</p>
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="rounded-3xl bg-white p-6 shadow-sm border border-neutral-100">
        <p className="text-sm font-semibold text-neutral-900">Connecte-toi pour voir tes statistiques.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
      
      {/* --- Main Chart Section --- */}
      <section className="rounded-3xl bg-white p-6 shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-neutral-100">
        <div className="flex flex-col gap-4">
          
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold text-neutral-900">Statistiques</h1>
            {/* Range Selector */}
            <div className="relative">
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value as TimeRangeKey)}
                className="appearance-none rounded-xl border border-neutral-200 bg-neutral-50 pl-3 pr-8 py-2 text-xs font-semibold text-neutral-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all cursor-pointer"
              >
                {timeRanges.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-neutral-500">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
            </div>
          </div>

          {/* Metric Selector (Pills) */}
          <div className="flex overflow-x-auto pb-2 no-scrollbar gap-2">
             <select
                value={metric}
                onChange={(e) => setMetric(e.target.value as MetricKey)}
                className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm font-medium text-neutral-800 shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all"
              >
                {metrics.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
          </div>
        </div>

        <div className="mt-6">
          {loading ? (
            <div className="flex h-64 items-center justify-center rounded-2xl bg-neutral-50">
               <p className="text-sm text-neutral-400 animate-pulse">Chargement...</p>
            </div>
          ) : (
            <div className="space-y-4">
              {!hasData && (
                <div className="rounded-xl bg-neutral-50 p-3 text-center">
                  <p className="text-xs text-neutral-500">Aucune donnée sur la période.</p>
                </div>
              )}
              
              <div className="flex h-64 overflow-hidden">
                {/* Y-Axis */}
                <div className="flex w-10 flex-col justify-between text-[9px] font-semibold text-neutral-400 pr-2">
                  {ticks
                    .slice()
                    .reverse()
                    .map((tick) => (
                      <span key={tick}>
                        {metric === "sleepTime"
                          ? formatHoursToHHMM(tick)
                          : Number.isInteger(tick)
                            ? tick
                            : tick.toFixed(1)}
                      </span>
                    ))}
                </div>
                
                {/* Chart Area */}
                <div className="relative flex-1">
                  {/* Grid Lines */}
                  <div className="absolute inset-0 flex flex-col justify-between">
                    {ticks.map((_, idx) => (
                      <div key={idx} className="h-px w-full border-t border-dashed border-neutral-100" />
                    ))}
                  </div>
                  
                  {/* Bars */}
                  <div
                    className="relative grid h-full items-end"
                    style={{
                      gridTemplateColumns: `repeat(${dates.length}, minmax(0, 1fr))`,
                      columnGap: timeRange === "30d" ? "4px" : timeRange === "365d" ? "2px" : "8px",
                    }}
                  >
                    {dates.map((date, idx) => {
                      const value = values[idx];
                      if (value === null || value === undefined) {
                        return (
                          <div key={date} className="flex h-full flex-col items-center justify-end gap-2">
                            <div className="w-full rounded-t bg-neutral-100/50" style={{ height: "4%" }} />
                            <span className="text-[9px] text-transparent h-3">.</span>
                          </div>
                        );
                      }
                      const normalized = (value - yMin) / (yMax - yMin || 1);
                      const heightPercent = Math.max(4, Math.min(100, normalized * 100));
                      const label = new Date(date);
                      const labelText = `${label.getMonth() + 1}/${label.getDate()}`;
                      const showLabel = labelIndexesToShow.has(idx);
                      const displayValue =
                        metric === "sleepTime" ? formatHoursToHHMM(value) : Number.isInteger(value) ? value : value.toFixed(2);
                      
                      return (
                        <div key={date} className="group relative flex h-full flex-col items-center justify-end gap-2">
                          <div
                            className="relative flex w-full items-end justify-center rounded-t-md bg-indigo-500 shadow-sm transition-all group-hover:bg-indigo-600"
                            style={{ height: `${heightPercent}%` }}
                          >
                            {value > 0 && (
                              <div className="absolute -top-8 hidden flex-col items-center group-hover:flex z-10">
                                <span className="whitespace-nowrap rounded-lg bg-neutral-900 px-2 py-1 text-[10px] font-bold text-white shadow-lg">
                                  {displayValue}
                                </span>
                                <div className="h-1 w-1 rotate-45 bg-neutral-900"></div>
                              </div>
                            )}
                          </div>
                          <span className={`text-[9px] font-medium h-3 ${showLabel ? "text-neutral-400" : "text-transparent"}`}>{labelText}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* --- Metrics Summary --- */}
      <section className="rounded-3xl bg-neutral-50 p-6 border border-neutral-100">
        <h2 className="text-sm font-bold text-neutral-900 mb-4">Résumé {metric}</h2>
        {metricStats ? (
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col items-center justify-center rounded-2xl bg-white p-4 shadow-sm border border-neutral-100">
              <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Min</p>
              <p className="mt-1 text-lg font-bold text-neutral-900">
                {metric === "sleepTime" ? formatHoursToHHMM(metricStats.min) : metricStats.min.toFixed(2)}
              </p>
            </div>
            <div className="flex flex-col items-center justify-center rounded-2xl bg-white p-4 shadow-sm border border-neutral-100">
              <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Max</p>
              <p className="mt-1 text-lg font-bold text-neutral-900">
                {metric === "sleepTime" ? formatHoursToHHMM(metricStats.max) : metricStats.max.toFixed(2)}
              </p>
            </div>
            <div className="flex flex-col items-center justify-center rounded-2xl bg-white p-4 shadow-sm border border-neutral-100">
              <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Moy</p>
              <p className="mt-1 text-lg font-bold text-indigo-600">
                {metric === "sleepTime" ? formatHoursToHHMM(metricStats.avg) : metricStats.avg.toFixed(2)}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center rounded-2xl bg-white p-6 border border-neutral-100 border-dashed">
             <p className="text-xs text-neutral-400">Pas de données suffisantes pour calculer les moyennes.</p>
          </div>
        )}
      </section>

      {/* Floating Back Button */}
      <Link
        href="/"
        className="fixed bottom-6 right-6 flex h-14 w-14 items-center justify-center rounded-full bg-neutral-900 text-white shadow-[0_8px_30px_rgba(0,0,0,0.3)] transition-transform hover:scale-110 active:scale-95 z-50"
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M10 19l-7-7m0 0l7-7m-7 7h18" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </Link>
    </div>
  );
}
