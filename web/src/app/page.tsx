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
    <div className="flex min-w-0 flex-col rounded-3xl border border-neutral-100 bg-neutral-50/50 p-4 transition-all hover:bg-neutral-50">
      <p className="text-xs font-bold uppercase tracking-wider text-neutral-500">{title}</p>
      <div className="mt-3 h-24">
        <div className="relative h-full">
          {/* Lignes de la grille (plus subtiles) */}
          <div className="absolute inset-0 flex flex-col justify-between">
            {ticks.map((_, idx) => (
              <div key={idx} className="h-px w-full bg-neutral-200/40 border-t border-dashed border-neutral-200/60" />
            ))}
          </div>
          {/* Barres du graphique */}
          <div
            className="relative grid h-full items-end"
            style={{
              gridTemplateColumns: `repeat(${dates.length}, minmax(0, 1fr))`,
              columnGap: "6px",
            }}
          >
            {dates.map((date, idx) => {
              const value = values[idx];
              if (value === null || value === undefined) {
                return <div key={date} className="h-full rounded-t-sm bg-neutral-100/50" />;
              }
              const normalized = (value - yMin) / (yMax - yMin || 1);
              const heightPercent = Math.max(4, Math.min(100, normalized * 100));
              const labelDate = new Date(date);
              const shortLabel = `${labelDate.getDate()}`;
              
              return (
                <div key={date} className="group flex h-full flex-col items-center justify-end gap-1">
                  <div
                    className="relative flex w-full items-end justify-center rounded-t-md bg-indigo-500 shadow-sm transition-all group-hover:bg-indigo-600"
                    style={{ height: `${heightPercent}%` }}
                  >
                    {/* Tooltip au survol */}
                    <div className="absolute -top-8 hidden flex-col items-center group-hover:flex z-10">
                       <span className="whitespace-nowrap rounded-lg bg-neutral-900 px-2 py-1 text-[10px] font-bold text-white shadow-lg">
                        {formatter ? formatter(value) : value}
                      </span>
                      <div className="h-1 w-1 rotate-45 bg-neutral-900"></div>
                    </div>
                  </div>
                  <span className="text-[9px] font-medium text-neutral-400">{shortLabel}</span>
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
    <div className="space-y-6 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
      
      {/* En-tête de bienvenue (optionnel, pour l'esthétique) */}
      <div className="px-1">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Tableau de bord</h1>
        <p className="text-neutral-500">Tes performances de la semaine.</p>
      </div>

      {/* Section Graphiques */}
      <section className="relative overflow-hidden rounded-3xl bg-white p-5 shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-neutral-100">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
            <h2 className="text-sm font-bold text-neutral-900">Aperçu Hebdomadaire</h2>
          </div>
          <Link href="/stat" className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-600 transition hover:bg-indigo-100">
            Détails &rarr;
          </Link>
        </div>

        {!isFirebaseConfigured || !userId ? (
          <div className="rounded-2xl bg-neutral-50 p-6 text-center">
            <p className="text-sm font-medium text-neutral-600">Connecte-toi et configure Firebase pour voir les graphiques.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <MiniChart title="Calories" dates={dates} values={caloriesValues} />
            <MiniChart title="Activités" dates={dates} values={activitiesValues} />
            <MiniChart
              title="Sommeil"
              dates={dates}
              values={sleepValues}
              formatter={(v) => formatHoursToHHMM(v)}
            />
          </div>
        )}
      </section>

      {/* Grille d'actions rapides (Style Bento) */}
      <div className="grid grid-cols-2 gap-4">
        
        {/* Carte Journal */}
        <Link
          href="/info"
          className="group relative col-span-1 overflow-hidden rounded-3xl bg-white p-5 shadow-sm border border-neutral-100 transition-all hover:shadow-md hover:-translate-y-0.5 active:scale-95"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 mb-3 group-hover:bg-indigo-600 group-hover:text-white transition-colors duration-300">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
          </div>
          <h3 className="font-bold text-neutral-900 text-base">Journal</h3>
          <p className="text-xs text-neutral-500 mt-1 font-medium">Saisir ma journée</p>
        </Link>

        {/* Carte Points */}
        <Link
          href="/points"
          className="group relative col-span-1 overflow-hidden rounded-3xl bg-white p-5 shadow-sm border border-neutral-100 transition-all hover:shadow-md hover:-translate-y-0.5 active:scale-95"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 mb-3 group-hover:bg-amber-500 group-hover:text-white transition-colors duration-300">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" /></svg>
          </div>
          <h3 className="font-bold text-neutral-900 text-base">Points</h3>
          <p className="text-xs text-neutral-500 mt-1 font-medium">Voir mon rang</p>
        </Link>

        {/* Carte Todo (Large) */}
        <Link
          href="/todo"
          className="group relative col-span-2 flex items-center justify-between overflow-hidden rounded-3xl bg-neutral-900 p-5 text-white shadow-lg shadow-neutral-200 transition-all hover:shadow-xl hover:-translate-y-0.5 active:scale-95"
        >
          <div>
            <h3 className="font-bold text-lg">Mes Tâches</h3>
            <p className="text-xs text-neutral-400 mt-1 font-medium">Gérer mes routines quotidiennes</p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-800 border border-neutral-700 group-hover:bg-white group-hover:text-black transition-colors duration-300">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4" strokeLinecap="round" strokeLinejoin="round"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
        </Link>

      </div>
    </div>
  );
}