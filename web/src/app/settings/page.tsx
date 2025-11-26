const toggles = [
  { title: "Notifications", description: "Daily reminders to log your progress." },
  { title: "Dark mode", description: "Switch to a darker palette for night use." },
  { title: "Compact cards", description: "Reduce padding for dense lists." },
];

export default function SettingsPage() {
  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
        <h1 className="text-lg font-semibold text-slate-900">Settings</h1>
        <p className="mt-2 text-sm text-slate-600">Adjust how Physiovapp looks and notifies you.</p>
        <div className="mt-4 space-y-3">
          {toggles.map((item) => (
            <div key={item.title} className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                <p className="text-xs text-slate-600">{item.description}</p>
              </div>
              <div className="h-6 w-11 rounded-full bg-slate-200">
                <div className="h-6 w-6 rounded-full bg-white shadow ring-1 ring-slate-200" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
