interface EmptySyncStateProps {
  message?: string;
  onSync?: () => void;
  syncing?: boolean;
  syncError?: string | null;
}

export function EmptySyncState({
  message = 'No sprint data yet.',
  onSync,
  syncing = false,
  syncError = null,
}: EmptySyncStateProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 px-5 py-8 text-center">
        <p className="text-sm font-medium text-slate-200">{message}</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
          Open <span className="text-slate-300">Settings</span> to configure Jira and GitHub
          credentials, then run <span className="text-slate-300">Sync</span> from Current.
        </p>
        {onSync && (
          <button
            type="button"
            className="button button-primary mt-4"
            disabled={syncing}
            onClick={onSync}
          >
            {syncing ? 'Syncing…' : 'Sync now'}
          </button>
        )}
      </div>
      {syncError && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">
          {syncError}
        </div>
      )}
    </div>
  );
}
