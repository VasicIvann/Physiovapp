"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";
import { auth, db, isFirebaseConfigured } from "@/lib/firebase";
import { firebaseApp } from "@/lib/firebase";
import { enablePushForCurrentUser, isPushAvailable } from "@/lib/push";

type ReminderPreset = "atTime" | "10m" | "1h" | "1d";

type TodoItem = {
  id: string;
  userId: string;
  title: string;
  dueAt: Timestamp;
  reminders: ReminderPreset[];
  createdAt: Timestamp;
};

const presetToMinutesBefore: Record<ReminderPreset, number> = {
  atTime: 0,
  "10m": 10,
  "1h": 60,
  "1d": 60 * 24,
};

const formatDateTime = (ts: Timestamp) => {
  const d = ts.toDate();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function TodoPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [reminders, setReminders] = useState<Record<ReminderPreset, boolean>>({
    atTime: true,
    "10m": false,
    "1h": false,
    "1d": false,
  });
  const [pushSupported, setPushSupported] = useState<boolean | null>(null);
  const [pushTokenPreview, setPushTokenPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const firestore = db;
    const firebaseAuth = auth;
    if (!firebaseAuth || !firestore || !isFirebaseConfigured) {
      setPushSupported(false);
      return;
    }
    let unsubscribeTodos: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(firebaseAuth, async (user) => {
      if (!user || !firestore || !isFirebaseConfigured) {
        setUserId(null);
        setTodos([]);
        unsubscribeTodos?.();
        unsubscribeTodos = null;
        return;
      }

      setUserId(user.uid);
      setPushSupported(await isPushAvailable());

      const todosQ = query(collection(firestore, "todos"), where("userId", "==", user.uid));
      unsubscribeTodos?.();
      unsubscribeTodos = onSnapshot(todosQ, (snap) => {
        const next = snap.docs
          .map((d) => ({ ...(d.data() as Omit<TodoItem, "id">), id: d.id }))
          .filter((t) => t?.dueAt)
          .sort((a, b) => a.dueAt.toMillis() - b.dueAt.toMillis());
        setTodos(next);
      });
    });

    return () => {
      unsubscribeTodos?.();
      unsubscribeAuth?.();
    };
  }, []);

  const selectedPresets = useMemo(
    () => (Object.keys(reminders) as ReminderPreset[]).filter((k) => reminders[k]),
    [reminders],
  );

  const enablePush = async () => {
    setError(null);
    setMessage(null);
    const res = await enablePushForCurrentUser();
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setPushTokenPreview(`${res.token.slice(0, 12)}...${res.token.slice(-8)}`);
    setMessage("Notifications activees sur cet appareil.");
  };

  const sendTestNotification = async () => {
    if (!firebaseApp) return;
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const fn = httpsCallable(getFunctions(firebaseApp), "sendTestPush");
      await fn({ title: "Physiovapp", body: "Test notification", url: "/todo" });
      setMessage("Notification test envoyee.");
    } catch (e) {
      console.error(e);
      setError("Impossible d envoyer une notification test (functions non deployees?).");
    } finally {
      setLoading(false);
    }
  };

  const createTodo = async () => {
    const firestore = db;
    if (!firestore || !userId) return;
    if (!title.trim() || !dueAt) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const dueDate = new Date(dueAt);
      if (Number.isNaN(dueDate.getTime())) throw new Error("invalid_date");

      const todoDoc = await addDoc(collection(firestore, "todos"), {
        userId,
        title: title.trim(),
        dueAt: Timestamp.fromDate(dueDate),
        reminders: selectedPresets,
        createdAt: Timestamp.now(),
      });

      const baseTitle = "Todo reminder";
      const body = title.trim();
      const url = "/todo";

      await Promise.all(
        selectedPresets.map(async (preset) => {
          const minutesBefore = presetToMinutesBefore[preset];
          const scheduled = new Date(dueDate);
          scheduled.setMinutes(dueDate.getMinutes() - minutesBefore);
          return addDoc(collection(firestore, "todoReminders"), {
            userId,
            todoId: todoDoc.id,
            title: baseTitle,
            body,
            url,
            scheduledAt: Timestamp.fromDate(scheduled),
            status: "pending",
            createdAt: Timestamp.now(),
          });
        }),
      );

      setTitle("");
      setDueAt("");
      setReminders({ atTime: true, "10m": false, "1h": false, "1d": false });
      setMessage("Todo cree. Les rappels seront envoyes si les notifications sont actives.");
    } catch (e) {
      console.error(e);
      setError("Impossible de creer le todo.");
    } finally {
      setLoading(false);
    }
  };

  const removeTodo = async (id: string) => {
    const firestore = db;
    if (!firestore) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      await deleteDoc(doc(firestore, "todos", id));
      setMessage("Todo supprime.");
    } catch (e) {
      console.error(e);
      setError("Impossible de supprimer le todo.");
    } finally {
      setLoading(false);
    }
  };

  if (!isFirebaseConfigured) {
    return (
      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
        <p className="text-sm font-semibold text-rose-600">Configure Firebase pour utiliser les todos.</p>
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
        <p className="text-sm font-semibold text-slate-900">Tu n es pas connecte.</p>
        <div className="mt-3 flex gap-3">
          <Link href="/signin" className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white">
            Sign in
          </Link>
          <Link href="/signup" className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-800">
            Sign up
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-10">
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
        <h1 className="text-lg font-semibold text-slate-900">Todo</h1>
        <p className="mt-1 text-sm text-slate-600">Cree des rappels avec deadline et notifications.</p>

        <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">Notifications</p>
              <p className="text-xs text-slate-600">
                {pushSupported === false
                  ? "Push non supporte ici."
                  : "Active pour recevoir des notifications systeme."}
              </p>
              {pushTokenPreview && <p className="mt-1 text-[11px] text-slate-500">Token: {pushTokenPreview}</p>}
            </div>
            <button
              type="button"
              onClick={enablePush}
              disabled={loading || pushSupported === false}
              className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-slate-800 active:scale-95 disabled:opacity-50"
            >
              Activer
            </button>
          </div>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={sendTestNotification}
              disabled={loading || pushSupported === false}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 shadow-sm transition hover:bg-slate-100 active:scale-95 disabled:opacity-50"
            >
              Test notification
            </button>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            iPhone: installe le site (Ajouter a l ecran d accueil) pour activer les push.
          </p>
        </div>

        <div className="mt-4 space-y-3">
          <label className="block text-sm font-medium text-slate-800">
            Titre
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            />
          </label>
          <label className="block text-sm font-medium text-slate-800">
            Deadline
            <input
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            />
          </label>
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Rappels</p>
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
              {(
                [
                  ["atTime", "A l heure"],
                  ["10m", "10 min avant"],
                  ["1h", "1 h avant"],
                  ["1d", "1 jour avant"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={reminders[key]}
                    onChange={(e) => setReminders((prev) => ({ ...prev, [key]: e.target.checked }))}
                    className="h-4 w-4"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {error && <p className="text-sm font-semibold text-rose-600">{error}</p>}
          {message && <p className="text-sm font-semibold text-emerald-600">{message}</p>}

          <button
            type="button"
            onClick={createTodo}
            disabled={loading || !title.trim() || !dueAt}
            className="w-full rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 active:scale-95 disabled:opacity-50"
          >
            Ajouter Todo
          </button>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
        <h2 className="text-sm font-bold text-slate-900">Mes Todos</h2>
        <div className="mt-3 space-y-3">
          {todos.length === 0 && <p className="text-sm text-slate-500">Aucun todo.</p>}
          {todos.map((t) => (
            <div key={t.id} className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 truncate">{t.title}</p>
                <p className="text-xs text-slate-600">Deadline: {formatDateTime(t.dueAt)}</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  Rappels: {t.reminders?.length ? t.reminders.join(", ") : "aucun"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => removeTodo(t.id)}
                className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 transition hover:bg-slate-100 active:scale-95"
              >
                Supprimer
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
