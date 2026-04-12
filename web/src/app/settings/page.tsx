"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { doc, getDoc, setDoc, type DocumentData } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db, isFirebaseConfigured } from "@/lib/firebase";

type NutritionGoals = {
  calorieGoal?: number;
  proteinGoal?: number;
  carbGoal?: number;
  fatGoal?: number;
};

const formatGoal = (value: number | null | undefined, unit: string) => {
  if (typeof value !== "number" || Number.isNaN(value)) return "Non defini";
  return `${value} ${unit}`;
};

export default function SettingsPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [goals, setGoals] = useState<NutritionGoals | null>(null);
  const [formGoals, setFormGoals] = useState({
    calories: "",
    protein: "",
    carbs: "",
    fat: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (!auth || !db || !isFirebaseConfigured) {
      setLoading(false);
      return;
    }
    const unsub = onAuthStateChanged(auth, async (user) => {
      setError(null);
      setMessage(null);
      if (!user) {
        setUserId(null);
        setGoals(null);
        setFormGoals({ calories: "", protein: "", carbs: "", fat: "" });
        setLoading(false);
        return;
      }
      setUserId(user.uid);
      try {
        const snap = await getDoc(doc(db!, "users", user.uid));
        const data = snap.data() as DocumentData | undefined;
        const nextGoals: NutritionGoals = {
          calorieGoal: typeof data?.calorieGoal === "number" ? data.calorieGoal : undefined,
          proteinGoal: typeof data?.proteinGoal === "number" ? data.proteinGoal : undefined,
          carbGoal: typeof data?.carbGoal === "number" ? data.carbGoal : undefined,
          fatGoal: typeof data?.fatGoal === "number" ? data.fatGoal : undefined,
        };
        setGoals(nextGoals);
        setFormGoals({
          calories: nextGoals.calorieGoal?.toString() ?? "",
          protein: nextGoals.proteinGoal?.toString() ?? "",
          carbs: nextGoals.carbGoal?.toString() ?? "",
          fat: nextGoals.fatGoal?.toString() ?? "",
        });
      } catch (err) {
        console.error(err);
        setError("Impossible de charger les objectifs.");
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!auth || !db || !userId) return;
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const payload: Record<string, number> = {};

      const caloriesValue = formGoals.calories.trim() === "" ? NaN : Number(formGoals.calories);
      const proteinValue = formGoals.protein.trim() === "" ? NaN : Number(formGoals.protein);
      const carbsValue = formGoals.carbs.trim() === "" ? NaN : Number(formGoals.carbs);
      const fatValue = formGoals.fat.trim() === "" ? NaN : Number(formGoals.fat);

      if (!Number.isNaN(caloriesValue)) payload.calorieGoal = caloriesValue;
      if (!Number.isNaN(proteinValue)) payload.proteinGoal = proteinValue;
      if (!Number.isNaN(carbsValue)) payload.carbGoal = carbsValue;
      if (!Number.isNaN(fatValue)) payload.fatGoal = fatValue;

      await setDoc(doc(db!, "users", userId), payload, { merge: true });

      const nextGoals: NutritionGoals = {
        calorieGoal: payload.calorieGoal,
        proteinGoal: payload.proteinGoal,
        carbGoal: payload.carbGoal,
        fatGoal: payload.fatGoal,
      };
      setGoals(nextGoals);
      setMessage("Objectifs enregistres.");
      setShowForm(false);
    } catch (err) {
      console.error(err);
      setError("Impossible d enregistrer les objectifs.");
    } finally {
      setSaving(false);
    }
  };

  if (!isFirebaseConfigured) {
    return (
      <div className="rounded-3xl border border-rose-500/35 bg-gradient-to-br from-rose-950/70 to-orange-950/60 p-5 shadow-sm">
        <p className="text-sm font-semibold text-rose-200">Configure Firebase pour utiliser les parametres.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-3xl border border-cyan-500/30 bg-slate-900/85 p-5 shadow-sm">
        <p className="text-sm text-slate-200">Chargement des parametres...</p>
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="rounded-3xl border border-slate-700/70 bg-slate-900/85 p-5 shadow-sm">
        <p className="text-sm font-semibold text-slate-100">Tu n es pas connecte.</p>
        <div className="mt-3 flex gap-3">
          <Link href="/signin" className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white">
            Sign in
          </Link>
          <Link href="/signup" className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200">
            Sign up
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-cyan-500/25 bg-gradient-to-br from-slate-900/95 via-slate-900 to-cyan-950/65 p-5 shadow-[0_14px_34px_rgba(2,6,23,0.52)]">
        <h1 className="text-lg font-bold text-slate-100">Parametres</h1>
        <p className="mt-1 text-sm text-slate-300">Definis tes objectifs nutritionnels quotidiens.</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Objectifs actuels</p>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-slate-800 px-3 py-2 shadow-sm ring-1 ring-slate-700">
                <p className="font-semibold text-slate-100">Calories</p>
                <p className="text-slate-400">{formatGoal(goals?.calorieGoal ?? null, "kcal")}</p>
              </div>
              <div className="rounded-lg bg-slate-800 px-3 py-2 shadow-sm ring-1 ring-slate-700">
                <p className="font-semibold text-slate-100">Proteines</p>
                <p className="text-slate-400">{formatGoal(goals?.proteinGoal ?? null, "g")}</p>
              </div>
              <div className="rounded-lg bg-slate-800 px-3 py-2 shadow-sm ring-1 ring-slate-700">
                <p className="font-semibold text-slate-100">Glucides</p>
                <p className="text-slate-400">{formatGoal(goals?.carbGoal ?? null, "g")}</p>
              </div>
              <div className="rounded-lg bg-slate-800 px-3 py-2 shadow-sm ring-1 ring-slate-700">
                <p className="font-semibold text-slate-100">Lipides</p>
                <p className="text-slate-400">{formatGoal(goals?.fatGoal ?? null, "g")}</p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-900/75 px-4 py-3">
            <button
              type="button"
              onClick={() => setShowForm((prev) => !prev)}
              className="inline-flex items-center justify-center rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-sm transition hover:bg-cyan-500 active:scale-95"
            >
              Choisir les objectif
            </button>
          </div>
        </div>

        {showForm && (
          <form className="mt-5 space-y-3" onSubmit={handleSubmit}>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium text-slate-200">
                Calories / jour
                <input
                  type="number"
                  min={0}
                  value={formGoals.calories}
                  onChange={(e) => setFormGoals((prev) => ({ ...prev, calories: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/25"
                />
              </label>
              <label className="block text-sm font-medium text-slate-200">
                Proteines / jour (g)
                <input
                  type="number"
                  min={0}
                  value={formGoals.protein}
                  onChange={(e) => setFormGoals((prev) => ({ ...prev, protein: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/25"
                />
              </label>
              <label className="block text-sm font-medium text-slate-200">
                Glucides / jour (g)
                <input
                  type="number"
                  min={0}
                  value={formGoals.carbs}
                  onChange={(e) => setFormGoals((prev) => ({ ...prev, carbs: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/25"
                />
              </label>
              <label className="block text-sm font-medium text-slate-200">
                Lipides / jour (g)
                <input
                  type="number"
                  min={0}
                  value={formGoals.fat}
                  onChange={(e) => setFormGoals((prev) => ({ ...prev, fat: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/25"
                />
              </label>
            </div>

            {error && <p className="text-sm font-semibold text-rose-600">{error}</p>}
            {message && <p className="text-sm font-semibold text-emerald-600">{message}</p>}

            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setMessage(null);
                  setError(null);
                }}
                className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-800"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-slate-950 shadow-sm transition hover:bg-cyan-500 active:scale-95 disabled:opacity-50"
              >
                {saving ? "Enregistrement..." : "Enregistrer les objectifs"}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
