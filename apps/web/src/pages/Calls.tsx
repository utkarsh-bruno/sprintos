import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { EmptySyncState } from '../components/EmptySyncState.js';

export default function Calls() {
  const { data: brief, isLoading, error, isError } = useQuery({
    queryKey: ['brief'],
    queryFn: () => api.getBrief(),
    retry: false,
  });

  return (
    <section className="panel">
      <div className="panel-heading">Today&apos;s calls</div>

      {isLoading && (
        <div className="px-5 py-8 text-center text-sm text-slate-400">Loading…</div>
      )}

      {isError && (
        <div className="px-5 py-4">
          <EmptySyncState
            message={
              error instanceof Error && !error.message.includes('404')
                ? error.message
                : 'No sync data yet — sync from Current first.'
            }
          />
        </div>
      )}

      {brief && brief.todaysCalls.length === 0 && (
        <div className="px-5 py-8 text-center text-sm text-slate-400">No urgent calls today.</div>
      )}

      {brief && brief.todaysCalls.length > 0 && (
        <div className="divide-y divide-slate-800">
          {brief.todaysCalls.map((call, i) => (
            <div key={`${call.ticketKey}-${i}`} className="px-5 py-3">
              <p className="text-sm font-medium text-slate-100">
                {call.ticketKey ? `${call.ticketKey}: ${call.label}` : call.label}
              </p>
              <p className="mt-0.5 text-sm text-slate-400">{call.reason}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
