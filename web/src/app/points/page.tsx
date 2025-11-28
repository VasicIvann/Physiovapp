/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, getDocs, query, where, setDoc, doc } from "firebase/firestore";
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
      const snap = await getDocs(logsQ);
      const logs: DailyLogEntry[] = snap.docs
        .map((d) => d.data() as DailyLogEntry)
        .filter((d) => !!d.date)
        .sort((a, b) => a.date.localeCompare(b.date));

      const computed = computePointsFromLogs(logs);
      setSummary(computed);
      setLogs(logs);

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
      { label: "Total", value: summary.totalPoints },
      { label: "Journalier (somme)", value: summary.dailyPoints },
      { label: "Hebdo (somme)", value: summary.weeklyPoints },
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
    <div className="space-y-4 pb-16">
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
        <div className="mb-4 flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-slate-900">Rang</h2>
          {summary ? (
            <div className="flex items-center gap-3">
              <img
                src={`/rank/${summary.rank}.png`}
                alt={summary.rank}
                className="h-12 w-12 rounded-md border border-slate-200 bg-white object-contain"
              />
              <p className="text-sm font-semibold capitalize text-slate-800">{summary.rank}</p>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Rang non disponible.</p>
          )}
          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-9">
            {rankOrder.map((rank) => (
              <div
                key={rank}
                className={`flex items-center justify-center rounded-lg border ${
                  summary?.rank === rank ? "border-sky-400 shadow" : "border-slate-200"
                } bg-white p-2`}
              >
                <img src={`/rank/${rank}.png`} alt={rank} className="h-10 w-10 object-contain" />
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Points</h1>
            <p className="mt-1 text-sm text-slate-600">
              Le score est recalculé automatiquement à partir de tes logs quotidiens et hebdomadaires.
            </p>
          </div>
          {userId && (
            <button
              onClick={() => recompute(userId)}
              disabled={loading}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:opacity-50"
            >
              {loading ? "Calcul..." : "Recalculer"}
            </button>
          )}
        </div>

        {!isFirebaseConfigured && (
          <p className="mt-3 text-sm text-rose-600">Configure Firebase pour activer le calcul des points.</p>
        )}
        {!userId && isFirebaseConfigured && (
          <p className="mt-3 text-sm text-slate-600">Connecte-toi pour voir tes points.</p>
        )}
        {error && <p className="mt-3 text-sm font-semibold text-rose-600">{error}</p>}

        {summary && (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {cards.map((card) => (
              <div key={card.label} className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{card.label}</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">{card.value}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
        <h2 className="text-sm font-semibold text-slate-900">Evolution des points journalier (derniere semaine)</h2>
        <div className="mt-3 flex h-48">
          <div className="flex w-12 flex-col justify-between text-[10px] font-semibold text-slate-500">
            {statsY.ticks
              .slice()
              .reverse()
              .map((tick) => (
                <span key={tick}>{Number.isInteger(tick) ? tick : tick.toFixed(1)}</span>
              ))}
          </div>
          <div className="relative flex-1">
            <div className="absolute inset-0 flex flex-col justify-between">
              {statsY.ticks.map((_, idx) => (
                <div key={idx} className="h-px w-full bg-slate-200/70" />
              ))}
            </div>
            <div
              className="relative grid h-full items-end"
              style={{
                gridTemplateColumns: `repeat(${lastWeekDates.length}, minmax(0, 1fr))`,
                columnGap: "6px",
              }}
            >
              {lastWeekDates.map((date, idx) => {
                const value = pointsLastWeek[idx];
                const range = statsY.yMax - statsY.yMin || 1;
                const zeroPos = ((0 - statsY.yMin) / range) * 100;
                const barHeight = Math.max(2, (Math.abs(value) / range) * 100);
                const bottom = value >= 0 ? zeroPos : zeroPos - barHeight;
                const labelDate = new Date(date);
                const shortLabel = `${labelDate.getMonth() + 1}/${labelDate.getDate()}`;
                return (
                  <div key={date} className="relative flex h-full flex-col items-center justify-end gap-1 text-[9px]">
                    <div className="relative flex h-full w-full items-end">
                      <div
                        className="absolute left-0 right-0 flex items-end justify-center rounded-t-md bg-sky-500 shadow-sm transition-all"
                        style={{
                          height: `${barHeight}%`,
                          bottom: `${Math.max(0, Math.min(100, bottom))}%`,
                        }}
                      >
                        <span className="mb-1 text-[9px] font-semibold text-white">{value}</span>
                      </div>
                      <div
                        className="absolute left-0 right-0 h-[1px] bg-slate-300/70"
                        style={{ bottom: `${zeroPos}%` }}
                      />
                    </div>
                    <span className="text-[8px] text-slate-400">{shortLabel}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
        <h2 className="text-sm font-semibold text-slate-900">Evolution du score total (derniere semaine)</h2>
        <div className="mt-3 flex h-48">
          <div className="flex w-12 flex-col justify-between text-[10px] font-semibold text-slate-500">
            {totalStatsY.ticks
              .slice()
              .reverse()
              .map((tick) => (
                <span key={tick}>{Number.isInteger(tick) ? tick : tick.toFixed(1)}</span>
              ))}
          </div>
          <div className="relative flex-1">
            <div className="absolute inset-0 flex flex-col justify-between">
              {totalStatsY.ticks.map((_, idx) => (
                <div key={idx} className="h-px w-full bg-slate-200/70" />
              ))}
            </div>
            <div
              className="relative grid h-full items-end"
              style={{
                gridTemplateColumns: `repeat(${lastWeekDates.length}, minmax(0, 1fr))`,
                columnGap: "6px",
              }}
            >
              {lastWeekDates.map((date, idx) => {
                const value = totalPointsEvolution[idx];
                const range = totalStatsY.yMax - totalStatsY.yMin || 1;
                const zeroPos = ((0 - totalStatsY.yMin) / range) * 100;
                const barHeight = Math.max(2, (Math.abs(value) / range) * 100);
                const bottom = value >= 0 ? zeroPos : zeroPos - barHeight;
                const labelDate = new Date(date);
                const shortLabel = `${labelDate.getMonth() + 1}/${labelDate.getDate()}`;
                return (
                  <div key={date} className="relative flex h-full flex-col items-center justify-end gap-1 text-[9px]">
                    <div className="relative flex h-full w-full items-end">
                      <div
                        className="absolute left-0 right-0 flex items-end justify-center rounded-t-md bg-emerald-500 shadow-sm transition-all"
                        style={{
                          height: `${barHeight}%`,
                          bottom: `${Math.max(0, Math.min(100, bottom))}%`,
                        }}
                      >
                        <span className="mb-1 text-[9px] font-semibold text-white">{value}</span>
                      </div>
                      <div
                        className="absolute left-0 right-0 h-[1px] bg-slate-300/70"
                        style={{ bottom: `${zeroPos}%` }}
                      />
                    </div>
                    <span className="text-[8px] text-slate-400">{shortLabel}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
        <h2 className="text-sm font-semibold text-slate-900">Règles (résumé)</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
          <li>Poids rempli : +1, sinon -1 (chaque jour)</li>
          <li>Shower = Done : +1, sinon -1 (chaque jour)</li>
          <li>Sommeil &gt;= 8h30 : +2, &gt;= 7h30 : +1, &lt; 7h : -1, &lt; 6h : -2</li>
          <li>Skin care (hebdo) : 7x = +7, 4-6x = +4, 0x = -6, 1-2x = -3</li>
          <li>Supplement (hebdo) : 5x+ = +4, 0-2x = -4</li>
          <li>Exercices (hebdo) : 6+ = +6, 4-5 = +3, 0-1 = -6, 2-3 = -3</li>
        </ul>
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
