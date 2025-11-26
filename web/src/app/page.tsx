import Link from "next/link";

export default function Home() {
  return (
    <div className="space-y-4 pb-6">
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
        <div className="flex items-center justify-center gap-4 text-sky-700">
          <span className="rounded-xl bg-sky-50 p-3">
            <svg viewBox="0 0 24 24" className="h-12 w-12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 16.5 9.5 11l4 3.5L20 8.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M14.5 8.5H20v5.5" strokeLinecap="round" />
            </svg>
          </span>
          <span className="rounded-xl bg-sky-50 p-3">
            <svg viewBox="0 0 24 24" className="h-12 w-12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M6.5 17.5V11m5 6.5V8.5m5 9V6.5" strokeLinecap="round" />
            </svg>
          </span>
          <span className="rounded-xl bg-sky-50 p-3">
            <svg viewBox="0 0 24 24" className="h-12 w-12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="7.5" />
              <path d="M12 4.5V12l5.5 3" strokeLinecap="round" />
            </svg>
          </span>
        </div>
        <Link
          href="/stat"
          className="mt-6 flex w-full items-center justify-center rounded-lg bg-sky-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-700"
        >
          See more stats
        </Link>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
        <p className="text-sm font-medium text-slate-700">Capture quick info and routines.</p>
        <Link
          href="/info"
          className="mt-4 flex w-full items-center justify-center rounded-lg bg-sky-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-700"
        >
          add information
        </Link>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
        <p className="text-sm font-medium text-slate-700">Organize your tasks and daily checks.</p>
        <Link
          href="/todo"
          className="mt-4 flex w-full items-center justify-center rounded-lg bg-sky-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-700"
        >
          access TODO
        </Link>
      </section>
    </div>
  );
}
