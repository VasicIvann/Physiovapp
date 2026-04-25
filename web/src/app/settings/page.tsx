"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { doc, getDoc, setDoc, type DocumentData } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db, isFirebaseConfigured } from "@/lib/firebase";
import type { GoalType } from "@/lib/nutritionScore";

type NutritionGoals = {
  goalType?: GoalType;
  calorieGoal?: number;
  proteinGoal?: number;
};

const formatGoal = (value: number | null | undefined, unit: string) => {
  if (typeof value !== "number" || Number.isNaN(value)) return "Non defini";
  return `${value} ${unit}`;
};

const formatGoalType = (value: GoalType | undefined) => {
  if (value === "cut") return "Cut (perte)";
  if (value === "bulk") return "Bulk (prise)";
  return "Non defini";
};

export default function SettingsPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [goals, setGoals] = useState<NutritionGoals | null>(null);
  const [formGoals, setFormGoals] = useState<{
    goalType: GoalType;
    calories: string;
    protein: string;
  }>({
    goalType: "cut",
    calories: "",
    protein: "",
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
        setFormGoals({ goalType: "cut", calories: "", protein: "" });
        setLoading(false);
        return;
      }
      setUserId(user.uid);
      try {
        const snap = await getDoc(doc(db!, "users", user.uid));
        const data = snap.data() as DocumentData | undefined;
        const goalType: GoalType | undefined =
          data?.goalType === "cut" || data?.goalType === "bulk" ? data.goalType : undefined;
        const nextGoals: NutritionGoals = {
          goalType,
          calorieGoal: typeof data?.calorieGoal === "number" ? data.calorieGoal : undefined,
          proteinGoal: typeof data?.proteinGoal === "number" ? data.proteinGoal : undefined,
        };
        setGoals(nextGoals);
        setFormGoals({
          goalType: nextGoals.goalType ?? "cut",
          calories: nextGoals.calorieGoal?.toString() ?? "",
          protein: nextGoals.proteinGoal?.toString() ?? "",
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
      const caloriesValue = formGoals.calories.trim() === "" ? NaN : Number(formGoals.calories);
      const proteinValue = formGoals.protein.trim() === "" ? NaN : Number(formGoals.protein);

      if (Number.isNaN(caloriesValue) || caloriesValue <= 0) {
        setError("Entre un objectif de calories valide.");
        setSaving(false);
        return;
      }
      if (Number.isNaN(proteinValue) || proteinValue <= 0) {
        setError("Entre un objectif de proteines valide.");
        setSaving(false);
        return;
      }

      const payload = {
        goalType: formGoals.goalType,
        calorieGoal: caloriesValue,
        proteinGoal: proteinValue,
      };

      await setDoc(doc(db!, "users", userId), payload, { merge: true });

      setGoals(payload);
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
        <p className="mt-1 text-sm text-slate-300">Definis ton mode et tes objectifs nutritionnels.</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Objectifs actuels</p>
            <div className="mt-2 grid grid-cols-1 gap-2 text-xs">
              <div className="rounded-lg bg-slate-800 px-3 py-2 shadow-sm ring-1 ring-slate-700">
                <p className="font-semibold text-slate-100">Mode</p>
                <p className="text-slate-400">{formatGoalType(goals?.goalType)}</p>
              </div>
              <div className="rounded-lg bg-slate-800 px-3 py-2 shadow-sm ring-1 ring-slate-700">
                <p className="font-semibold text-slate-100">Calories</p>
                <p className="text-slate-400">{formatGoal(goals?.calorieGoal ?? null, "kcal")}</p>
              </div>
              <div className="rounded-lg bg-slate-800 px-3 py-2 shadow-sm ring-1 ring-slate-700">
                <p className="font-semibold text-slate-100">Proteines</p>
                <p className="text-slate-400">{formatGoal(goals?.proteinGoal ?? null, "g")}</p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-900/75 px-4 py-3">
            <button
              type="button"
              onClick={() => setShowForm((prev) => !prev)}
              className="inline-flex items-center justify-center rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-sm transition hover:bg-cyan-500 active:scale-95"
            >
              Choisir les objectifs
            </button>
          </div>
        </div>

        {showForm && (
          <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
            <div>
              <p className="text-sm font-medium text-slate-200 mb-2">Mode</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setFormGoals((prev) => ({ ...prev, goalType: "cut" }))}
                  className={`rounded-xl border px-4 py-3 text-sm font-semibold transition active:scale-95 ${
                    formGoals.goalType === "cut"
                      ? "border-cyan-500 bg-cyan-600 text-slate-950"
                      : "border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
                  }`}
                >
                  Cut (perte)
                </button>
                <button
                  type="button"
                  onClick={() => setFormGoals((prev) => ({ ...prev, goalType: "bulk" }))}
                  className={`rounded-xl border px-4 py-3 text-sm font-semibold transition active:scale-95 ${
                    formGoals.goalType === "bulk"
                      ? "border-cyan-500 bg-cyan-600 text-slate-950"
                      : "border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
                  }`}
                >
                  Bulk (prise)
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-400">
                {formGoals.goalType === "cut"
                  ? "En cut, tu dois rester sous ton objectif calorique."
                  : "En bulk, tu dois atteindre ou depasser legerement ton objectif calorique."}
              </p>
            </div>

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
            </div>

            {error && <p className="text-sm font-semibold text-rose-400">{error}</p>}
            {message && <p className="text-sm font-semibold text-emerald-400">{message}</p>}

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

        {!showForm && message && (
          <p className="mt-3 text-sm font-semibold text-emerald-400">{message}</p>
        )}
      </section>
    </div>
  );
}
