import type { SyncStatus } from '@sprintos/types';

export function SyncBanner({ sync }: { sync: SyncStatus }) {
  if (sync.status === 'failed') {
    if (sync.lastSuccessAt) {
      return (
        <div className="rounded-xl border border-amber-500/40 bg-amber-950/40 px-4 py-3 text-sm text-amber-100">
          Stale data — showing results from{' '}
          {new Date(sync.lastSuccessAt).toLocaleString()}.
          {sync.errorMessage ? ` Latest sync failed: ${sync.errorMessage}` : null}
        </div>
      );
    }
    return (
      <div className="rounded-xl border border-rose-500/40 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">
        Sync failed: {sync.errorMessage ?? 'Unknown error'}
      </div>
    );
  }

  if (sync.status === 'partial') {
    return (
      <div className="rounded-xl border border-amber-500/40 bg-amber-950/40 px-4 py-3 text-sm text-amber-100">
        Partial sync — {sync.errorMessage ?? 'Some data may be incomplete (e.g. GitHub PR metadata).'}
      </div>
    );
  }

  if (sync.unmappedStatuses && sync.unmappedStatuses.length > 0) {
    return (
      <div className="rounded-xl border border-amber-500/40 bg-amber-950/40 px-4 py-3 text-sm text-amber-100">
        Unmapped Jira statuses: {sync.unmappedStatuses.join(', ')}. Add them to{' '}
        <code className="text-amber-50">statusOwnerMap</code> in Settings (or config.json) then
        re-sync.
      </div>
    );
  }

  return null;
}
