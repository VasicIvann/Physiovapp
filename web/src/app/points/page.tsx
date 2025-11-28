"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, getDocs, query, where, setDoc, doc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db, isFirebaseConfigured } from "@/lib/firebase";
import { computePointsFromLogs, type DailyLogEntry, type PointsSummary } from "@/lib/pointsRules";

export default function PointsPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [summary, setSummary] = useState<PointsSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="space-y-4 pb-16">
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
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
