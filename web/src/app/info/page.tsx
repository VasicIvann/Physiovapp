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
  exercises?: string[];
  foodHealthScore?: number;
};

type ModalState =
  | { type: "calories" }
  | { type: "weight" }
  | { type: "foodScore" }
  | { type: "skinCare" }
  | { type: "shower" }
  | { type: "supplement" }
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
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [caloriesTotal, setCaloriesTotal] = useState<number>(0);
  const [proteinsTotal, setProteinsTotal] = useState<number>(0);
  const [carbsTotal, setCarbsTotal] = useState<number>(0);
  const [fatTotal, setFatTotal] = useState<number>(0);
  const [dailyLog, setDailyLog] = useState<DailyLog>({});
  const [nutritionGoals, setNutritionGoals] = useState<{
    calorieGoal?: number;
    proteinGoal?: number;
    carbGoal?: number;
    fatGoal?: number;
  } | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [loading, setLoading] = useState(false);
  const [formCalories, setFormCalories] = useState({ food: "", calories: "", proteins: "", carbs: "", fat: "" });
  const [formWeight, setFormWeight] = useState("");
  const [formFoodScore, setFormFoodScore] = useState("");
  const [formSleep, setFormSleep] = useState("");
  const [formExercise, setFormExercise] = useState("");
  const [exerciseInputMode, setExerciseInputMode] = useState<"none" | "manual">("none");
  const [sportDuration, setSportDuration] = useState("");
  const [sportIntensity, setSportIntensity] = useState("");
  const [error, setError] = useState<string | null>(null);

  const dateKey = useMemo(() => todayKey(), []);

  const fetchCalories = useCallback(async (uid: string) => {
    if (!db) return;
    const q = query(collection(db!, "calories"), where("userId", "==", uid), where("date", "==", dateKey));
    const snaps = await getDocs(q);
    let calories = 0;
    let proteins = 0;
    let carbs = 0;
    let fat = 0;
    snaps.docs.forEach((docSnap) => {
      const data = docSnap.data() as { calories?: number; proteins?: number; carbs?: number; fat?: number };
      calories += Number(data.calories) || 0;
      proteins += Number(data.proteins) || 0;
      carbs += Number(data.carbs) || 0;
      fat += Number(data.fat) || 0;
    });
    setCaloriesTotal(calories);
    setProteinsTotal(proteins);
    setCarbsTotal(carbs);
    setFatTotal(fat);
  }, [dateKey]);

  const fetchDailyLog = useCallback(async (uid: string) => {
    if (!db) return;
    const snap = await getDoc(doc(db!, "dailyLogs", `${uid}_${dateKey}`));
    const data = (snap.data() as DocumentData | undefined) ?? {};
    setDailyLog({
      weight: data.weight,
      skinCare: data.skinCare,
      shower: data.shower,
      supplement: data.supplement,
      sleepTime: data.sleepTime,
      exercises: Array.isArray(data.exercises) ? data.exercises : [],
      foodHealthScore: typeof data.foodHealthScore === "number" ? data.foodHealthScore : undefined,
    });
    if (data.weight) setFormWeight(String(data.weight));
    if (data.sleepTime) setFormSleep(String(data.sleepTime));
    if (typeof data.foodHealthScore === "number") setFormFoodScore(String(data.foodHealthScore));
    if (Array.isArray(data.exercises) && data.exercises.length > 0) setFormExercise("");
  }, [dateKey]);

  const fetchNutritionGoals = useCallback(async (uid: string) => {
    if (!db) return;
    try {
      const snap = await getDoc(doc(db!, "users", uid));
      const data = (snap.data() as DocumentData | undefined) ?? {};
      setNutritionGoals({
        calorieGoal: typeof data.calorieGoal === "number" ? data.calorieGoal : undefined,
        proteinGoal: typeof data.proteinGoal === "number" ? data.proteinGoal : undefined,
        carbGoal: typeof data.carbGoal === "number" ? data.carbGoal : undefined,
        fatGoal: typeof data.fatGoal === "number" ? data.fatGoal : undefined,
      });
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    if (!auth || !db || !isFirebaseConfigured) return;
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setUserId(null);
        setDisplayName(null);
        setDailyLog({});
        setCaloriesTotal(0);
        setNutritionGoals(null);
        return;
      }
      setUserId(user.uid);
      setDisplayName(user.displayName ?? null);
      await Promise.all([fetchDailyLog(user.uid), fetchCalories(user.uid), fetchNutritionGoals(user.uid)]);
    });
    return () => unsub();
  }, [dateKey, fetchCalories, fetchDailyLog, fetchNutritionGoals]);

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

  const handleCaloriesSubmit = async () => {
    if (!ensureUser()) return;
    if (!db || !userId) return;
    if (!formCalories.food.trim() || !formCalories.calories.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await addDoc(collection(db!, "calories"), {
        userId,
        userName: displayName ?? "",
        date: dateKey,
        food: formCalories.food.trim(),
        calories: Number(formCalories.calories),
        proteins: Number(formCalories.proteins) || 0,
        carbs: Number(formCalories.carbs) || 0,
        fat: Number(formCalories.fat) || 0,
        createdAt: new Date().toISOString(),
      });
      setFormCalories({ food: "", calories: "", proteins: "", carbs: "", fat: "" });
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

  const calorieGoal = nutritionGoals?.calorieGoal;

  const cards = [
    {
      key: "calories",
      title: "Nutrition",
      badge:
        caloriesTotal > 0
          ? calorieGoal
            ? `${caloriesTotal}/${calorieGoal} kcal`
            : `${caloriesTotal} kcal`
          : calorieGoal
            ? `Objectif ${calorieGoal} kcal`
            : "Empty",
      ok: calorieGoal ? caloriesTotal >= calorieGoal : caloriesTotal > 0,
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
      key: "foodScore",
      title: "Food health score",
      badge: typeof dailyLog.foodHealthScore === "number" ? `${dailyLog.foodHealthScore}/10` : "Empty",
      ok: typeof dailyLog.foodHealthScore === "number",
      icon: (
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-lime-500" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2a7 7 0 0 0-7 7v1a7 7 0 0 0 14 0V9a7 7 0 0 0-7-7Z" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M9 11l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
      onClick: () => setModal({ type: "foodScore" }),
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
  ];

  const renderModal = () => {
    if (!modal) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-black/5 animate-in zoom-in-95 duration-200">
          {modal.type === "calories" && (
            <>
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" strokeLinecap="round" strokeLinejoin="round" /><path d="M19 10a7 7 0 1 1-14 0" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Ajouter Nutrition</h2>
                  <p className="text-xs text-slate-500">Repas ou collation</p>
                </div>
              </div>
              
              <div className="space-y-3">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                  Aliment
                  <input
                    value={formCalories.food}
                    onChange={(e) => setFormCalories((prev) => ({ ...prev, food: e.target.value }))}
                    placeholder="Ex: Banane, Poulet..."
                    className="mt-1 w-full rounded-2xl border-0 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-900 shadow-inner ring-1 ring-slate-200 transition focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </label>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                  Calories (kcal)
                  <input
                    type="number"
                    value={formCalories.calories}
                    onChange={(e) => setFormCalories((prev) => ({ ...prev, calories: e.target.value }))}
                    className="mt-1 w-full rounded-2xl border-0 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-900 shadow-inner ring-1 ring-slate-200 transition focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </label>

                <div className="grid grid-cols-3 gap-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                    Prot.
                    <input
                      type="number"
                      placeholder="0g"
                      value={formCalories.proteins}
                      onChange={(e) => setFormCalories((prev) => ({ ...prev, proteins: e.target.value }))}
                      className="mt-1 w-full rounded-2xl border-0 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-900 shadow-inner ring-1 ring-slate-200 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </label>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                    Carbs
                    <input
                      type="number"
                      placeholder="0g"
                      value={formCalories.carbs}
                      onChange={(e) => setFormCalories((prev) => ({ ...prev, carbs: e.target.value }))}
                      className="mt-1 w-full rounded-2xl border-0 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-900 shadow-inner ring-1 ring-slate-200 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </label>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                    Fat
                    <input
                      type="number"
                      placeholder="0g"
                      value={formCalories.fat}
                      onChange={(e) => setFormCalories((prev) => ({ ...prev, fat: e.target.value }))}
                      className="mt-1 w-full rounded-2xl border-0 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-900 shadow-inner ring-1 ring-slate-200 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </label>
                </div>

                {nutritionGoals && (
                  <div className="mt-2 rounded-2xl border border-amber-100 bg-amber-50/60 px-3 py-2 text-[11px] text-slate-700">
                    <p className="mb-1 font-semibold uppercase tracking-wide text-amber-700">Objectifs du jour</p>
                    <div className="grid grid-cols-2 gap-1">
                      <p>
                        Calories:{" "}
                        <span className="font-semibold">
                          {caloriesTotal} / {nutritionGoals.calorieGoal ?? "?"} kcal
                        </span>
                      </p>
                      <p>
                        Proteines:{" "}
                        <span className="font-semibold">
                          {proteinsTotal} / {nutritionGoals.proteinGoal ?? "?"} g
                        </span>
                      </p>
                      <p>
                        Glucides:{" "}
                        <span className="font-semibold">
                          {carbsTotal} / {nutritionGoals.carbGoal ?? "?"} g
                        </span>
                      </p>
                      <p>
                        Lipides:{" "}
                        <span className="font-semibold">
                          {fatTotal} / {nutritionGoals.fatGoal ?? "?"} g
                        </span>
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pt-4">
                  <button
                    onClick={() => setModal(null)}
                    className="flex-1 rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-200 active:scale-95"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleCaloriesSubmit}
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

          {modal.type === "foodScore" && (
            <>
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-lime-100 text-lime-600">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M12 3a9 9 0 1 0 9 9" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M9 11l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Food health score</h2>
                  <p className="text-xs text-slate-500">Note globale de 0 à 10</p>
                </div>
              </div>
              <div className="mt-3 space-y-3">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                  Score du jour
                  <input
                    type="number"
                    min={1}
                    max={10}
                    step={0.5}
                    value={formFoodScore}
                    onChange={(e) => setFormFoodScore(e.target.value)}
                    placeholder="Ex: 7.5"
                    className="mt-1 w-full rounded-2xl border-0 bg-slate-50 px-4 py-4 text-center text-xl font-bold text-slate-900 shadow-inner ring-1 ring-slate-200 focus:bg-white focus:ring-2 focus:ring-lime-500 outline-none placeholder:text-slate-300"
                  />
                </label>
                <p className="text-[11px] text-slate-500">
                  Un seul score par jour. Score donné par une IA auparavent.
                </p>
                <div className="flex gap-2 pt-4">
                  <button
                    onClick={() => setModal(null)}
                    className="flex-1 rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-200 active:scale-95"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={() => {
                      const value = Number(formFoodScore);
                      if (!Number.isFinite(value)) return;
                      if (value < 1 || value > 10) return;
                      saveDailyField("foodHealthScore", value);
                      setModal(null);
                    }}
                    disabled={loading || !formFoodScore}
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
                      <span className="text-sm italic text-slate-400">Aucune activité pour l'instant.</span>
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
        <p className="text-neutral-500 text-sm">Complète tes routines pour aujourd'hui.</p>
      </div>

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



