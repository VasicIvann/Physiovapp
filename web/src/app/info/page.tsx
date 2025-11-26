export default function InfoPage() {
  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
        <h1 className="text-lg font-semibold text-slate-900">Add information</h1>
        <p className="mt-2 text-sm text-slate-600">Log routines, notes, and daily highlights.</p>
        <div className="mt-4 space-y-3">
          <div className="rounded-xl border border-slate-100 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Quick note</p>
            <div className="mt-2 h-16 rounded-lg border border-slate-200 bg-slate-50" />
          </div>
          <div className="rounded-xl border border-slate-100 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Mobility / Physio</p>
            <div className="mt-2 h-16 rounded-lg border border-slate-200 bg-slate-50" />
          </div>
          <div className="rounded-xl border border-slate-100 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Energy / Focus</p>
            <div className="mt-2 h-16 rounded-lg border border-slate-200 bg-slate-50" />
          </div>
        </div>
      </section>
    </div>
  );
}
