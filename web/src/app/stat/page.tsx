"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { onAuthStateChanged } from "firebase/auth";
import { auth, isFirebaseConfigured } from "@/lib/firebase";
import {
  chartStyleOptions,
  fetchStatsChartBlob,
  fetchStatsSeries,
  formatHoursToHHMM,
  isBinaryMetric,
  metricOptions,
  type ChartStyleKey,
  timeRangeOptions,
  type MetricKey,
  type StatsSeriesResponse,
  type TimeRangeKey,
} from "@/lib/statsApi";

export default function StatPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRangeKey>("7d");
  const [metric, setMetric] = useState<MetricKey>("nutritionQualityScore");
  const [chartStyle, setChartStyle] = useState<ChartStyleKey>("auto");
  const [series, setSeries] = useState<StatsSeriesResponse | null>(null);
  const [chartUrl, setChartUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const apiBaseUrl = (process.env.NEXT_PUBLIC_STATS_API_BASE_URL ?? "").trim();

  useEffect(() => {
    if (!auth || !isFirebaseConfigured) {
      setLoading(false);
      return;
    }

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setUserId(null);
        setSeries(null);
        setError(null);
        setLoading(false);
        return;
      }

      setUserId(user.uid);
    });

    return () => unsubAuth();
  }, []);

  useEffect(() => {
    return () => {
      if (chartUrl) {
        URL.revokeObjectURL(chartUrl);
      }
    };
  }, [chartUrl]);

  useEffect(() => {
    if (!userId || !isFirebaseConfigured || !auth) {
      setSeries(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    let localObjectUrl: string | null = null;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const [seriesPayload, chartBlob] = await Promise.all([
          fetchStatsSeries(metric, timeRange),
          fetchStatsChartBlob(metric, timeRange, chartStyle),
        ]);

        if (cancelled) return;

        localObjectUrl = URL.createObjectURL(chartBlob);
        setSeries(seriesPayload);
        setChartUrl((prev) => {
          if (prev) {
            URL.revokeObjectURL(prev);
          }
          return localObjectUrl;
        });
      } catch (err) {
        if (cancelled) return;
        console.error("[stat/page] Load error:", err);
        setSeries(null);
        const errorMsg = err instanceof Error ? err.message : String(err);
        if (errorMsg.toLowerCase().includes("token firebase invalide ou expire")) {
          setError("Session expiree. Deconnecte-toi puis reconnecte-toi. Si ca continue, l API Python n utilise probablement pas le meme projet Firebase.");
        } else {
          setError(`Erreur: ${errorMsg}`);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
      if (localObjectUrl) {
        URL.revokeObjectURL(localObjectUrl);
      }
    };
  }, [userId, metric, timeRange, chartStyle]);

  const metricStats = useMemo(() => series?.stats ?? null, [series]);
  const hasData = series?.hasData ?? false;

  const lastValue = useMemo(() => {
    if (!series) return null;
    for (let idx = series.values.length - 1; idx >= 0; idx--) {
      const value = series.values[idx];
      if (typeof value === "number") {
        return value;
      }
    }
    return null;
  }, [series]);

  const formatMetricValue = (value: number) => {
    if (metric === "sleepTime") {
      return formatHoursToHHMM(value);
    }
    if (isBinaryMetric(metric)) {
      return value >= 1 ? "Fait" : "Non fait";
    }
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  };

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

  if (!apiBaseUrl) {
    return (
      <div className="rounded-3xl bg-white p-6 shadow-sm border border-neutral-100">
        <p className="text-sm font-semibold text-rose-600">Configure NEXT_PUBLIC_STATS_API_BASE_URL pour utiliser la nouvelle section Stat.</p>
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
                {timeRangeOptions.map((option) => (
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
                {metricOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
              <select
                value={chartStyle}
                onChange={(e) => setChartStyle(e.target.value as ChartStyleKey)}
                className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm font-medium text-neutral-800 shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all"
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
            <div className="flex h-64 items-center justify-center rounded-2xl bg-neutral-50">
               <p className="text-sm text-neutral-400 animate-pulse">Chargement...</p>
            </div>
          ) : (
            <div className="space-y-4">
              {error && (
                <div className="rounded-xl border border-rose-100 bg-rose-50 p-3 text-center">
                  <p className="text-xs font-semibold text-rose-700">{error}</p>
                </div>
              )}

              {!hasData && (
                <div className="rounded-xl bg-neutral-50 p-3 text-center">
                  <p className="text-xs text-neutral-500">Aucune donnée sur la période.</p>
                </div>
              )}

              <div className="overflow-hidden rounded-2xl border border-neutral-100 bg-neutral-50">
                <div className="flex items-center justify-between border-b border-neutral-100 bg-white px-4 py-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                    Graphique genere par l API Python
                  </p>
                  <div className="text-right">
                    <p className="text-xs font-semibold text-neutral-400">{series?.timeRange ?? timeRange}</p>
                    <p className="text-[10px] font-semibold text-neutral-400">
                      Style: {chartStyle === "auto" ? (series?.chart?.defaultStyle ?? "auto") : chartStyle}
                    </p>
                  </div>
                </div>
                <div className="p-3">
                  {chartUrl ? (
                    <Image
                      src={chartUrl}
                      alt="Graphique statistique"
                      width={1600}
                      height={640}
                      unoptimized
                      className="h-auto w-full rounded-xl bg-white object-contain"
                    />
                  ) : (
                    <div className="flex h-64 items-center justify-center rounded-xl bg-neutral-100">
                      <p className="text-xs font-medium text-neutral-500">Graphique indisponible.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* --- Metrics Summary --- */}
      <section className="rounded-3xl bg-neutral-50 p-6 border border-neutral-100">
        <h2 className="text-sm font-bold text-neutral-900 mb-4">Résumé {metric}</h2>

        {lastValue !== null && (
          <div className="mb-3 rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-500">Derniere valeur</p>
            <p className="mt-1 text-sm font-bold text-indigo-700">{formatMetricValue(lastValue)}</p>
          </div>
        )}

        {metricStats ? (
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col items-center justify-center rounded-2xl bg-white p-4 shadow-sm border border-neutral-100">
              <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Min</p>
              <p className="mt-1 text-lg font-bold text-neutral-900">
                {formatMetricValue(metricStats.min)}
              </p>
            </div>
            <div className="flex flex-col items-center justify-center rounded-2xl bg-white p-4 shadow-sm border border-neutral-100">
              <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Max</p>
              <p className="mt-1 text-lg font-bold text-neutral-900">
                {formatMetricValue(metricStats.max)}
              </p>
            </div>
            <div className="flex flex-col items-center justify-center rounded-2xl bg-white p-4 shadow-sm border border-neutral-100">
              <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Moy</p>
              <p className="mt-1 text-lg font-bold text-indigo-600">
                {formatMetricValue(metricStats.avg)}
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
