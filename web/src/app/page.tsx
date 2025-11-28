"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db, isFirebaseConfigured } from "@/lib/firebase";

type MiniChartProps = {
  title: string;
  dates: string[];
  values: Array<number | null>;
  formatter?: (v: number) => string;
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

function MiniChart({ title, dates, values, formatter }: MiniChartProps) {
  const numericValues = values.filter((v): v is number => typeof v === "number");
  const hasData = numericValues.length > 0;

  const { yMin, yMax, ticks } = useMemo(() => {
    if (!hasData) return { yMin: 0, yMax: 1, ticks: [0, 0.25, 0.5, 0.75, 1] };
    const rawMin = Math.min(...numericValues);
    const rawMax = Math.max(...numericValues);
    const isBinaryMetric = rawMax <= 1 && rawMin >= 0;
    if (isBinaryMetric) return { yMin: 0, yMax: 1, ticks: [0, 0.25, 0.5, 0.75, 1] };
    const range = rawMax - rawMin || 1;
    const padding = Math.max(range * 0.1, 1);
    const yMinCandidate = rawMin - padding;
    const yMaxCandidate = rawMax + padding;
    const safeRange = yMaxCandidate - yMinCandidate || 1;
    const step = safeRange / 4;
    const ticks = Array.from({ length: 5 }, (_, i) => yMinCandidate + step * i);
    return { yMin: yMinCandidate, yMax: yMaxCandidate, ticks };
  }, [hasData, numericValues]);

  return (
    <div className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <div className="mt-3 flex h-32">
        <div className="flex w-10 flex-col justify-between text-[9px] font-semibold text-slate-500">
          {ticks
            .slice()
            .reverse()
            .map((tick) => (
              <span key={tick}>{formatter ? formatter(tick) : Number.isInteger(tick) ? tick : tick.toFixed(1)}</span>
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
              columnGap: dates.length > 10 ? "2px" : "6px",
            }}
          >
            {dates.map((date, idx) => {
              const value = values[idx];
              if (value === null || value === undefined) {
                return <div key={date} className="h-full rounded-t-md bg-slate-200/60" />;
              }
              const normalized = (value - yMin) / (yMax - yMin || 1);
              const heightPercent = Math.max(4, Math.min(100, normalized * 100));
              const labelDate = new Date(date);
              const shortLabel = `${labelDate.getMonth() + 1}/${labelDate.getDate()}`;
              return (
                <div key={date} className="flex h-full flex-col items-center justify-end gap-1 text-[9px]">
                  <div
                    className="relative flex w-full items-end justify-center overflow-visible rounded-t-md bg-sky-500 shadow-sm transition-all"
                    style={{ height: `${heightPercent}%` }}
                  >
                    {value > 0 && (
                      <span className="absolute -top-4 rounded bg-white/90 px-1 text-[8px] font-semibold text-sky-700 shadow">
                        {formatter ? formatter(value) : value}
                      </span>
                    )}
                  </div>
                  <span className="text-[8px] text-slate-400">{shortLabel}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [userId, setUserId] = useState<string | null>(null);
  const [caloriesByDate, setCaloriesByDate] = useState<Record<string, number>>({});
  const [dailyLogsByDate, setDailyLogsByDate] = useState<Record<string, { exercises?: string[]; sleepTime?: string }>>({});
  const dates = useMemo(() => buildDateRange(7), []);

  useEffect(() => {
    if (!auth || !db || !isFirebaseConfigured) return;
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setUserId(null);
        setCaloriesByDate({});
        setDailyLogsByDate({});
        return;
      }
      setUserId(user.uid);
      const calQ = query(collection(db!, "calories"), where("userId", "==", user.uid));
      const logQ = query(collection(db!, "dailyLogs"), where("userId", "==", user.uid));

      const unsubCal = onSnapshot(calQ, (snap) => {
        const next: Record<string, number> = {};
        snap.docs.forEach((docSnap) => {
          const data = docSnap.data() as { date?: string; calories?: number };
          if (!data.date) return;
          next[data.date] = (next[data.date] || 0) + (Number(data.calories) || 0);
        });
        setCaloriesByDate(next);
      });

      const unsubLogs = onSnapshot(logQ, (snap) => {
        const next: Record<string, { exercises?: string[]; sleepTime?: string }> = {};
        snap.docs.forEach((docSnap) => {
          const data = docSnap.data() as { date?: string; exercises?: string[]; sleepTime?: string };
          if (!data.date) return;
          next[data.date] = {
            exercises: Array.isArray(data.exercises) ? data.exercises : [],
            sleepTime: data.sleepTime,
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

  const caloriesValues = useMemo(
    () => dates.map((d) => caloriesByDate[d] ?? null),
    [dates, caloriesByDate],
  );

  const activitiesValues = useMemo(
    () =>
      dates.map((d) => {
        const ex = dailyLogsByDate[d]?.exercises;
        if (!ex) return null;
        return ex.length;
      }),
    [dates, dailyLogsByDate],
  );

  const sleepValues = useMemo(
    () =>
      dates.map((d) => {
        const sleep = dailyLogsByDate[d]?.sleepTime;
        if (!sleep) return null;
        return parseSleepToHours(sleep);
      }),
    [dates, dailyLogsByDate],
  );

  return (
    <div className="space-y-4 pb-6">
      <section className="space-y-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
        <div className="flex items-center justify-between">
          <h1 className="text-base font-semibold text-slate-900">Vue rapide · Dernière semaine</h1>
          <Link href="/stat" className="text-sm font-semibold text-sky-600 hover:underline">
            Voir plus
          </Link>
        </div>
        {!isFirebaseConfigured || !userId ? (
          <p className="text-sm text-slate-600">Connecte-toi et configure Firebase pour voir les graphiques.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <MiniChart title="Calories / jour" dates={dates} values={caloriesValues} />
            <MiniChart title="Activités sportives" dates={dates} values={activitiesValues} />
            <MiniChart
              title="Sommeil (h)"
              dates={dates}
              values={sleepValues}
              formatter={(v) => formatHoursToHHMM(v)}
            />
          </div>
        )}
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
        <p className="text-sm font-medium text-slate-700">Capture quick info and routines.</p>
        <Link
          href="/info"
          className="mt-4 flex w-full items-center justify-center rounded-lg bg-sky-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-700"
        >
          add information
        </Link>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
        <p className="text-sm font-medium text-slate-700">Organize your tasks and daily checks.</p>
        <Link
          href="/todo"
          className="mt-4 flex w-full items-center justify-center rounded-lg bg-sky-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-700"
        >
          access TODO
        </Link>
      </section>
    </div>
  );
}
