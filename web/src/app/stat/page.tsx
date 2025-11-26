export default function StatPage() {
  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
        <h1 className="text-lg font-semibold text-slate-900">Stats overview</h1>
        <p className="mt-2 text-sm text-slate-600">Visual summaries of your progress.</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-slate-100 bg-sky-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Weekly</p>
            <div className="mt-3 h-24 rounded-lg bg-white shadow-inner" />
          </div>
          <div className="rounded-xl border border-slate-100 bg-sky-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Monthly</p>
            <div className="mt-3 h-24 rounded-lg bg-white shadow-inner" />
          </div>
          <div className="rounded-xl border border-slate-100 bg-sky-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Focus</p>
            <div className="mt-3 h-24 rounded-lg bg-white shadow-inner" />
          </div>
          <div className="rounded-xl border border-slate-100 bg-sky-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Energy</p>
            <div className="mt-3 h-24 rounded-lg bg-white shadow-inner" />
          </div>
        </div>
      </section>
    </div>
  );
}
