import { DailyEntryForm } from "@/components/DailyEntryForm";

const focusAreas = [
  {
    title: "Habitudes kine et mobilite",
    description: "Routines rapides (10 a 15 min) axees sur la colonne, les hanches et la posture.",
    tag: "Physio",
  },
  {
    title: "Charge de travail intelligente",
    description: "Log de chaque session : repetitions utiles, douleur ressentie, energie restante.",
    tag: "Training",
  },
  {
    title: "Productivite holistique",
    description: "Habitudes sommeil, hydratation et focus mental pour relier corps + esprit.",
    tag: "Mindset",
  },
];

const timeline = [
  { title: "Check-in Matin", details: "Respiration + mobilite articulaire", time: "06:30" },
  { title: "Bloc Deep Work", details: "45 min focus sur projet PhysioVapp", time: "10:00" },
  { title: "Session mouvement", details: "Renfo + etirements dynamiques", time: "18:30" },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-white">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 pb-16 pt-12 sm:px-8">
        <header className="rounded-3xl bg-slate-900 px-6 py-8 text-white sm:px-8">
          <p className="text-xs uppercase tracking-[0.3em] text-emerald-300">Physiovapp</p>
          <h1 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">
            Un carnet mobile-first pour mesurer tes progres physiques et mentaux, partout.
          </h1>
          <p className="mt-4 text-base text-slate-200 sm:text-lg">
            Optimise pour la saisie quotidienne sur smartphone avec stockage cloud via Firebase.
          </p>
          <div className="mt-6 flex flex-wrap gap-3 text-sm font-medium text-slate-100">
            <span className="rounded-full bg-white/15 px-4 py-1">Next.js 16 + Tailwind 4</span>
            <span className="rounded-full bg-white/15 px-4 py-1">Firestore temps-reel</span>
            <span className="rounded-full bg-white/15 px-4 py-1">Firebase Hosting pret</span>
          </div>
        </header>

        <section className="grid gap-6 rounded-3xl border border-slate-100 bg-white/80 p-6 shadow-sm sm:grid-cols-2 sm:p-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
              Daily log / Mobile-first
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-slate-900">
              Saisie tactile rapide + insights concrets sur ta productivite.
            </h2>
            <p className="mt-3 text-sm text-slate-600">
              Ouvre Physiovapp sur ton telephone, remplis le formulaire en 45 secondes, consulte l&apos;historique depuis
              n&apos;importe quel appareil.
            </p>
            <div className="mt-5 grid grid-cols-3 gap-3 text-center">
              {["Mobile", "Cloud", "Offline ready"].map((item) => (
                <div key={item} className="rounded-2xl border border-slate-100 px-3 py-4">
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{item}</p>
                  <p className="text-lg font-bold text-slate-900">OK</p>
                </div>
              ))}
            </div>
          </div>
          <DailyEntryForm />
        </section>

        <section className="grid gap-5 rounded-3xl border border-slate-100 bg-white/90 p-6 shadow-sm sm:grid-cols-3 sm:p-8">
          {focusAreas.map((focus) => (
            <article key={focus.title} className="rounded-2xl border border-slate-100 p-5">
              <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-600">
                {focus.tag}
              </span>
              <h3 className="mt-3 text-lg font-semibold text-slate-900">{focus.title}</h3>
              <p className="mt-2 text-sm text-slate-600">{focus.description}</p>
            </article>
          ))}
        </section>

        <section className="rounded-3xl border border-slate-100 bg-slate-900 px-6 py-7 text-white sm:px-10 sm:py-10">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-emerald-300">Routines cles</p>
              <h2 className="mt-3 text-2xl font-semibold sm:text-3xl">Ta journee Physiovapp</h2>
            </div>
              <div className="rounded-2xl bg-white/10 px-4 py-3 text-center text-sm font-medium text-emerald-200">
                Synchro instantanee via Firestore
            </div>
          </div>
          <div className="mt-8 space-y-5">
            {timeline.map((step) => (
              <div key={step.title} className="flex flex-col gap-2 rounded-2xl bg-white/5 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-300">{step.time}</p>
                  <p className="mt-1 text-lg font-semibold">{step.title}</p>
                  <p className="text-sm text-slate-200">{step.details}</p>
                </div>
                <button className="rounded-full border border-white/30 px-4 py-2 text-sm font-semibold text-white transition hover:border-white hover:bg-white/10">
                  Ajouter au log
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
