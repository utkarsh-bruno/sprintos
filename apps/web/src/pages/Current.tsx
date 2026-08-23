import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BriefPayload, ChangeEvent, ForecastRow } from '@sprintos/types';
import { api } from '../lib/api.js';
import { EmptySyncState } from '../components/EmptySyncState.js';
import { SyncBanner } from '../components/SyncBanner.js';

function formatChange(event: ChangeEvent): string {
  const label = event.type.replace(/_/g, ' ');
  if (event.beforeValue && event.afterValue) {
    return `${event.ticketKey}: ${label} — ${event.beforeValue} → ${event.afterValue}`;
  }
  if (event.afterValue) {
    return `${event.ticketKey}: ${label} — ${event.afterValue}`;
  }
  return `${event.ticketKey}: ${label}`;
}

function forecastBarColor(status: ForecastRow['status']): string {
  switch (status) {
    case 'overload':
      return 'bg-rose-500';
    case 'tight':
      return 'bg-amber-400';
    default:
      return 'bg-emerald-500';
  }
}

export default function Current() {
  const queryClient = useQueryClient();

  const {
    data: brief,
    isLoading,
    error,
    isError,
  } = useQuery({
    queryKey: ['brief'],
    queryFn: () => api.getBrief(),
    retry: false,
  });

  const { data: syncStatus } = useQuery({
    queryKey: ['status'],
    queryFn: () => api.getStatus(),
    refetchInterval: (query) => (query.state.data?.status === 'syncing' ? 2000 : false),
  });

  const syncMutation = useMutation({
    mutationFn: () => api.sync(),
    onSuccess: (data) => {
      queryClient.setQueryData(['brief'], data);
      queryClient.invalidateQueries({ queryKey: ['status'] });
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
    },
  });

  const bannerSync = syncStatus ?? brief?.sync;

  if (isLoading) {
    return (
      <section className="panel">
        <div className="panel-heading">Current</div>
        <div className="px-5 py-8 text-center text-sm text-slate-400">Loading brief…</div>
      </section>
    );
  }

  if (isError || !brief) {
    return (
      <div className="space-y-4">
        <section className="app-header">
          <div>
            <h2 className="text-base font-semibold text-slate-100">Sprint brief</h2>
            <p className="text-sm text-slate-400">Sprint control cockpit</p>
          </div>
        </section>
        {bannerSync && <SyncBanner sync={bannerSync} />}
        <EmptySyncState
          message={
            error instanceof Error && !error.message.includes('404')
              ? error.message
              : 'No sync data yet.'
          }
          onSync={() => syncMutation.mutate()}
          syncing={syncMutation.isPending}
          syncError={
            syncMutation.isError
              ? syncMutation.error instanceof Error
                ? syncMutation.error.message
                : 'Sync failed'
              : null
          }
        />
      </div>
    );
  }

  const { sync } = brief;
  const sprint = sync.sprint;

  return (
    <div className="space-y-6">
      <section className="app-header">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-slate-100">
            {sprint?.name ?? 'Active sprint'}
          </h2>
          <p className="text-sm text-slate-400">
            {sprint && sync.sprintDay != null
              ? `Day ${sync.sprintDay} / ${sprint.workingDays}`
              : 'Sprint day unknown'}
            {sync.workingDaysUntilFreeze != null && sprint
              ? ` · ${sync.workingDaysUntilFreeze} working day${sync.workingDaysUntilFreeze === 1 ? '' : 's'} until day-${sprint.freezeDay} freeze`
              : null}
          </p>
          {brief.overallLabel && (
            <div className="pt-2">
              <span className="pill bg-indigo-500/20 text-indigo-200">{brief.overallLabel}</span>
              {brief.overallReason && (
                <p className="mt-1 max-w-2xl text-sm text-slate-400">{brief.overallReason}</p>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          <button
            type="button"
            className="button button-primary"
            disabled={syncMutation.isPending || syncStatus?.status === 'syncing'}
            onClick={() => syncMutation.mutate()}
          >
            {syncMutation.isPending || syncStatus?.status === 'syncing' ? 'Syncing…' : 'Sync'}
          </button>
          {(syncStatus?.lastSyncAt ?? sync.lastSyncAt) && (
            <p className="text-xs text-slate-500">
              Last sync {new Date((syncStatus?.lastSyncAt ?? sync.lastSyncAt)!).toLocaleString()}
            </p>
          )}
        </div>
      </section>

      {bannerSync && <SyncBanner sync={bannerSync} />}
      {syncMutation.isError && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">
          {syncMutation.error instanceof Error ? syncMutation.error.message : 'Sync failed'}
        </div>
      )}

      {sync.isFirstSync && (
        <div className="rounded-xl border border-indigo-500/30 bg-indigo-950/30 px-4 py-3 text-sm text-indigo-100">
          First sync complete — baseline established. Changes will appear from the next sync onward.
        </div>
      )}

      <section className="panel">
        <div className="panel-heading">What changed</div>
        <div className="divide-y divide-slate-800">
          {brief.changed.length === 0 ? (
            <p className="px-5 py-4 text-sm text-slate-400">No changes since last sync.</p>
          ) : (
            brief.changed.slice(0, 20).map((event, i) => (
              <p key={event.id ?? `${event.ticketKey}-${i}`} className="px-5 py-3 text-sm text-slate-300">
                {formatChange(event)}
              </p>
            ))
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">Needs me</div>
        <div className="divide-y divide-slate-800">
          {brief.needsMe.length === 0 ? (
            <p className="px-5 py-4 text-sm text-slate-400">Nothing in your queue right now.</p>
          ) : (
            brief.needsMe.map((item) => (
              <div key={item.ticketKey ?? item.label} className="px-5 py-3">
                <p className="text-sm font-medium text-slate-100">
                  {item.ticketKey ? `${item.ticketKey} — ${item.label}` : item.label}
                </p>
                <p className="mt-0.5 text-sm text-slate-400">{item.reason}</p>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">Needs attention by party</div>
        <div className="grid gap-3 px-5 py-4 sm:grid-cols-2 lg:grid-cols-3">
          {Object.keys(brief.attentionByParty).length === 0 ? (
            <p className="text-sm text-slate-400">No open operational owners.</p>
          ) : (
            Object.entries(brief.attentionByParty).map(([party, count]) => (
              <div key={party} className="metric-card">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{party}</p>
                <p className="mt-1 text-2xl font-semibold text-slate-100">{count}</p>
                <p className="text-xs text-slate-400">ticket{count === 1 ? '' : 's'}</p>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">Forecast to day {sprint?.freezeDay ?? 8}</div>
        <div className="space-y-4 px-5 py-4">
          {brief.forecast.length === 0 ? (
            <p className="text-sm text-slate-400">Forecast unavailable.</p>
          ) : (
            brief.forecast.map((row) => (
              <div key={row.party}>
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-slate-200">{row.party}</span>
                  <span className="text-xs text-slate-400">
                    {row.loadHours}h load / {row.capacityHours}h capacity ({row.utilizationPct}%)
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className={`h-full rounded-full transition-all ${forecastBarColor(row.status)}`}
                    style={{ width: `${Math.min(row.utilizationPct, 100)}%` }}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
