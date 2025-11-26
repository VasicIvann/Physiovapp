"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
  type DocumentData,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db, isFirebaseConfigured } from "@/lib/firebase";

type DailyLog = {
  weight?: number;
  skinCare?: "done" | "not done";
  shower?: "done" | "not done";
  supplement?: "done" | "not done";
  sleepTime?: string;
};

type ModalState =
  | { type: "calories" }
  | { type: "weight" }
  | { type: "skinCare" }
  | { type: "shower" }
  | { type: "supplement" }
  | { type: "sleep" }
  | null;

const todayKey = () => new Date().toISOString().slice(0, 10);

function StatusIcon({ success }: { success: boolean }) {
  return success ? (
    <svg viewBox="0 0 24 24" className="h-6 w-6 text-emerald-600" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" className="h-6 w-6 text-rose-600" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 6l12 12M6 18L18 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function InfoPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [caloriesTotal, setCaloriesTotal] = useState<number>(0);
  const [dailyLog, setDailyLog] = useState<DailyLog>({});
  const [modal, setModal] = useState<ModalState>(null);
  const [loading, setLoading] = useState(false);
  const [formCalories, setFormCalories] = useState({ food: "", calories: "" });
  const [formWeight, setFormWeight] = useState("");
  const [formSleep, setFormSleep] = useState("");
  const [error, setError] = useState<string | null>(null);

  const dateKey = useMemo(() => todayKey(), []);

  const fetchCalories = useCallback(async (uid: string) => {
    if (!db) return;
    const q = query(collection(db, "calories"), where("userId", "==", uid), where("date", "==", dateKey));
    const snaps = await getDocs(q);
    const total = snaps.docs.reduce((acc, docSnap) => {
      const data = docSnap.data() as { calories?: number };
      return acc + (Number(data.calories) || 0);
    }, 0);
    setCaloriesTotal(total);
  }, [dateKey]);

  const fetchDailyLog = useCallback(async (uid: string) => {
    if (!db) return;
    const snap = await getDoc(doc(db, "dailyLogs", `${uid}_${dateKey}`));
    const data = (snap.data() as DocumentData | undefined) ?? {};
    setDailyLog({
      weight: data.weight,
      skinCare: data.skinCare,
      shower: data.shower,
      supplement: data.supplement,
      sleepTime: data.sleepTime,
    });
    if (data.weight) setFormWeight(String(data.weight));
    if (data.sleepTime) setFormSleep(String(data.sleepTime));
  }, [dateKey]);

  useEffect(() => {
    if (!auth || !db || !isFirebaseConfigured) return;
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setUserId(null);
        setDisplayName(null);
        setDailyLog({});
        setCaloriesTotal(0);
        return;
      }
      setUserId(user.uid);
      setDisplayName(user.displayName ?? null);
      await Promise.all([fetchDailyLog(user.uid), fetchCalories(user.uid)]);
    });
    return () => unsub();
  }, [dateKey, fetchCalories, fetchDailyLog]);

  const ensureUser = () => {
    if (!auth || !db || !userId) {
      setError("Connecte-toi pour enregistrer tes donnees.");
      return false;
    }
    return true;
  };

  const saveDailyField = async (field: keyof DailyLog, value: string | number | undefined) => {
    if (!ensureUser()) return;
    if (!db || !userId) return;
    setLoading(true);
    setError(null);
    try {
      await setDoc(
        doc(db, "dailyLogs", `${userId}_${dateKey}`),
        { userId, date: dateKey, [field]: value },
        { merge: true },
      );
      await fetchDailyLog(userId);
    } catch (err) {
      console.error(err);
      setError("Echec de l'enregistrement.");
    } finally {
      setLoading(false);
    }
  };

  const handleCaloriesSubmit = async () => {
    if (!ensureUser()) return;
    if (!db || !userId) return;
    if (!formCalories.food.trim() || !formCalories.calories.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await addDoc(collection(db, "calories"), {
        userId,
        userName: displayName ?? "",
        date: dateKey,
        food: formCalories.food.trim(),
        calories: Number(formCalories.calories),
        createdAt: new Date().toISOString(),
      });
      setFormCalories({ food: "", calories: "" });
      await fetchCalories(userId);
      setModal(null);
    } catch (err) {
      console.error(err);
      setError("Echec de l'enregistrement des calories.");
    } finally {
      setLoading(false);
    }
  };

  const statusIcon = (condition: boolean) => <StatusIcon success={condition} />;

  const cards = [
    {
      key: "calories",
      title: "Calorie tracking",
      badge: caloriesTotal > 0 ? `${caloriesTotal} kcal` : null,
      ok: caloriesTotal > 0,
      onClick: () => setModal({ type: "calories" }),
    },
    {
      key: "weight",
      title: "Weight",
      badge: dailyLog.weight ? `${dailyLog.weight} kg` : null,
      ok: Boolean(dailyLog.weight),
      onClick: () => setModal({ type: "weight" }),
    },
    {
      key: "exercise",
      title: "Exercise",
      badge: null,
      ok: false,
      onClick: () => {},
    },
    {
      key: "skinCare",
      title: "Skin care",
      badge: dailyLog.skinCare === "done" ? "done" : null,
      ok: dailyLog.skinCare === "done",
      onClick: () => setModal({ type: "skinCare" }),
    },
    {
      key: "shower",
      title: "Shower",
      badge: dailyLog.shower === "done" ? "done" : null,
      ok: dailyLog.shower === "done",
      onClick: () => setModal({ type: "shower" }),
    },
    {
      key: "sleep",
      title: "Sleep time",
      badge: dailyLog.sleepTime ?? null,
      ok: Boolean(dailyLog.sleepTime),
      onClick: () => setModal({ type: "sleep" }),
    },
    {
      key: "supplement",
      title: "Supplement",
      badge: dailyLog.supplement === "done" ? "done" : null,
      ok: dailyLog.supplement === "done",
      onClick: () => setModal({ type: "supplement" }),
    },
  ];

  const renderModal = () => {
    if (!modal) return null;
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 px-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl ring-1 ring-slate-200">
          {modal.type === "calories" && (
            <>
              <h2 className="text-lg font-semibold text-slate-900">Add food</h2>
              <div className="mt-3 space-y-3">
                <label className="block text-sm font-medium text-slate-800">
                  Food name
                  <input
                    value={formCalories.food}
                    onChange={(e) => setFormCalories((prev) => ({ ...prev, food: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                  />
                </label>
                <label className="block text-sm font-medium text-slate-800">
                  Calories
                  <input
                    type="number"
                    value={formCalories.calories}
                    onChange={(e) => setFormCalories((prev) => ({ ...prev, calories: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                  />
                </label>
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={handleCaloriesSubmit}
                    disabled={loading}
                    className="flex-1 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-sky-300"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setModal(null)}
                    className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </>
          )}

          {modal.type === "weight" && (
            <>
              <h2 className="text-lg font-semibold text-slate-900">Add weight</h2>
              <div className="mt-3 space-y-3">
                <input
                  type="number"
                  value={formWeight}
                  onChange={(e) => setFormWeight(e.target.value)}
                  placeholder="Kg"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                />
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => {
                      saveDailyField("weight", Number(formWeight));
                      setModal(null);
                    }}
                    disabled={loading}
                    className="flex-1 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-sky-300"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setModal(null)}
                    className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </>
          )}

          {modal.type === "skinCare" && (
            <>
              <h2 className="text-lg font-semibold text-slate-900">Skin care</h2>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    saveDailyField("skinCare", "done");
                    setModal(null);
                  }}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
                >
                  Done
                </button>
                <button
                  onClick={() => {
                    saveDailyField("skinCare", "not done");
                    setModal(null);
                  }}
                  className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700"
                >
                  Not done
                </button>
              </div>
            </>
          )}

          {modal.type === "shower" && (
            <>
              <h2 className="text-lg font-semibold text-slate-900">Shower</h2>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    saveDailyField("shower", "done");
                    setModal(null);
                  }}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
                >
                  Done
                </button>
                <button
                  onClick={() => {
                    saveDailyField("shower", "not done");
                    setModal(null);
                  }}
                  className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700"
                >
                  Not done
                </button>
              </div>
            </>
          )}

          {modal.type === "supplement" && (
            <>
              <h2 className="text-lg font-semibold text-slate-900">Supplement</h2>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    saveDailyField("supplement", "done");
                    setModal(null);
                  }}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
                >
                  Done
                </button>
                <button
                  onClick={() => {
                    saveDailyField("supplement", "not done");
                    setModal(null);
                  }}
                  className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700"
                >
                  Not done
                </button>
              </div>
            </>
          )}

          {modal.type === "sleep" && (
            <>
              <h2 className="text-lg font-semibold text-slate-900">Sleep time</h2>
              <div className="mt-3 space-y-3">
                <input
                  type="time"
                  value={formSleep}
                  onChange={(e) => setFormSleep(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                />
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => {
                      saveDailyField("sleepTime", formSleep);
                      setModal(null);
                    }}
                    disabled={loading}
                    className="flex-1 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-sky-300"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setModal(null)}
                    className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 pb-16">
      {!isFirebaseConfigured && (
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-amber-200">
          <p className="text-sm font-semibold text-amber-700">Configure Firebase pour activer les sauvegardes.</p>
        </div>
      )}
      {error && (
        <div className="rounded-2xl bg-rose-50 p-4 text-sm font-semibold text-rose-700 ring-1 ring-rose-100">
          {error}
        </div>
      )}

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
        <h1 className="text-lg font-semibold text-slate-900">Daily info</h1>
        <p className="mt-1 text-sm text-slate-600">3 items per row. Touchez pour mettre a jour.</p>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {cards.map((card) => (
            <button
              key={card.key}
              onClick={card.onClick}
              className="flex h-24 flex-col items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-center text-sm font-semibold text-slate-800 shadow-sm transition hover:border-sky-200 hover:bg-slate-100"
            >
              <div className="flex items-center gap-2">
                {statusIcon(card.ok)}
                <span>{card.title}</span>
              </div>
              <p className="text-xs font-medium text-slate-600">{card.badge ?? "No entry"}</p>
            </button>
          ))}
        </div>
      </section>

      {renderModal()}

      <Link
        href="/"
        className="fixed bottom-6 right-6 rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-lg ring-1 ring-rose-300 transition hover:bg-rose-700"
      >
        come back
      </Link>
    </div>
  );
}
