"use client";

import { FormEvent, useMemo, useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db, isFirebaseConfigured } from "@/lib/firebase";

type MetricField = {
  id: "energy" | "mobility" | "focus";
  label: string;
  helper: string;
};

type FormState = Record<MetricField["id"] | "note", string>;

const metricFields: MetricField[] = [
  { id: "energy", label: "Energie", helper: "0 = epuise - 10 = inarretable" },
  { id: "mobility", label: "Mobilite / Souplesse", helper: "Combien de mouvements utiles aujourd'hui ?" },
  { id: "focus", label: "Focus mental", helper: "As-tu protege des blocs Deep Work ?" },
];

const baseState: FormState = {
  energy: "",
  mobility: "",
  focus: "",
  note: "",
};

const inMemoryPreview = [
  { label: "Energie moyenne", value: "7.3/10" },
  { label: "Jours consecutifs", value: "5" },
  { label: "Derniere victoire", value: "Session mobilite complete" },
];

export function DailyEntryForm() {
  const [formState, setFormState] = useState<FormState>(baseState);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isSubmitDisabled = useMemo(
    () =>
      isSubmitting ||
      !formState.energy ||
      !formState.mobility ||
      !formState.focus ||
      !isFirebaseConfigured,
    [formState.energy, formState.focus, formState.mobility, isSubmitting],
  );

  const resetForm = () => {
    setFormState(baseState);
    setStatus("success");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!db) {
      setStatus("error");
      return;
    }

    setIsSubmitting(true);
    setStatus("idle");

    try {
      await addDoc(collection(db, "entries"), {
        energy: Number(formState.energy),
        mobility: Number(formState.mobility),
        focus: Number(formState.focus),
        note: formState.note.trim(),
        createdAt: serverTimestamp(),
      });

      resetForm();
    } catch (error) {
      console.error(error);
      setStatus("error");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isFirebaseConfigured) {
    return (
      <div className="rounded-2xl bg-white/80 p-6 shadow-lg ring-1 ring-black/5 backdrop-blur">
        <p className="text-sm font-semibold text-emerald-700">Etape 1 - Connecte ton projet Firebase</p>
        <p className="mt-1 text-sm text-slate-600">
          Cree un projet Firebase puis copie les cles Web dans <code className="rounded bg-slate-100 px-1">web/.env.local</code> en te basant
          sur <code className="rounded bg-slate-100 px-1">web/.env.example</code>. Redemarre ensuite <code className="rounded bg-slate-100 px-1">npm run dev</code>.
        </p>
        <ol className="mt-4 space-y-2 text-sm text-slate-700">
          <li>1. Firebase Console &rarr; Project Settings &rarr; &quot;Add app&quot; &rarr; Web.</li>
          <li>2. Active Firestore Database (mode production recommande).</li>
          <li>3. <code className="rounded bg-slate-100 px-1">npm install -g firebase-tools</code> (une fois) puis <code className="rounded bg-slate-100 px-1">firebase login</code>.</li>
        </ol>
        <p className="mt-4 text-xs text-slate-500">
          Lorsque les variables seront disponibles, le formulaire se connectera automatiquement a Firestore.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-3xl bg-white/90 p-5 shadow-xl ring-1 ring-black/5 backdrop-blur-sm sm:p-6">
      <form className="space-y-6" onSubmit={handleSubmit}>
        <div className="flex flex-col gap-3">
          {metricFields.map((field) => (
            <label key={field.id} className="flex flex-col gap-1 text-sm font-medium text-slate-900">
              {field.label}
              <input
                type="number"
                min={0}
                max={10}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                placeholder="0 - 10"
                value={formState[field.id]}
                onChange={(event) => {
                  const value = event.target.value;
                  setFormState((prev) => ({ ...prev, [field.id]: value }));
                }}
              />
              <span className="text-xs font-normal text-slate-500">{field.helper}</span>
            </label>
          ))}
        </div>

        <label className="flex flex-col gap-1 text-sm font-medium text-slate-900">
          Note rapide
          <textarea
            rows={3}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            placeholder="Ce qui a booste ou freine ta seance..."
            value={formState.note}
            onChange={(event) => setFormState((prev) => ({ ...prev, note: event.target.value }))}
          />
        </label>

        <button
          type="submit"
          disabled={isSubmitDisabled}
          className="flex w-full items-center justify-center rounded-2xl bg-emerald-500 px-4 py-3 text-base font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-emerald-300"
        >
          {isSubmitting ? "Enregistrement..." : "Loguer ma journee"}
        </button>

        {status !== "idle" && (
          <p
            className={`text-center text-sm font-medium ${
              status === "success" ? "text-emerald-600" : "text-rose-600"
            }`}
          >
            {status === "success"
              ? "Entree enregistree ! Retrouve-la instantanement sur tous tes appareils."
              : "Impossible d'ecrire dans Firestore. Verifie tes regles ou ta connexion."}
          </p>
        )}
      </form>

      <div className="mt-6 grid grid-cols-3 gap-3">
        {inMemoryPreview.map((item) => (
          <div key={item.label} className="rounded-2xl border border-slate-200 px-3 py-2 text-center">
            <p className="text-[11px] font-semibold uppercase text-slate-500">{item.label}</p>
            <p className="text-lg font-bold text-slate-900">{item.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
