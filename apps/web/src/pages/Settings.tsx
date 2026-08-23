export default function Settings() {
  return (
    <section className="panel">
      <div className="panel-heading">Settings</div>
      <div className="space-y-6 px-5 py-6">
        <p className="text-sm text-slate-400">Configuration form coming soon.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Jira URL</span>
            <input className="field w-full" disabled placeholder="https://your-org.atlassian.net" />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Jira email</span>
            <input className="field w-full" disabled placeholder="you@company.com" type="email" />
          </label>
          <label className="space-y-1.5 sm:col-span-2">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">GitHub token</span>
            <input className="field w-full" disabled placeholder="••••••" type="password" />
          </label>
        </div>
        <button type="button" className="button button-primary" disabled>
          Save configuration
        </button>
      </div>
    </section>
  );
}
