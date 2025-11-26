const tasks = [
  { title: "Warm-up routine", note: "10 min mobility flow" },
  { title: "Deep work block", note: "45 min focus on project" },
  { title: "Recovery", note: "Stretch and hydrate" },
];

export default function TodoPage() {
  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
        <h1 className="text-lg font-semibold text-slate-900">Todo list</h1>
        <p className="mt-2 text-sm text-slate-600">Quick actions to keep you on track.</p>
        <div className="mt-4 space-y-3">
          {tasks.map((task) => (
            <div
              key={task.title}
              className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3"
            >
              <div>
                <p className="text-sm font-semibold text-slate-900">{task.title}</p>
                <p className="text-xs text-slate-600">{task.note}</p>
              </div>
              <span className="h-5 w-5 rounded-full border border-slate-300 bg-white" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
