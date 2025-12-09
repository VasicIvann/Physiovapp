/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, getDocs, query, where, setDoc, doc, getDoc, type DocumentData } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db, isFirebaseConfigured } from "@/lib/firebase";
import { computePointsFromLogs, computeDailyPoints, type DailyLogEntry, type PointsSummary } from "@/lib/pointsRules";
const rankOrder = ["iron", "bronze", "silver", "gold", "plat", "diam", "asc", "imo", "rad"] as const;

export default function PointsPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [summary, setSummary] = useState<PointsSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<DailyLogEntry[]>([]);

  useEffect(() => {
    if (!auth || !db || !isFirebaseConfigured) return;
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setUserId(null);
        setSummary(null);
        return;
      }
      setUserId(user.uid);
      await recompute(user.uid);
    });
    return () => unsub();
  }, []);

  const recompute = async (uid: string) => {
    if (!db) return;
    setLoading(true);
    setError(null);
    try {
      const logsQ = query(collection(db!, "dailyLogs"), where("userId", "==", uid));
      const caloriesQ = query(collection(db!, "calories"), where("userId", "==", uid));

      const [logsSnap, caloriesSnap, userSnap] = await Promise.all([
        getDocs(logsQ),
        getDocs(caloriesQ),
        getDoc(doc(db!, "users", uid)),
      ]);

      const caloriesByDate = new Map<string, number>();
      caloriesSnap.docs.forEach((d) => {
        const data = d.data() as { date?: string; calories?: number };
        if (!data.date) return;
        const prev = caloriesByDate.get(data.date) ?? 0;
        caloriesByDate.set(data.date, prev + (Number(data.calories) || 0));
      });

      const userData = userSnap.data() as DocumentData | undefined;
      const calorieGoal =
        userData && typeof userData.calorieGoal === "number" ? userData.calorieGoal : undefined;

      const baseLogs: DailyLogEntry[] = logsSnap.docs
        .map((d) => d.data() as DailyLogEntry)
        .filter((d) => !!d.date)
        .sort((a, b) => a.date.localeCompare(b.date));

      const logsWithCalories: DailyLogEntry[] = baseLogs.map((log) => ({
        ...log,
        caloriesTotal: caloriesByDate.get(log.date) ?? undefined,
        calorieGoal,
      }));

      const computed = computePointsFromLogs(logsWithCalories);
      setSummary(computed);
      setLogs(logsWithCalories);

      await setDoc(doc(db!, "points", uid), {
        userId: uid,
        ...computed,
      });
    } catch (err) {
      console.error(err);
      setError("Impossible de recalculer les points.");
    } finally {
      setLoading(false);
    }
  };

  const cards = useMemo(() => {
    if (!summary) return [];
    return [
      { label: "Total", value: summary.totalPoints, color: "text-indigo-600", bg: "bg-indigo-50" },
      { label: "Journalier", value: summary.dailyPoints, color: "text-emerald-600", bg: "bg-emerald-50" },
      { label: "Hebdo", value: summary.weeklyPoints, color: "text-amber-600", bg: "bg-amber-50" },
    ];
  }, [summary]);

  const lastWeekDates = useMemo(() => {
    const today = new Date();
    const dates: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      dates.push(d.toISOString().slice(0, 10));
    }
    return dates;
  }, []);

  const pointsLastWeek = useMemo(() => {
    const byDate = new Map<string, DailyLogEntry>();
    logs.forEach((log) => {
      if (log.date) byDate.set(log.date, log);
    });
    return lastWeekDates.map((date) => {
      const entry = byDate.get(date);
      return entry ? computeDailyPoints(entry) : 0;
    });
  }, [lastWeekDates, logs]);

  const statsY = useMemo(() => {
    const dataPoints = pointsLastWeek.filter((v) => typeof v === "number") as number[];
    if (dataPoints.length === 0) return { yMin: 0, yMax: 1, ticks: [0, 0.25, 0.5, 0.75, 1] };
    const rawMin = Math.min(0, ...dataPoints);
    const rawMax = Math.max(0, ...dataPoints);
    const range = rawMax - rawMin || 1;
    const padding = Math.max(range * 0.1, 1);
    const yMin = rawMin - padding;
    const yMax = rawMax + padding;
    const step = (yMax - yMin) / 4 || 1;
    const ticks = Array.from({ length: 5 }, (_, i) => yMin + step * i);
    return { yMin, yMax, ticks };
  }, [pointsLastWeek]);

  const sortedLogs = useMemo(() => [...logs].sort((a, b) => a.date.localeCompare(b.date)), [logs]);

  const totalPointsEvolution = useMemo(() => {
    return lastWeekDates.map((date) => {
      const subset = sortedLogs.filter((log) => log.date <= date);
      const computed = computePointsFromLogs(subset);
      return computed.totalPoints;
    });
  }, [lastWeekDates, sortedLogs]);

  const totalStatsY = useMemo(() => {
    const dataPoints = totalPointsEvolution.filter((v) => typeof v === "number") as number[];
    if (dataPoints.length === 0) return { yMin: 0, yMax: 1, ticks: [0, 0.25, 0.5, 0.75, 1] };
    const rawMin = Math.min(0, ...dataPoints);
    const rawMax = Math.max(0, ...dataPoints);
    const range = rawMax - rawMin || 1;
    const padding = Math.max(range * 0.1, 1);
    const yMin = rawMin - padding;
    const yMax = rawMax + padding;
    const step = (yMax - yMin) / 4 || 1;
    const ticks = Array.from({ length: 5 }, (_, i) => yMin + step * i);
    return { yMin, yMax, ticks };
  }, [totalPointsEvolution]);

  return (
    <div className="space-y-6 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
      
      {/* --- Section RANK & ACTIONS --- */}
      <section className="relative overflow-hidden rounded-3xl bg-white p-6 shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-neutral-100">
        <div className="mb-6 flex flex-col items-center justify-center gap-3">
          {summary ? (
            <>
              <div className="relative">
                <div className="absolute inset-0 animate-pulse rounded-full bg-indigo-400 blur-2xl opacity-20" />
                <img
                  src={`/rank/${summary.rank}.png`}
                  alt={summary.rank}
                  className="relative h-24 w-24 object-contain drop-shadow-lg transition-transform hover:scale-105"
                />
              </div>
              <div className="text-center">
                <p className="text-xs font-bold uppercase tracking-widest text-neutral-400">Rang Actuel</p>
                <p className="text-2xl font-black capitalize text-neutral-900 tracking-tight">{summary.rank}</p>
              </div>
              
            </>
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-neutral-100">
              <span className="text-3xl">?</span>
            </div>
          )}
          
          {/* Rank Progress Bar */}
          <div className="mt-4 flex w-full justify-between gap-1 px-1">
            {rankOrder.map((rank) => {
              const isCurrent = summary?.rank === rank;
              return (
                <div
                  key={rank}
                  className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
                    isCurrent ? "bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]" : "bg-neutral-100"
                  }`}
                />
              );
            })}
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between border-t border-neutral-100 pt-4">
          <div className="flex flex-col">
            <h1 className="text-lg font-bold text-neutral-900">Score</h1>
            <p className="text-xs font-medium text-neutral-400">
              Mise à jour auto
            </p>
          </div>
          {userId && (
            <button
              onClick={() => recompute(userId)}
              disabled={loading}
              className="group flex items-center gap-2 rounded-full bg-neutral-900 px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-neutral-800 active:scale-95 disabled:opacity-50"
            >
              {loading ? (
                <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
              ) : (
                <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeLinecap="round" strokeLinejoin="round"/></svg>
              )}
              Actualiser
            </button>
          )}
        </div>

        {!isFirebaseConfigured && (
          <div className="mt-4 rounded-xl bg-rose-50 p-3 text-center text-xs font-semibold text-rose-600">
            Firebase non configuré.
          </div>
        )}
        {!userId && isFirebaseConfigured && (
          <div className="mt-4 rounded-xl bg-neutral-100 p-3 text-center text-xs font-semibold text-neutral-600">
            Connecte-toi pour voir tes points.
          </div>
        )}
        {error && <p className="mt-3 text-center text-xs font-bold text-rose-600">{error}</p>}

        {summary && (
          <div className="mt-6 grid grid-cols-3 gap-3">
            {cards.map((card) => (
              <div key={card.label} className={`flex flex-col items-center rounded-2xl p-3 ${card.bg}`}>
                <p className={`text-[10px] font-bold uppercase tracking-wider ${card.color} opacity-80`}>{card.label}</p>
                <p className={`mt-1 text-xl font-black ${card.color}`}>{card.value}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* --- Section GRAPHS --- */}
      <div className="grid gap-6">
        {/* Daily Evolution */}
        <section className="relative rounded-3xl bg-white p-6 shadow-sm border border-neutral-100">
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <h2 className="text-sm font-bold text-neutral-900">Points Journaliers</h2>
          </div>
          
          <div className="flex h-40">
            {/* Y-Axis Labels */}
            <div className="flex w-8 flex-col justify-between text-[9px] font-semibold text-neutral-400">
              {statsY.ticks.slice().reverse().map((tick) => (
                <span key={tick}>{Number.isInteger(tick) ? tick : tick.toFixed(1)}</span>
              ))}
            </div>
            
            {/* Chart Area */}
            <div className="relative flex-1">
              {/* Grid Lines */}
              <div className="absolute inset-0 flex flex-col justify-between">
                {statsY.ticks.map((_, idx) => (
                  <div key={idx} className="h-px w-full border-t border-dashed border-neutral-100" />
                ))}
              </div>
              
              {/* Bars */}
              <div
                className="relative grid h-full items-end"
                style={{
                  gridTemplateColumns: `repeat(${lastWeekDates.length}, minmax(0, 1fr))`,
                  columnGap: "8px",
                }}
              >
                {lastWeekDates.map((date, idx) => {
                  const value = pointsLastWeek[idx];
                  const range = statsY.yMax - statsY.yMin || 1;
                  const zeroPos = ((0 - statsY.yMin) / range) * 100;
                  const barHeight = Math.max(2, (Math.abs(value) / range) * 100);
                  const bottom = value >= 0 ? zeroPos : zeroPos - barHeight;
                  const labelDate = new Date(date);
                  const shortLabel = `${labelDate.getDate()}/${labelDate.getMonth() + 1}`;
                  
                  return (
                    <div key={date} className="relative flex h-full flex-col items-center justify-end group">
                      <div className="relative flex h-full w-full items-end">
                        <div
                          className="absolute left-0 right-0 flex items-end justify-center rounded-t-lg bg-indigo-500 shadow-sm transition-all group-hover:bg-indigo-600"
                          style={{
                            height: `${barHeight}%`,
                            bottom: `${Math.max(0, Math.min(100, bottom))}%`,
                          }}
                        >
                          {/* Value Tooltip */}
                          <span className="absolute -top-6 text-[10px] font-bold text-neutral-700 opacity-0 transition-opacity group-hover:opacity-100 bg-white px-1.5 py-0.5 rounded shadow-sm border border-neutral-100">{value}</span>
                        </div>
                        {/* Zero Line Marker */}
                        <div
                          className="absolute left-0 right-0 h-[2px] bg-neutral-200"
                          style={{ bottom: `${zeroPos}%` }}
                        />
                      </div>
                      <span className="mt-2 text-[9px] font-medium text-neutral-400">{shortLabel}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Total Score Evolution */}
        <section className="relative rounded-3xl bg-white p-6 shadow-sm border border-neutral-100">
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <h2 className="text-sm font-bold text-neutral-900">Score Total</h2>
          </div>

          <div className="flex h-40">
            <div className="flex w-8 flex-col justify-between text-[9px] font-semibold text-neutral-400">
              {totalStatsY.ticks.slice().reverse().map((tick) => (
                <span key={tick}>{Number.isInteger(tick) ? tick : tick.toFixed(0)}</span>
              ))}
            </div>
            <div className="relative flex-1">
              <div className="absolute inset-0 flex flex-col justify-between">
                {totalStatsY.ticks.map((_, idx) => (
                  <div key={idx} className="h-px w-full border-t border-dashed border-neutral-100" />
                ))}
              </div>
              <div
                className="relative grid h-full items-end"
                style={{
                  gridTemplateColumns: `repeat(${lastWeekDates.length}, minmax(0, 1fr))`,
                  columnGap: "8px",
                }}
              >
                {lastWeekDates.map((date, idx) => {
                  const value = totalPointsEvolution[idx];
                  const range = totalStatsY.yMax - totalStatsY.yMin || 1;
                  const zeroPos = ((0 - totalStatsY.yMin) / range) * 100;
                  const barHeight = Math.max(2, (Math.abs(value) / range) * 100);
                  const bottom = value >= 0 ? zeroPos : zeroPos - barHeight;
                  const labelDate = new Date(date);
                  const shortLabel = `${labelDate.getDate()}/${labelDate.getMonth() + 1}`;
                  return (
                    <div key={date} className="relative flex h-full flex-col items-center justify-end group">
                      <div className="relative flex h-full w-full items-end">
                        <div
                          className="absolute left-0 right-0 flex items-end justify-center rounded-t-lg bg-emerald-500 shadow-sm transition-all group-hover:bg-emerald-600"
                          style={{
                            height: `${barHeight}%`,
                            bottom: `${Math.max(0, Math.min(100, bottom))}%`,
                          }}
                        >
                           <span className="absolute -top-6 text-[10px] font-bold text-neutral-700 opacity-0 transition-opacity group-hover:opacity-100 bg-white px-1.5 py-0.5 rounded shadow-sm border border-neutral-100">{value}</span>
                        </div>
                        <div
                          className="absolute left-0 right-0 h-[2px] bg-neutral-200"
                          style={{ bottom: `${zeroPos}%` }}
                        />
                      </div>
                      <span className="mt-2 text-[9px] font-medium text-neutral-400">{shortLabel}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* --- Section RULES --- */}
      <section className="rounded-3xl bg-neutral-50 p-6 border border-neutral-100">
        <h2 className="text-sm font-bold text-neutral-900 mb-4">Règles du jeu</h2>
        <ul className="space-y-3">
          {[
            { label: "Poids rempli", val: "+1", bad: "-1" },
            { label: "Shower Done", val: "+1", bad: "-1" },
            { label: "Sommeil > 7h30", val: "+1 / +2", bad: "-1 / -2" },
            { label: "Calories vs objectif", val: "+2 (±10 %)", bad: "-1 / -2" },
            { label: "Skin Care (Hebdo)", val: "+4 / +7", bad: "-3 / -6" },
            { label: "Supplement (Hebdo)", val: "+4", bad: "-4" },
            { label: "Exercices (Hebdo)", val: "+3 / +6", bad: "-3 / -6" },
          ].map((rule, i) => (
            <li key={i} className="flex items-center justify-between text-xs rounded-xl bg-white p-3 shadow-sm border border-neutral-100">
              <span className="font-semibold text-neutral-700">{rule.label}</span>
              <div className="flex gap-2 font-mono">
                <span className="text-emerald-600 bg-emerald-50 px-1.5 rounded">{rule.val}</span>
                <span className="text-rose-600 bg-rose-50 px-1.5 rounded">{rule.bad}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Floating Action Button */}
      <Link
        href="/"
        className="fixed bottom-6 right-6 flex h-14 w-14 items-center justify-center rounded-full bg-neutral-900 text-white shadow-[0_8px_30px_rgba(0,0,0,0.3)] transition-transform hover:scale-110 active:scale-95 z-50"
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M10 19l-7-7m0 0l7-7m-7 7h18" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </Link>
    </div>
  );
}
