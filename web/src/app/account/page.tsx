export default function AccountPage() {
  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
        <h1 className="text-lg font-semibold text-slate-900">Account</h1>
        <p className="mt-2 text-sm text-slate-600">Manage your profile and devices.</p>

        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-3 rounded-xl border border-slate-100 px-4 py-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-100 text-sky-700 font-semibold">
              PV
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-900">You</p>
              <p className="text-xs text-slate-600">personal@physiovapp</p>
            </div>
          </div>
          <div className="rounded-xl border border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">Sync status</p>
            <p className="text-xs text-slate-600">Connected on mobile and desktop.</p>
          </div>
          <div className="rounded-xl border border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">Security</p>
            <p className="text-xs text-slate-600">Add a passcode or biometric lock.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
