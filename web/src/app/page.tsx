"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { auth, db, isFirebaseConfigured } from "@/lib/firebase";

type LineMiniChartProps = {
  title: string;
  data: Array<{ label: string; value: number | null }>;
  color: string;
  formatter?: (v: number) => string;
};

type NutritionMiniChartProps = {
  title: string;
  data: Array<{
    label: string;
    nutritionCalorieScore: number | null;
    nutritionProteinScore: number | null;
    nutritionQualityScore: number | null;
    foodHealthScore: number | null;
  }>;
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

const resolveYAxisDomain = (values: number[]): [number, number] | ["auto", "auto"] => {
  if (!values.length) return ["auto", "auto"];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const padding = range === 0 ? Math.max(1, Math.abs(min) * 0.05) : Math.max(range * 0.2, 0.5);
  return [min - padding, max + padding];
};

function LineMiniChart({ title, data, color, formatter }: LineMiniChartProps) {
  const numericValues = data.map((row) => row.value).filter((v): v is number => typeof v === "number");
  const yDomain = useMemo(() => resolveYAxisDomain(numericValues), [numericValues]);

  return (
    <div className="flex min-w-0 flex-col rounded-3xl border border-neutral-100 bg-neutral-50/50 p-4 transition-all hover:bg-neutral-50">
      <p className="text-xs font-bold uppercase tracking-wider text-neutral-500">{title}</p>
      <div className="mt-3 h-24">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
            <XAxis dataKey="label" hide />
            <YAxis
              hide
              domain={yDomain}
              tickFormatter={formatter}
            />
            <Tooltip
              contentStyle={{ borderRadius: 10, border: "1px solid #e5e7eb", fontSize: "11px" }}
              labelStyle={{ color: "#111827", fontWeight: 700 }}
              formatter={(value: number | string) => {
                const numeric = typeof value === "number" ? value : Number(value);
                return [formatter ? formatter(numeric) : Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(2), title];
              }}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2.4}
              dot={false}
              activeDot={{ r: 3 }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function NutritionMiniChart({ title, data }: NutritionMiniChartProps) {
  const numericValues = data
    .flatMap((row) => [
      row.nutritionCalorieScore,
      row.nutritionProteinScore,
      row.nutritionQualityScore,
      row.foodHealthScore,
    ])
    .filter((v): v is number => typeof v === "number");
  const yDomain = useMemo(() => resolveYAxisDomain(numericValues), [numericValues]);

  return (
    <div className="flex min-w-0 flex-col rounded-3xl border border-neutral-100 bg-neutral-50/50 p-4 transition-all hover:bg-neutral-50">
      <p className="text-xs font-bold uppercase tracking-wider text-neutral-500">{title}</p>
      <div className="mt-3 h-24">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
            <XAxis dataKey="label" hide />
            <YAxis hide domain={yDomain} />
            <Tooltip
              contentStyle={{ borderRadius: 10, border: "1px solid #e5e7eb", fontSize: "11px" }}
              labelStyle={{ color: "#111827", fontWeight: 700 }}
            />
            <Line type="monotone" dataKey="nutritionCalorieScore" name="Calories" stroke="#f59e0b" strokeWidth={1.7} strokeOpacity={0.5} dot={false} activeDot={{ r: 2.5 }} connectNulls />
            <Line type="monotone" dataKey="nutritionProteinScore" name="Proteines" stroke="#f97316" strokeWidth={1.7} strokeOpacity={0.5} dot={false} activeDot={{ r: 2.5 }} connectNulls />
            <Line type="monotone" dataKey="nutritionQualityScore" name="Qualite" stroke="#ef4444" strokeWidth={1.7} strokeOpacity={0.5} dot={false} activeDot={{ r: 2.5 }} connectNulls />
            <Line type="monotone" dataKey="foodHealthScore" name="Globale" stroke="#4f46e5" strokeWidth={2.8} strokeOpacity={0.98} dot={false} activeDot={{ r: 3 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function Home() {
  const [userId, setUserId] = useState<string | null>(null);
  const [dailyLogsByDate, setDailyLogsByDate] = useState<
    Record<
      string,
      {
        exercises?: string[];
        sleepTime?: string;
        nutritionCalorieScore?: number;
        nutritionProteinScore?: number;
        nutritionQualityScore?: number;
      }
    >
  >({});
  const dates = useMemo(() => buildDateRange(7), []);

  useEffect(() => {
    if (!auth || !db || !isFirebaseConfigured) return;
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setUserId(null);
        setDailyLogsByDate({});
        return;
      }
      setUserId(user.uid);
      const logQ = query(collection(db!, "dailyLogs"), where("userId", "==", user.uid));

      const unsubLogs = onSnapshot(logQ, (snap) => {
        const next: Record<
          string,
          {
            exercises?: string[];
            sleepTime?: string;
            nutritionCalorieScore?: number;
            nutritionProteinScore?: number;
            nutritionQualityScore?: number;
          }
        > = {};
        snap.docs.forEach((docSnap) => {
          const data = docSnap.data() as {
            date?: string;
            exercises?: string[];
            sleepTime?: string;
            nutritionCalorieScore?: number;
            nutritionProteinScore?: number;
            nutritionQualityScore?: number;
          };
          if (!data.date) return;
          next[data.date] = {
            exercises: Array.isArray(data.exercises) ? data.exercises : [],
            sleepTime: data.sleepTime,
            nutritionCalorieScore: data.nutritionCalorieScore,
            nutritionProteinScore: data.nutritionProteinScore,
            nutritionQualityScore: data.nutritionQualityScore,
          };
        });
        setDailyLogsByDate(next);
      });

      return () => {
        unsubLogs();
      };
    });

    return () => unsubAuth();
  }, []);

  const nutritionGlobalValues = useMemo(
    () =>
      dates.map((d) => {
        const row = dailyLogsByDate[d];
        const a = row?.nutritionCalorieScore;
        const b = row?.nutritionProteinScore;
        const c = row?.nutritionQualityScore;
        if ([a, b, c].every((v) => typeof v === "number")) {
          return ((a as number) + (b as number) + (c as number)) / 3;
        }
        return null;
      }),
    [dates, dailyLogsByDate],
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

  const lineNutritionData = useMemo(
    () =>
      dates.map((d, idx) => {
        const row = dailyLogsByDate[d];
        const a = typeof row?.nutritionCalorieScore === "number" ? row.nutritionCalorieScore : null;
        const b = typeof row?.nutritionProteinScore === "number" ? row.nutritionProteinScore : null;
        const c = typeof row?.nutritionQualityScore === "number" ? row.nutritionQualityScore : null;
        const g = typeof nutritionGlobalValues[idx] === "number" ? nutritionGlobalValues[idx] : null;
        return {
          label: String(new Date(d).getDate()),
          nutritionCalorieScore: a,
          nutritionProteinScore: b,
          nutritionQualityScore: c,
          foodHealthScore: g,
        };
      }),
    [dates, dailyLogsByDate, nutritionGlobalValues],
  );

  const lineActivitiesData = useMemo(
    () => dates.map((d, idx) => ({ label: String(new Date(d).getDate()), value: activitiesValues[idx] })),
    [dates, activitiesValues],
  );

  const lineSleepData = useMemo(
    () => dates.map((d, idx) => ({ label: String(new Date(d).getDate()), value: sleepValues[idx] })),
    [dates, sleepValues],
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
            <NutritionMiniChart title="Nuttrition globale" data={lineNutritionData} />
            <LineMiniChart title="Activités" data={lineActivitiesData} color="#0ea5e9" />
            <LineMiniChart
              title="Sommeil"
              data={lineSleepData}
              color="#7c3aed"
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