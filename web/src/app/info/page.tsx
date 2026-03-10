"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  setDoc,
  type DocumentData,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db, isFirebaseConfigured } from "@/lib/firebase";

type DailyLog = {
  weight?: number;
  skinCare?: "done" | "not done";
  shower?: "done" | "not done";
  supplement?: "done" | "not done";
  anki?: "done" | "not done";
  sleepTime?: string;
  exercises?: string[];
  nutritionCalorieScore?: number;
  nutritionProteinScore?: number;
  nutritionQualityScore?: number;
};

type ModalState =
  | { type: "calories" }
  | { type: "weight" }
  | { type: "history" }
  | { type: "skinCare" }
  | { type: "shower" }
  | { type: "supplement" }
  | { type: "anki" }
  | { type: "sleep" }
  | { type: "exercise" }
  | null;

const todayKey = () => new Date().toISOString().slice(0, 10);

function StatusIcon({ success }: { success: boolean }) {
  return success ? (
    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3">
        <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  ) : (
    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-100 text-neutral-300">
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3">
        <path d="M12 4v16m-8-8h16" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export default function InfoPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [dailyLog, setDailyLog] = useState<DailyLog>({});
  const [modal, setModal] = useState<ModalState>(null);
  const [loading, setLoading] = useState(false);
  const [formNutritionCalorie, setFormNutritionCalorie] = useState<number>(5);
  const [formNutritionProtein, setFormNutritionProtein] = useState<number>(5);
  const [formNutritionQuality, setFormNutritionQuality] = useState<number>(5);
  const [formWeight, setFormWeight] = useState("");
  const [formSleep, setFormSleep] = useState("");
  const [formExercise, setFormExercise] = useState("");
  const [exerciseInputMode, setExerciseInputMode] = useState<"none" | "manual">("none");
  const [sportDuration, setSportDuration] = useState("");
  const [sportIntensity, setSportIntensity] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [dateKey, setDateKey] = useState(() => todayKey());

  const fetchDailyLog = useCallback(async (uid: string) => {
    if (!db) return;
    const snap = await getDoc(doc(db!, "dailyLogs", `${uid}_${dateKey}`));
    const data = (snap.data() as DocumentData | undefined) ?? {};
    setDailyLog({
      weight: data.weight,
      skinCare: data.skinCare,
      shower: data.shower,
      supplement: data.supplement,
      anki: data.anki,
      sleepTime: data.sleepTime,
      exercises: Array.isArray(data.exercises) ? data.exercises : [],
      nutritionCalorieScore: typeof data.nutritionCalorieScore === "number" ? data.nutritionCalorieScore : undefined,
      nutritionProteinScore: typeof data.nutritionProteinScore === "number" ? data.nutritionProteinScore : undefined,
      nutritionQualityScore: typeof data.nutritionQualityScore === "number" ? data.nutritionQualityScore : undefined,
    });
    if (data.weight) setFormWeight(String(data.weight));
    if (data.sleepTime) setFormSleep(String(data.sleepTime));
    if (typeof data.nutritionCalorieScore === "number") setFormNutritionCalorie(data.nutritionCalorieScore);
    if (typeof data.nutritionProteinScore === "number") setFormNutritionProtein(data.nutritionProteinScore);
    if (typeof data.nutritionQualityScore === "number") setFormNutritionQuality(data.nutritionQualityScore);
    if (Array.isArray(data.exercises) && data.exercises.length > 0) setFormExercise("");
  }, [dateKey]);

  useEffect(() => {
    if (!auth || !db || !isFirebaseConfigured) return;
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setUserId(null);
        setDailyLog({});
        return;
      }
      setUserId(user.uid);
      await fetchDailyLog(user.uid);
    });
    return () => unsub();
  }, [dateKey, fetchDailyLog]);

  const ensureUser = () => {
    if (!auth || !db || !userId) {
      setError("Connecte-toi pour enregistrer tes donnees.");
      return false;
    }
    return true;
  };

  const saveExercises = async (exercises: string[]) => {
    if (!ensureUser()) return;
    if (!db || !userId) return;
    setLoading(true);
    setError(null);
    try {
      await setDoc(
        doc(db!, "dailyLogs", `${userId}_${dateKey}`),
        { userId, date: dateKey, exercises },
        { merge: true },
      );
      setDailyLog((prev) => ({ ...prev, exercises }));
    } catch (err) {
      console.error(err);
      setError("Echec de l'enregistrement des exercices.");
    } finally {
      setLoading(false);
    }
  };

  const saveDailyField = async (field: keyof DailyLog, value: string | number | undefined) => {
    if (!ensureUser()) return;
    if (!db || !userId) return;
    setLoading(true);
    setError(null);
    try {
      await setDoc(
        doc(db!, "dailyLogs", `${userId}_${dateKey}`),
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

  const handleNutritionSubmit = async () => {
    if (!ensureUser()) return;
    if (!db || !userId) return;
    setLoading(true);
    setError(null);
    try {
      await setDoc(
        doc(db!, "dailyLogs", `${userId}_${dateKey}`),
        {
          userId,
          date: dateKey,
          nutritionCalorieScore: formNutritionCalorie,
          nutritionProteinScore: formNutritionProtein,
          nutritionQualityScore: formNutritionQuality,
        },
        { merge: true },
      );
      await fetchDailyLog(userId);
      setModal(null);
    } catch (err) {
      console.error(err);
      setError("Echec de l'enregistrement de la nutrition.");
    } finally {
      setLoading(false);
    }
  };

  const statusIcon = (condition: boolean) => <StatusIcon success={condition} />;

  const nutritionDone =
    typeof dailyLog.nutritionCalorieScore === "number" &&
    typeof dailyLog.nutritionProteinScore === "number" &&
    typeof dailyLog.nutritionQualityScore === "number";

  const nutritionBadge = nutritionDone
    ? `Moy. ${(((dailyLog.nutritionCalorieScore ?? 0) + (dailyLog.nutritionProteinScore ?? 0) + (dailyLog.nutritionQualityScore ?? 0)) / 3).toFixed(1)}/10`
    : "Empty";

  const cards = [
    {
      key: "calories",
      title: "Nutrition",
      badge: nutritionBadge,
      ok: nutritionDone,
      icon: (
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-amber-500" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M19 10a7 7 0 1 1-14 0" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
      onClick: () => setModal({ type: "calories" }),
    },
    {
      key: "weight",
      title: "Poids",
      badge: dailyLog.weight ? `${dailyLog.weight} kg` : "Empty",
      ok: Boolean(dailyLog.weight),
      icon: (
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-sky-500" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 3a9 9 0 0 0 0 18 9 9 0 0 0 0-18Z" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M12 8v4l2 2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
      onClick: () => setModal({ type: "weight" }),
    },
    {
      key: "exercise",
      title: "Sport",
      badge: dailyLog.exercises && dailyLog.exercises.length > 0 ? `${dailyLog.exercises.length} act.` : "Repos",
      ok: Boolean(dailyLog.exercises && dailyLog.exercises.length > 0),
      icon: (
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-rose-500" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 20V10" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M12 20V4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M6 20v-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
      onClick: () => setModal({ type: "exercise" }),
    },
    {
      key: "skinCare",
      title: "Skin care",
      badge: dailyLog.skinCare === "done" ? "Fait" : "À faire",
      ok: dailyLog.skinCare === "done",
      icon: (
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-indigo-500" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
      onClick: () => setModal({ type: "skinCare" }),
    },
    {
      key: "shower",
      title: "Douche",
      badge: dailyLog.shower === "done" ? "Fait" : "À faire",
      ok: dailyLog.shower === "done",
      icon: (
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-cyan-500" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2a4 4 0 0 1 4 4v2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M8 8v1a4 4 0 0 0 8 0V8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M12 22V14" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
      onClick: () => setModal({ type: "shower" }),
    },
    {
      key: "sleep",
      title: "Sommeil",
      badge: dailyLog.sleepTime ?? "--:--",
      ok: Boolean(dailyLog.sleepTime),
      icon: (
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-violet-500" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
      onClick: () => setModal({ type: "sleep" }),
    },
    {
      key: "supplement",
      title: "Suppléments",
      badge: dailyLog.supplement === "done" ? "Pris" : "À prendre",
      ok: dailyLog.supplement === "done",
      icon: (
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-emerald-500" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M10 2h4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M12 2v4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M7 6h10v12a4 4 0 0 1-4 4h-2a4 4 0 0 1-4-4V6Z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
      onClick: () => setModal({ type: "supplement" }),
    },
    {
      key: "anki",
      title: "Anki",
      badge: dailyLog.anki === "done" ? "Fait" : "À faire",
      ok: dailyLog.anki === "done",
      icon: (
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-blue-500" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
      onClick: () => setModal({ type: "anki" }),
    },
  ];

  const renderModal = () => {
    if (!modal) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-black/5 animate-in zoom-in-95 duration-200">
          {modal.type === "history" && (
            <>
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-600">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M12 8v4l3 3" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M5 5a9 9 0 1 1 3 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Gerer l historique</h2>
                  <p className="text-xs text-slate-500">Choisis une date pour afficher et modifier les entrees.</p>
                </div>
              </div>
              <div className="mt-3 space-y-3">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                  Date
                  <input
                    type="date"
                    value={dateKey}
                    onChange={(e) => setDateKey(e.target.value || todayKey())}
                    className="mt-1 w-full rounded-2xl border-0 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-900 shadow-inner ring-1 ring-slate-200 transition focus:bg-white focus:ring-2 focus:ring-slate-500 outline-none"
                  />
                </label>
                <p className="text-[11px] text-slate-500">
                  Les cartes du journal afficheront maintenant les donnees pour cette date. Tu peux ensuite modifier les valeurs normalement.
                </p>
                <div className="flex gap-2 pt-4">
                  <button
                    onClick={() => setModal(null)}
                    className="flex-1 rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-200 active:scale-95"
                  >
                    Fermer
                  </button>
                  <button
                    onClick={() => setModal(null)}
                    className="flex-1 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-lg transition hover:bg-slate-800 active:scale-95"
                  >
                    Appliquer
                  </button>
                </div>
              </div>
            </>
          )}

          {modal.type === "calories" && (
            <>
              <div className="flex items-center gap-3 mb-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" strokeLinecap="round" strokeLinejoin="round" /><path d="M19 10a7 7 0 1 1-14 0" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Nutrition</h2>
                  <p className="text-xs text-slate-500">Auto-évaluation du jour</p>
                </div>
              </div>

              <div className="space-y-5">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-semibold text-slate-700">Bon nombre de calories</span>
                    <span className="text-sm font-bold text-amber-600">{formNutritionCalorie}/10</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={formNutritionCalorie}
                    onChange={(e) => setFormNutritionCalorie(Number(e.target.value))}
                    className="w-full accent-amber-500"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
                    <span>1</span><span>10</span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-semibold text-slate-700">Assez de protéines</span>
                    <span className="text-sm font-bold text-amber-600">{formNutritionProtein}/10</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={formNutritionProtein}
                    onChange={(e) => setFormNutritionProtein(Number(e.target.value))}
                    className="w-full accent-amber-500"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
                    <span>1</span><span>10</span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-semibold text-slate-700">Qualité de la nourriture</span>
                    <span className="text-sm font-bold text-amber-600">{formNutritionQuality}/10</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={formNutritionQuality}
                    onChange={(e) => setFormNutritionQuality(Number(e.target.value))}
                    className="w-full accent-amber-500"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
                    <span>1</span><span>10</span>
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => setModal(null)}
                    className="flex-1 rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-200 active:scale-95"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleNutritionSubmit}
                    disabled={loading}
                    className="flex-1 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-lg transition hover:bg-slate-800 active:scale-95 disabled:opacity-50"
                  >
                    Enregistrer
                  </button>
                </div>
              </div>
            </>
          )}

          {modal.type === "weight" && (
            <>
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-100 text-sky-600">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 3a9 9 0 0 0 0 18 9 9 0 0 0 0-18Z" strokeLinecap="round" strokeLinejoin="round" /><path d="M12 8v4l2 2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Saisie Poids</h2>
                  <p className="text-xs text-slate-500">Pesée du matin</p>
                </div>
              </div>
              <div className="mt-3 space-y-3">
                <input
                  type="number"
                  value={formWeight}
                  onChange={(e) => setFormWeight(e.target.value)}
                  placeholder="Ex: 75.5"
                  className="w-full rounded-2xl border-0 bg-slate-50 px-4 py-4 text-center text-2xl font-bold text-slate-900 shadow-inner ring-1 ring-slate-200 focus:bg-white focus:ring-2 focus:ring-sky-500 outline-none placeholder:text-slate-300"
                />
                <div className="flex gap-2 pt-4">
                  <button
                    onClick={() => setModal(null)}
                    className="flex-1 rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-200 active:scale-95"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={() => {
                      saveDailyField("weight", Number(formWeight));
                      setModal(null);
                    }}
                    disabled={loading}
                    className="flex-1 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-lg transition hover:bg-slate-800 active:scale-95 disabled:opacity-50"
                  >
                    Enregistrer
                  </button>
                </div>
              </div>
            </>
          )}

          {modal.type === "skinCare" && (
            <>
              <div className="text-center mb-6">
                <h2 className="text-lg font-bold text-slate-900">Skin Care Routine</h2>
                <p className="text-xs text-slate-500">Prends soin de toi</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => {
                    saveDailyField("skinCare", "not done");
                    setModal(null);
                  }}
                  className="rounded-2xl bg-rose-50 border border-rose-100 px-4 py-6 text-sm font-bold text-rose-600 transition hover:bg-rose-100 active:scale-95"
                >
                  Non fait ❌
                </button>
                <button
                  onClick={() => {
                    saveDailyField("skinCare", "done");
                    setModal(null);
                  }}
                  className="rounded-2xl bg-emerald-50 border border-emerald-100 px-4 py-6 text-sm font-bold text-emerald-600 transition hover:bg-emerald-100 active:scale-95"
                >
                  Fait ✅
                </button>
              </div>
            </>
          )}

          {modal.type === "shower" && (
            <>
              <div className="text-center mb-6">
                <h2 className="text-lg font-bold text-slate-900">Douche Froide/Chaude</h2>
                <p className="text-xs text-slate-500">Routine quotidienne</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => {
                    saveDailyField("shower", "not done");
                    setModal(null);
                  }}
                  className="rounded-2xl bg-rose-50 border border-rose-100 px-4 py-6 text-sm font-bold text-rose-600 transition hover:bg-rose-100 active:scale-95"
                >
                  Non fait ❌
                </button>
                <button
                  onClick={() => {
                    saveDailyField("shower", "done");
                    setModal(null);
                  }}
                  className="rounded-2xl bg-emerald-50 border border-emerald-100 px-4 py-6 text-sm font-bold text-emerald-600 transition hover:bg-emerald-100 active:scale-95"
                >
                  Fait ✅
                </button>
              </div>
            </>
          )}

          {modal.type === "supplement" && (
            <>
              <div className="text-center mb-6">
                <h2 className="text-lg font-bold text-slate-900">Suppléments</h2>
                <p className="text-xs text-slate-500">Vitamines & Minéraux</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => {
                    saveDailyField("supplement", "not done");
                    setModal(null);
                  }}
                  className="rounded-2xl bg-rose-50 border border-rose-100 px-4 py-6 text-sm font-bold text-rose-600 transition hover:bg-rose-100 active:scale-95"
                >
                  Oublié ❌
                </button>
                <button
                  onClick={() => {
                    saveDailyField("supplement", "done");
                    setModal(null);
                  }}
                  className="rounded-2xl bg-emerald-50 border border-emerald-100 px-4 py-6 text-sm font-bold text-emerald-600 transition hover:bg-emerald-100 active:scale-95"
                >
                  Pris ✅
                </button>
              </div>
            </>
          )}

          {modal.type === "anki" && (
            <>
              <div className="text-center mb-6">
                <h2 className="text-lg font-bold text-slate-900">Anki</h2>
                <p className="text-xs text-slate-500">Révisions flashcards</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => {
                    saveDailyField("anki", "not done");
                    setModal(null);
                  }}
                  className="rounded-2xl bg-rose-50 border border-rose-100 px-4 py-6 text-sm font-bold text-rose-600 transition hover:bg-rose-100 active:scale-95"
                >
                  Non fait ❌
                </button>
                <button
                  onClick={() => {
                    saveDailyField("anki", "done");
                    setModal(null);
                  }}
                  className="rounded-2xl bg-emerald-50 border border-emerald-100 px-4 py-6 text-sm font-bold text-emerald-600 transition hover:bg-emerald-100 active:scale-95"
                >
                  Fait ✅
                </button>
              </div>
            </>
          )}

          {modal.type === "exercise" && (
            <>
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 20V10" strokeLinecap="round" strokeLinejoin="round" /><path d="M12 20V4" strokeLinecap="round" strokeLinejoin="round" /><path d="M6 20v-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Activité Sportive</h2>
                  <p className="text-xs text-slate-500">Bouger c est vivre</p>
                </div>
              </div>
              <div className="mt-3 space-y-3">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                  Type d activité
                  <div className="relative mt-1">
                    <select
                      value={formExercise}
                      onChange={(e) => setFormExercise(e.target.value)}
                      className="w-full appearance-none rounded-2xl border-0 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-900 shadow-inner ring-1 ring-slate-200 transition focus:bg-white focus:ring-2 focus:ring-rose-500 outline-none"
                    >
                      <option value="">Choisir...</option>
                      <option value="none">Rien (Repos)</option>
                      <option value="gym">Musculation / Gym</option>
                      <option value="run">Course à pied</option>
                      <option value="hike">Randonnée</option>
                      <option value="swim">Natation</option>
                      <option value="bike">Vélo</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </div>
                  </div>
                </label>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setExerciseInputMode("manual")}
                    disabled={!formExercise || formExercise === "none"}
                    className="flex-1 rounded-xl bg-rose-50 border border-rose-100 px-4 py-3 text-xs font-bold text-rose-600 transition hover:bg-rose-100 active:scale-95 disabled:opacity-50"
                  >
                    Remplir manuellement
                  </button>
                  <button
                    type="button"
                    disabled
                    className="flex-1 rounded-xl bg-slate-50 border border-dashed border-slate-200 px-4 py-3 text-xs font-bold text-slate-400"
                  >
                    Importer GPX (bientot)
                  </button>
                </div>

                {exerciseInputMode === "manual" && (
                  <div className="space-y-3 pt-2 rounded-2xl border border-rose-100 bg-rose-50/40 px-4 py-3">
                    <div className="grid grid-cols-2 gap-3">
                      <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Durée (minutes)
                        <input
                          type="number"
                          min={1}
                          max={600}
                          value={sportDuration}
                          onChange={(e) => setSportDuration(e.target.value)}
                          className="mt-1 w-full rounded-xl border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-inner ring-1 ring-slate-200 focus:ring-2 focus:ring-rose-500 outline-none"
                        />
                      </label>
                      <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Intensité (1 / 10)
                        <input
                          type="number"
                          min={1}
                          max={10}
                          value={sportIntensity}
                          onChange={(e) => setSportIntensity(e.target.value)}
                          className="mt-1 w-full rounded-xl border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-inner ring-1 ring-slate-200 focus:ring-2 focus:ring-rose-500 outline-none"
                        />
                      </label>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setExerciseInputMode("none");
                          setSportDuration("");
                          setSportIntensity("");
                        }}
                        className="flex-1 rounded-xl bg-slate-100 px-4 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-200 active:scale-95"
                      >
                        Annuler les détails
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!ensureUser() || !db || !userId) return;
                          if (!formExercise || formExercise === "none") return;
                          const durationValue = Number(sportDuration);
                          const intensityValue = Number(sportIntensity);
                          if (!durationValue || !intensityValue) return;
                          try {
                            setLoading(true);
                            setError(null);
                            await addDoc(collection(db!, "sport"), {
                              user_id: userId,
                              day: dateKey,
                              sport_type: formExercise,
                              duration: durationValue,
                              intensity: intensityValue,
                              createdAt: new Date().toISOString(),
                            });
                            const nextExercises = Array.from(
                              new Set([...(dailyLog.exercises ?? []), formExercise]),
                            );
                            await saveExercises(nextExercises);
                            setSportDuration("");
                            setSportIntensity("");
                            setExerciseInputMode("none");
                            setModal(null);
                          } catch (err) {
                            console.error(err);
                            setError("Echec de l'enregistrement du sport.");
                          } finally {
                            setLoading(false);
                          }
                        }}
                        disabled={
                          loading ||
                          !formExercise ||
                          formExercise === "none" ||
                          !sportDuration ||
                          !sportIntensity
                        }
                        className="flex-1 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-lg transition hover:bg-rose-500 active:scale-95 disabled:opacity-50"
                      >
                        Enregistrer le sport
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pt-4">
                  <button
                    onClick={() => setModal(null)}
                    className="flex-1 rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-200 active:scale-95"
                  >
                    Fermer
                  </button>
                  <button
                    onClick={async () => {
                      if (!formExercise) return;
                      if (formExercise === "none") {
                        await saveExercises([]);
                        setFormExercise("");
                        return;
                      }
                      const next = Array.from(new Set([...(dailyLog.exercises ?? []), formExercise]));
                      await saveExercises(next);
                      setFormExercise("");
                    }}
                    disabled={loading || !formExercise}
                    className="flex-1 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-lg transition hover:bg-slate-800 active:scale-95 disabled:opacity-50"
                  >
                    Ajouter
                  </button>
                </div>

                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 mt-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Activités du jour</p>
                  <div className="flex flex-wrap gap-2">
                    {(dailyLog.exercises ?? []).length === 0 && (
                      <span className="text-sm italic text-slate-400">Aucune activite pour le moment.</span>
                    )}
                    {(dailyLog.exercises ?? []).map((ex) => (
                      <span
                        key={ex}
                        className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-1.5 text-xs font-bold text-slate-800 shadow-sm border border-slate-200"
                      >
                        {ex}
                        <button
                          type="button"
                          className="flex h-4 w-4 items-center justify-center rounded-full bg-slate-100 text-slate-400 hover:bg-rose-100 hover:text-rose-600 transition-colors"
                          onClick={async () => {
                            const next = (dailyLog.exercises ?? []).filter((item) => item !== ex);
                            await saveExercises(next);
                          }}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {modal.type === "sleep" && (
            <>
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-100 text-violet-600">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Temps de Sommeil</h2>
                  <p className="text-xs text-slate-500">Heures dormies cette nuit</p>
                </div>
              </div>
              <div className="mt-3 space-y-3">
                <input
                  type="time"
                  value={formSleep}
                  onChange={(e) => setFormSleep(e.target.value)}
                  className="w-full rounded-2xl border-0 bg-slate-50 px-4 py-4 text-center text-xl font-bold text-slate-900 shadow-inner ring-1 ring-slate-200 focus:bg-white focus:ring-2 focus:ring-violet-500 outline-none"
                />
                <div className="flex gap-2 pt-4">
                  <button
                    onClick={() => setModal(null)}
                    className="flex-1 rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-200 active:scale-95"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={() => {
                      saveDailyField("sleepTime", formSleep);
                      setModal(null);
                    }}
                    disabled={loading}
                    className="flex-1 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-lg transition hover:bg-slate-800 active:scale-95 disabled:opacity-50"
                  >
                    Enregistrer
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
    <div className="space-y-6 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
      
      {/* --- En-tête --- */}
      <div className="px-1 flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Journal Quotidien</h1>
        <p className="text-neutral-500 text-sm">Complete tes routines pour aujourd hui.</p>
      </div>

      <button
        type="button"
        onClick={() => setModal({ type: "history" })}
        className="mx-1 flex items-center justify-between rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-xs font-semibold text-neutral-700 shadow-sm transition hover:bg-neutral-50 active:scale-95"
      >
        <span>Gerer historique</span>
        <span className="inline-flex items-center gap-1 text-[11px] text-neutral-400">
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path
              d="M12 8v4l3 3M5 5a9 9 0 1 1 3 7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {dateKey}
        </span>
      </button>

      {!isFirebaseConfigured && (
        <div className="rounded-2xl bg-amber-50 p-4 shadow-sm border border-amber-100">
          <p className="text-sm font-bold text-amber-700">⚠️ Configure Firebase pour activer les sauvegardes.</p>
        </div>
      )}
      {error && (
        <div className="rounded-2xl bg-rose-50 p-4 text-sm font-bold text-rose-700 border border-rose-100">
          {error}
        </div>
      )}

      {/* --- Grille Bento --- */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {cards.map((card) => (
          <button
            key={card.key}
            onClick={card.onClick}
            className="group relative flex h-28 flex-col items-center justify-center gap-3 rounded-3xl border border-neutral-100 bg-white p-4 text-center shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 active:scale-95"
          >
            {/* Status indicator absolute positioned */}
            <div className="absolute top-3 right-3">
              {statusIcon(card.ok)}
            </div>

            {/* Icon centered (visually nicer) */}
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-neutral-50 transition-colors group-hover:bg-neutral-100">
              {card.icon || (
                <svg viewBox="0 0 24 24" className="h-5 w-5 text-neutral-400" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/></svg>
              )}
            </div>
            
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-sm font-bold text-neutral-900">{card.title}</span>
              <span className={`text-[10px] font-semibold uppercase tracking-wide ${card.ok ? "text-emerald-600" : "text-neutral-400"}`}>
                {card.badge}
              </span>
            </div>
          </button>
        ))}
      </section>

      {renderModal()}

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
