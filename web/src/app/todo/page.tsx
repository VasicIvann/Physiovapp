"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { addDoc, collection, doc, onSnapshot, query, setDoc, Timestamp, where } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db, isFirebaseConfigured } from "@/lib/firebase";

type Importance = "low" | "medium" | "high";
type DeadlineMode = "none" | "date" | "datetime";

type TodoItem = {
  id: string;
  userId: string;
  title: string;
  description?: string;
  importance: Importance;
  deadlineMode: DeadlineMode;
  dueAt?: Timestamp | null;
  completed: boolean;
  createdAt?: Timestamp | null;
  completedAt?: Timestamp | null;
};

type TodoModalState =
  | { type: "create" }
  | { type: "details"; todoId: string }
  | null;

type TodoFormState = {
  title: string;
  description: string;
  importance: Importance;
  deadlineMode: DeadlineMode;
  deadlineDate: string;
  deadlineDateTime: string;
};

const MS_PER_DAY = 1000 * 60 * 60 * 24;

const importanceConfig: Record<Importance, { label: string; text: string; bg: string; ring: string }> = {
  low: { label: "Faible", text: "text-blue-700", bg: "bg-blue-50", ring: "ring-blue-200" },
  medium: { label: "Moyen", text: "text-orange-700", bg: "bg-orange-50", ring: "ring-orange-200" },
  high: { label: "Élevé", text: "text-rose-700", bg: "bg-rose-50", ring: "ring-rose-200" },
};

const deadlineModeLabels: Record<DeadlineMode, string> = {
  none: "Pas de deadline",
  date: "Jour",
  datetime: "Jour + heure",
};

const pad = (value: number) => value.toString().padStart(2, "0");

