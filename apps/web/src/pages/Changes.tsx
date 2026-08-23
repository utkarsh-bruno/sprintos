import { useQuery } from '@tanstack/react-query';
import type { ChangeEvent } from '@sprintos/types';
import { api } from '../lib/api.js';

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

function groupByDate(events: ChangeEvent[]): Map<string, ChangeEvent[]> {
  const groups = new Map<string, ChangeEvent[]>();
  for (const event of events) {
    const date = event.detectedAt.slice(0, 10);
    const list = groups.get(date) ?? [];
    list.push(event);
    groups.set(date, list);
  }
  return groups;
}

function formatDateHeading(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00`);
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default function Changes() {
  const { data, isLoading, error, isError } = useQuery({
    queryKey: ['changes'],
    queryFn: () => api.getChanges(),
    retry: false,
  });

  const grouped = data ? groupByDate(data.events) : new Map<string, ChangeEvent[]>();
  const dates = [...grouped.keys()].sort((a, b) => b.localeCompare(a));

  return (
    <section className="panel">
      <div className="panel-heading">Changes</div>

      {isLoading && (
        <div className="px-5 py-8 text-center text-sm text-slate-400">Loading change history…</div>
      )}

      {isError && (
        <div className="px-5 py-8 text-center text-sm text-slate-400">
          {error instanceof Error ? error.message : 'Failed to load changes'}
        </div>
      )}

      {data && data.events.length === 0 && (
        <div className="px-5 py-8 text-center text-sm text-slate-400">
          No change events yet — run a sync to start tracking.
        </div>
      )}

      {data && data.events.length > 0 && (
        <div className="divide-y divide-slate-800">
          {dates.map((date) => (
            <div key={date}>
              <h3 className="px-5 py-3 text-xs font-medium uppercase tracking-wide text-slate-500">
                {formatDateHeading(date)}
              </h3>
              <div className="divide-y divide-slate-800/60">
                {(grouped.get(date) ?? []).map((event, i) => (
                  <p
                    key={event.id ?? `${event.ticketKey}-${event.detectedAt}-${i}`}
                    className="px-5 py-3 text-sm text-slate-300"
                  >
                    <span className="mr-2 text-xs text-slate-500">
                      {new Date(event.detectedAt).toLocaleTimeString(undefined, {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {formatChange(event)}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
