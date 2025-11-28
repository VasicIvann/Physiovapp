"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db, isFirebaseConfigured } from "@/lib/firebase";

type TimeRangeKey = "7d" | "30d" | "365d";
type MetricKey = "weight" | "calories" | "activities" | "sleepTime" | "skinCare" | "shower" | "supplement";

type TimeRangeOption = { key: TimeRangeKey; label: string; days: number };
type MetricOption = { key: MetricKey; label: string };

type CalorieEntry = { date: string; calories?: number };
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
        const next: Record<string, number> = {};
        snap.docs.forEach((docSnap) => {
          const data = docSnap.data() as CalorieEntry;
          const date = data.date;
          if (!date) return;
          const calories = Number(data.calories) || 0;
          next[date] = (next[date] || 0) + calories;
        });
        setCaloriesByDate(next);
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
  }, [dates, metric, caloriesByDate, dailyLogsByDate]);

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
      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
        <p className="text-sm font-semibold text-rose-600">Configure Firebase pour afficher les statistiques en temps reel.</p>
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
        <p className="text-sm font-semibold text-slate-900">Connecte-toi pour voir tes statistiques.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-lg font-semibold text-slate-900">Statistiques</h1>
          <div className="flex flex-wrap gap-2">
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as TimeRangeKey)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            >
              {timeRanges.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              value={metric}
              onChange={(e) => setMetric(e.target.value as MetricKey)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            >
              {metrics.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4 shadow-inner">
          {loading ? (
            <p className="text-sm text-slate-600">Chargement du graphique...</p>
          ) : (
            <div className="space-y-3">
              {!hasData && <p className="text-sm text-slate-500">Aucune donnee sur la periode selectionnee.</p>}
              <div className="flex h-64 overflow-hidden">
                <div className="flex w-12 flex-col justify-between text-[10px] font-semibold text-slate-500">
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
                <div className="relative flex-1">
                  <div className="absolute inset-0 flex flex-col justify-between">
                    {ticks.map((_, idx) => (
                      <div key={idx} className="h-px w-full bg-slate-200/70" />
                    ))}
                  </div>
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
                          <div key={date} className="flex h-full flex-col items-center justify-end gap-1 text-[10px]">
                            <div className="flex w-full items-end justify-center rounded-t-md bg-slate-200/60" style={{ height: "4%" }} />
                            <span className="text-[10px] text-transparent">{"00/00"}</span>
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
                        <div key={date} className="flex h-full flex-col items-center justify-end gap-1 text-[10px]">
                          <div
                            className="relative flex w-full items-end justify-center overflow-visible rounded-t-md bg-sky-500 shadow-sm transition-all"
                            style={{ height: `${heightPercent}%` }}
                          >
                            {value > 0 && (
                              <span className="absolute -top-5 whitespace-nowrap rounded bg-white/90 px-1 text-[9px] font-semibold text-sky-700 shadow">
                                {displayValue}
                              </span>
                            )}
                          </div>
                          <span className={`text-[10px] ${showLabel ? "text-slate-500" : "text-transparent"}`}>{labelText}</span>
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
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
        <h2 className="text-sm font-semibold text-slate-900">Métriques</h2>
        {metricStats ? (
          <div className="mt-3 grid grid-cols-3 gap-3 text-sm font-semibold text-slate-900">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Min</p>
              <p className="text-base">
                {metric === "sleepTime" ? formatHoursToHHMM(metricStats.min) : metricStats.min.toFixed(2)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Max</p>
              <p className="text-base">
                {metric === "sleepTime" ? formatHoursToHHMM(metricStats.max) : metricStats.max.toFixed(2)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Moyenne</p>
              <p className="text-base">
                {metric === "sleepTime" ? formatHoursToHHMM(metricStats.avg) : metricStats.avg.toFixed(2)}
              </p>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500">Pas de données non nulles sur la période.</p>
        )}
      </section>
      <Link
        href="/"
        className="fixed bottom-6 right-6 rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-lg ring-1 ring-rose-300 transition hover:bg-rose-700"
      >
        come back
      </Link>
    </div>
  );
}