const formatDate = (date: Date) => `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;

const formatDateTime = (date: Date) => `${formatDate(date)} à ${pad(date.getHours())}:${pad(date.getMinutes())}`;

const toDateInputValue = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const toDateTimeInputValue = (date: Date) => {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return shifted.toISOString().slice(0, 16);
};

const createDefaultForm = (): TodoFormState => {
  const now = new Date();
  return {
    title: "",
    description: "",
    importance: "medium",
    deadlineMode: "none",
    deadlineDate: toDateInputValue(now),
    deadlineDateTime: toDateTimeInputValue(now),
  };
};

const buildFormFromTodo = (todo: TodoItem): TodoFormState => {
  const dueDate = todo.dueAt?.toDate() ?? new Date();
  return {
    title: todo.title,
    description: todo.description ?? "",
    importance: todo.importance,
    deadlineMode: todo.deadlineMode,
    deadlineDate: toDateInputValue(dueDate),
    deadlineDateTime: toDateTimeInputValue(dueDate),
  };
};

const getTimestampMs = (value?: Timestamp | null) => (value ? value.toMillis() : 0);

const getDaysRemaining = (todo: TodoItem) => {
  if (!todo.dueAt) return null;
  const diff = todo.dueAt.toMillis() - Date.now();
  return Math.max(0, Math.ceil(diff / MS_PER_DAY));
};

const formatDeadline = (todo: TodoItem) => {
  if (todo.deadlineMode === "none" || !todo.dueAt) return "Sans deadline";
  const date = todo.dueAt.toDate();
  return todo.deadlineMode === "date" ? `Le ${formatDate(date)}` : `Le ${formatDateTime(date)}`;
};

const getImportanceOrder = (importance: Importance) => {
  if (importance === "high") return 3;
  if (importance === "medium") return 2;
  return 1;
};

const sortActiveTodos = (a: TodoItem, b: TodoItem) => {
  const aHasDue = Boolean(a.dueAt);
  const bHasDue = Boolean(b.dueAt);
  if (aHasDue !== bHasDue) return aHasDue ? -1 : 1;

  const aDue = getTimestampMs(a.dueAt);
  const bDue = getTimestampMs(b.dueAt);
  if (aDue !== bDue) return aDue - bDue;

  const importanceDelta = getImportanceOrder(b.importance) - getImportanceOrder(a.importance);
  if (importanceDelta !== 0) return importanceDelta;

  return getTimestampMs(b.createdAt) - getTimestampMs(a.createdAt);
};

const sortHistoryTodos = (a: TodoItem, b: TodoItem) => {
  const aDone = getTimestampMs(a.completedAt) || getTimestampMs(a.createdAt);
  const bDone = getTimestampMs(b.completedAt) || getTimestampMs(b.createdAt);
  if (aDone !== bDone) return bDone - aDone;
  return getTimestampMs(b.createdAt) - getTimestampMs(a.createdAt);
};

export default function TodoPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [modal, setModal] = useState<TodoModalState>(null);
  const [form, setForm] = useState<TodoFormState>(createDefaultForm());
  const [detailsForm, setDetailsForm] = useState<TodoFormState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!auth || !db || !isFirebaseConfigured) return;

    let unsubscribeTodos: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setUserId(null);
        setTodos([]);
        unsubscribeTodos?.();
        unsubscribeTodos = null;
        return;
      }

      setUserId(user.uid);
      const todosQuery = query(collection(db, "todos"), where("userId", "==", user.uid));
      unsubscribeTodos?.();
      unsubscribeTodos = onSnapshot(todosQuery, (snapshot) => {
        const next = snapshot.docs
          .map((snapshotDoc) => {
            const data = snapshotDoc.data() as Record<string, unknown>;
            const title = typeof data.title === "string" ? data.title : "";
            if (!title.trim()) return null;

            return {
              id: snapshotDoc.id,
              userId: typeof data.userId === "string" ? data.userId : user.uid,
              title,
              description: typeof data.description === "string" ? data.description : "",
              importance:
                data.importance === "low" || data.importance === "medium" || data.importance === "high"
                  ? data.importance
                  : "medium",
              deadlineMode:
                data.deadlineMode === "none" || data.deadlineMode === "date" || data.deadlineMode === "datetime"
                  ? data.deadlineMode
                  : "none",
              dueAt: data.dueAt instanceof Timestamp ? data.dueAt : null,
              completed: Boolean(data.completed),
              createdAt: data.createdAt instanceof Timestamp ? data.createdAt : null,
              completedAt: data.completedAt instanceof Timestamp ? data.completedAt : null,
            } satisfies TodoItem;
          })
          .filter((todo): todo is TodoItem => Boolean(todo));

        setTodos(next);
      });
    });

    return () => {
      unsubscribeTodos?.();
      unsubscribeAuth();
    };
  }, []);

  const activeTodos = useMemo(() => todos.filter((todo) => !todo.completed).sort(sortActiveTodos), [todos]);
  const historyTodos = useMemo(() => todos.filter((todo) => todo.completed).sort(sortHistoryTodos), [todos]);

  const selectedTodo = useMemo(() => {
    if (!modal || modal.type !== "details") return null;
    return todos.find((todo) => todo.id === modal.todoId) ?? null;
  }, [modal, todos]);

  useEffect(() => {
    if (!selectedTodo || modal?.type !== "details") {
      setDetailsForm(null);
      return;
    }
    setDetailsForm(buildFormFromTodo(selectedTodo));
  }, [modal, selectedTodo]);

  const counts = useMemo(() => {
    const urgent = activeTodos.filter((todo) => {
      const daysRemaining = getDaysRemaining(todo);
      return daysRemaining !== null && daysRemaining <= 1;
    }).length;

    return {
      active: activeTodos.length,
      done: historyTodos.length,
      urgent,
    };
  }, [activeTodos, historyTodos]);

  const openCreateModal = () => {
    setForm(createDefaultForm());
    setModal({ type: "create" });
    setError(null);
    setMessage(null);
  };

  const closeModal = () => setModal(null);

  const completeTodo = async (id: string) => {
    if (!db || !userId) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      await setDoc(
        doc(db, "todos", id),
        {
          completed: true,
          completedAt: Timestamp.now(),
        },
        { merge: true },
      );
      setMessage("Tâche terminée. Bien joué.");
    } catch (err) {
      console.error(err);
      setError("Impossible de terminer la tâche.");
    } finally {
      setLoading(false);
    }
  };

  const reopenTodo = async (id: string) => {
    if (!db || !userId) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      await setDoc(
        doc(db, "todos", id),
        {
          completed: false,
          completedAt: null,
        },
        { merge: true },
      );
      setMessage("Tâche remise dans les tâches à faire.");
      setModal(null);
    } catch (err) {
      console.error(err);
      setError("Impossible d annuler la complétion de la tâche.");
    } finally {
      setLoading(false);
    }
  };

  const submitTodo = async () => {
    if (!db || !userId) return;
    if (!form.title.trim()) {
      setError("Ajoute un titre à la tâche.");
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      let dueAt: Timestamp | null = null;

      if (form.deadlineMode === "date") {
        const [year, month, day] = form.deadlineDate.split("-").map(Number);
        if (!year || !month || !day) throw new Error("invalid_date");
        const dueDate = new Date(year, month - 1, day, 23, 59, 0, 0);
        dueAt = Timestamp.fromDate(dueDate);
      }

      if (form.deadlineMode === "datetime") {
        const dueDate = new Date(form.deadlineDateTime);
        if (Number.isNaN(dueDate.getTime())) throw new Error("invalid_datetime");
        dueAt = Timestamp.fromDate(dueDate);
      }

      await addDoc(collection(db, "todos"), {
        userId,
        title: form.title.trim(),
        description: form.description.trim(),
        importance: form.importance,
        deadlineMode: form.deadlineMode,
        dueAt,
        completed: false,
        createdAt: Timestamp.now(),
        completedAt: null,
      });

      setForm(createDefaultForm());
      setModal(null);
      setMessage("Tâche créée. Tu peux la retrouver juste en dessous.");
    } catch (err) {
      console.error(err);
      setError("Impossible de créer la tâche.");
    } finally {
      setLoading(false);
    }
  };

  const saveTodoChanges = async () => {
    if (!db || !userId || !selectedTodo || !detailsForm) return;
    if (!detailsForm.title.trim()) {
      setError("Le titre ne peut pas être vide.");
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      let dueAt: Timestamp | null = null;

      if (detailsForm.deadlineMode === "date") {
        const [year, month, day] = detailsForm.deadlineDate.split("-").map(Number);
        if (!year || !month || !day) throw new Error("invalid_date");
        const dueDate = new Date(year, month - 1, day, 23, 59, 0, 0);
        dueAt = Timestamp.fromDate(dueDate);
      }

      if (detailsForm.deadlineMode === "datetime") {
        const dueDate = new Date(detailsForm.deadlineDateTime);
        if (Number.isNaN(dueDate.getTime())) throw new Error("invalid_datetime");
        dueAt = Timestamp.fromDate(dueDate);
      }

      await setDoc(
        doc(db, "todos", selectedTodo.id),
        {
          title: detailsForm.title.trim(),
          description: detailsForm.description.trim(),
          importance: detailsForm.importance,
          deadlineMode: detailsForm.deadlineMode,
          dueAt,
        },
        { merge: true },
      );

      setMessage("Tâche mise à jour.");
      setModal(null);
    } catch (err) {
      console.error(err);
      setError("Impossible de mettre à jour la tâche.");
    } finally {
      setLoading(false);
    }
  };

  const renderTodoCard = (todo: TodoItem, completed = false) => {
    const importance = importanceConfig[todo.importance];
    const daysRemaining = getDaysRemaining(todo);
    const dueShort =
      daysRemaining === null
        ? "Sans deadline"
        : daysRemaining <= 0
          ? "Aujourd'hui"
          : `${daysRemaining}j`;
    const dueDateLabel = todo.dueAt ? formatDate(todo.dueAt.toDate()) : "";
    const dueLabel = completed
      ? todo.completedAt
        ? `Terminée le ${formatDateTime(todo.completedAt.toDate())}`
        : "Terminée"
      : formatDeadline(todo);

    const cardTone = completed
      ? "bg-slate-50 border-slate-200/80"
      : todo.importance === "high"
        ? "bg-rose-50 border-rose-200/80"
        : todo.importance === "medium"
          ? "bg-orange-50 border-orange-200/80"
          : "bg-blue-50 border-blue-200/80";

    return (
      <article
        key={todo.id}
        role="button"
        tabIndex={0}
        onClick={() => setModal({ type: "details", todoId: todo.id })}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setModal({ type: "details", todoId: todo.id });
          }
        }}
        className={`group flex items-stretch gap-3 rounded-3xl border p-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.99] ${cardTone}`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${importance.bg} ${importance.text}`}>
                  {completed ? dueLabel : dueShort}
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  {completed ? "Historique" : dueDateLabel}
                </span>
              </div>
              <h3 className={`mt-1 line-clamp-2 text-base font-extrabold leading-tight ${completed ? "text-slate-500 line-through" : "text-slate-900"}`}>
                {todo.title}
              </h3>
            </div>
          </div>
        </div>

        {!completed && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              void completeTodo(todo.id);
            }}
            disabled={loading}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500 text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-600 active:scale-95 disabled:opacity-50"
            aria-label="Terminer la tâche"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </article>
    );
  };

  if (!isFirebaseConfigured) {
    return (
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
        <p className="text-sm font-semibold text-rose-600">Configure Firebase pour utiliser les tâches.</p>
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
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
    <div className="space-y-6 pb-24 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <section className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-br from-emerald-500 via-green-500 to-lime-500 p-5 text-white shadow-[0_20px_45px_rgba(34,197,94,0.28)]">
        <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-white/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-10 -left-8 h-32 w-32 rounded-full bg-black/10 blur-3xl" />

        <div className="relative flex items-start justify-between gap-4">
          <div className="max-w-[70%]">
            <h1 className="text-2xl font-black tracking-tight">Tâches</h1>
            <p className="mt-1 text-sm font-medium text-emerald-50/90">Une seule priorité à la fois. Simple, claire, motivante.</p>
          </div>
          <div className="rounded-2xl bg-white/15 px-3 py-2 text-right backdrop-blur-sm">
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/75">Aujourd’hui</p>
            <p className="text-lg font-black leading-tight">{counts.active}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="relative mt-5 flex w-full items-center justify-center gap-3 rounded-3xl bg-white px-5 py-4 text-base font-black text-emerald-700 shadow-lg shadow-emerald-900/10 transition hover:-translate-y-0.5 hover:bg-emerald-50 active:scale-[0.99]"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-md shadow-emerald-200">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          Ajouter une tâche
        </button>

        <div className="relative mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-2xl bg-white/15 px-3 py-2 backdrop-blur-sm">
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/75">En cours</p>
            <p className="text-sm font-black">{counts.active}</p>
          </div>
          <div className="rounded-2xl bg-white/15 px-3 py-2 backdrop-blur-sm">
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/75">Urgentes</p>
            <p className="text-sm font-black">{counts.urgent}</p>
          </div>
          <div className="rounded-2xl bg-white/15 px-3 py-2 backdrop-blur-sm">
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/75">Terminées</p>
            <p className="text-sm font-black">{counts.done}</p>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
          {error}
        </div>
      )}

      {message && (
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">
          {message}
        </div>
      )}

      <section className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.08)]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-extrabold text-slate-900">Tâches à faire</h2>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            {activeTodos.length} actives
          </span>
        </div>

        <div className="space-y-3">
          {activeTodos.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
              <p className="text-sm font-semibold text-slate-700">Aucune tâche active.</p>
              <p className="mt-1 text-xs text-slate-500">Ajoute une tâche pour commencer.</p>
            </div>
          )}
          {activeTodos.map((todo) => renderTodoCard(todo, false))}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200/80 bg-slate-50/90 p-5 shadow-[0_8px_30px_rgba(15,23,42,0.06)]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-extrabold text-slate-900">Historique</h2>
          </div>
          <span className="rounded-full bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-500 ring-1 ring-slate-200/80">
            {historyTodos.length} finies
          </span>
        </div>

        <div className="space-y-3">
          {historyTodos.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center">
              <p className="text-sm font-semibold text-slate-700">Aucune tâche terminée pour le moment.</p>
            </div>
          )}
          {historyTodos.map((todo) => renderTodoCard(todo, true))}
        </div>
      </section>

      {modal?.type === "create" && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 px-4 py-4 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-xl rounded-[2rem] bg-white p-5 shadow-2xl ring-1 ring-black/5 animate-in zoom-in-95 duration-200">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-600">Nouvelle tâche</p>
                <h3 className="text-xl font-black text-slate-900">Donne-toi une action claire</h3>
                <p className="text-xs font-medium text-slate-500">Choisis une priorité, une deadline et un titre simple.</p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 transition hover:bg-slate-200"
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>

            <div className="mt-5 space-y-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Importance</p>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {(["low", "medium", "high"] as Importance[]).map((importance) => {
                    const config = importanceConfig[importance];
                    const selected = form.importance === importance;
                    return (
                      <button
                        key={importance}
                        type="button"
                        onClick={() => setForm((prev) => ({ ...prev, importance }))}
                        className={`rounded-2xl border px-3 py-3 text-sm font-bold transition active:scale-95 ${
                          selected ? `${config.bg} ring-2 ${config.ring} ${config.text}` : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {config.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Deadline</p>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {(["none", "date", "datetime"] as DeadlineMode[]).map((mode) => {
                    const selected = form.deadlineMode === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setForm((prev) => ({ ...prev, deadlineMode: mode }))}
                        className={`rounded-2xl border px-3 py-3 text-sm font-bold transition active:scale-95 ${
                          selected ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {deadlineModeLabels[mode]}
                      </button>
                    );
                  })}
                </div>

                {form.deadlineMode === "date" && (
                  <label className="mt-3 block text-sm font-medium text-slate-800">
                    Jour
                    <input
                      type="date"
                      value={form.deadlineDate}
                      onChange={(event) => setForm((prev) => ({ ...prev, deadlineDate: event.target.value }))}
                      className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100"
                    />
                  </label>
                )}

                {form.deadlineMode === "datetime" && (
                  <label className="mt-3 block text-sm font-medium text-slate-800">
                    Jour et heure
                    <input
                      type="datetime-local"
                      value={form.deadlineDateTime}
                      onChange={(event) => setForm((prev) => ({ ...prev, deadlineDateTime: event.target.value }))}
                      className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100"
                    />
                  </label>
                )}
              </div>

              <label className="block text-sm font-medium text-slate-800">
                Titre
                <input
                  type="text"
                  value={form.title}
                  onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                  placeholder="Ex: Réviser le chapitre de biologie"
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100"
                />
              </label>

              <label className="block text-sm font-medium text-slate-800">
                Description optionnelle
                <textarea
                  value={form.description}
                  onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                  placeholder="Ajoute un contexte, une sous-tâche ou un détail utile..."
                  rows={4}
                  className="mt-1 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100"
                />
              </label>

              {error && <p className="text-sm font-semibold text-rose-600">{error}</p>}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 active:scale-95"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={() => void submitTodo()}
                  disabled={loading || !form.title.trim()}
                  className="flex-1 rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-black text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-600 active:scale-95 disabled:opacity-50"
                >
                  Créer la tâche
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {modal?.type === "details" && selectedTodo && detailsForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 px-4 py-4 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-xl rounded-[2rem] bg-white p-5 shadow-2xl ring-1 ring-black/5 animate-in zoom-in-95 duration-200">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Modifier la tâche</p>
                <h3 className="text-xl font-black text-slate-900">Paramètres</h3>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 transition hover:bg-slate-200"
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Importance</p>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {(["low", "medium", "high"] as Importance[]).map((importance) => {
                    const config = importanceConfig[importance];
                    const selected = detailsForm.importance === importance;
                    return (
                      <button
                        key={importance}
                        type="button"
                        onClick={() => setDetailsForm((prev) => (prev ? { ...prev, importance } : prev))}
                        className={`rounded-2xl border px-3 py-3 text-sm font-bold transition active:scale-95 ${
                          selected ? `${config.bg} ring-2 ${config.ring} ${config.text}` : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {config.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Deadline</p>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {(["none", "date", "datetime"] as DeadlineMode[]).map((mode) => {
                    const selected = detailsForm.deadlineMode === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setDetailsForm((prev) => (prev ? { ...prev, deadlineMode: mode } : prev))}
                        className={`rounded-2xl border px-3 py-3 text-sm font-bold transition active:scale-95 ${
                          selected ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {deadlineModeLabels[mode]}
                      </button>
                    );
                  })}
                </div>

                {detailsForm.deadlineMode === "date" && (
                  <label className="mt-3 block text-sm font-medium text-slate-800">
                    Jour
                    <input
                      type="date"
                      value={detailsForm.deadlineDate}
                      onChange={(event) =>
                        setDetailsForm((prev) => (prev ? { ...prev, deadlineDate: event.target.value } : prev))
                      }
                      className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100"
                    />
                  </label>
                )}

                {detailsForm.deadlineMode === "datetime" && (
                  <label className="mt-3 block text-sm font-medium text-slate-800">
                    Jour et heure
                    <input
                      type="datetime-local"
                      value={detailsForm.deadlineDateTime}
                      onChange={(event) =>
                        setDetailsForm((prev) => (prev ? { ...prev, deadlineDateTime: event.target.value } : prev))
                      }
                      className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100"
                    />
                  </label>
                )}
              </div>

              <label className="block text-sm font-medium text-slate-800">
                Titre
                <input
                  type="text"
                  value={detailsForm.title}
                  onChange={(event) =>
                    setDetailsForm((prev) => (prev ? { ...prev, title: event.target.value } : prev))
                  }
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100"
                />
              </label>

              <label className="block text-sm font-medium text-slate-800">
                Description
                <textarea
                  value={detailsForm.description}
                  onChange={(event) =>
                    setDetailsForm((prev) => (prev ? { ...prev, description: event.target.value } : prev))
                  }
                  rows={3}
                  className="mt-1 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100"
                />
              </label>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-3xl bg-slate-50 p-4 ring-1 ring-slate-100">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Créée le</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {selectedTodo.createdAt ? formatDateTime(selectedTodo.createdAt.toDate()) : "-"}
                  </p>
                </div>
                <div className="rounded-3xl bg-slate-50 p-4 ring-1 ring-slate-100">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Terminée le</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {selectedTodo.completedAt ? formatDateTime(selectedTodo.completedAt.toDate()) : "-"}
                  </p>
                </div>
              </div>

              {!selectedTodo.completed && (
                <button
                  type="button"
                  onClick={() => void saveTodoChanges()}
                  disabled={loading}
                  className="w-full rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-700 active:scale-95 disabled:opacity-50"
                >
                  Enregistrer les modifications
                </button>
              )}

              {!selectedTodo.completed && (
                <button
                  type="button"
                  onClick={() => void completeTodo(selectedTodo.id)}
                  disabled={loading}
                  className="w-full rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-black text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-600 active:scale-95 disabled:opacity-50"
                >
                  Terminer la tâche
                </button>
              )}

              {selectedTodo.completed && (
                <button
                  type="button"
                  onClick={() => void reopenTodo(selectedTodo.id)}
                  disabled={loading}
                  className="w-full rounded-2xl bg-amber-500 px-4 py-3 text-sm font-black text-white shadow-lg shadow-amber-200 transition hover:bg-amber-600 active:scale-95 disabled:opacity-50"
                >
                  Annuler la complétion
                </button>
              )}

              <button
                type="button"
                onClick={closeModal}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 active:scale-95"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      <Link
        href="/"
        className="fixed bottom-6 right-6 flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 text-white shadow-[0_8px_30px_rgba(0,0,0,0.25)] transition-transform hover:scale-110 active:scale-95 z-50"
        aria-label="Retour à l'accueil"
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M10 19l-7-7m0 0l7-7m-7 7h18" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Link>
    </div>
  );
}
