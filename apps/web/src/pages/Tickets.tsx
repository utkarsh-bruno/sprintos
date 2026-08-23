import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Ticket, TicketFlag } from '@sprintos/types';
import { api, type TicketFilter } from '../lib/api.js';

const FILTERS: { value: TicketFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'needs-attention', label: 'Needs attention' },
  { value: 'my-queue', label: 'My queue' },
  { value: 'product', label: 'Product' },
  { value: 'dev', label: 'Dev' },
  { value: 'lead', label: 'Lead' },
  { value: 'qa', label: 'QA' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'new', label: 'New' },
];

const SEVERITY_ORDER: Record<TicketFlag['severity'], number> = {
  urgent: 0,
  warning: 1,
  watch: 2,
  info: 3,
};

const OWNER_LABELS: Record<string, string> = {
  product: 'Product',
  developer: 'Developer',
  lead: 'Lead',
  qa: 'QA',
  merge: 'Merge',
  done: 'Done',
  unknown: 'Unknown',
};

function topFlag(flags: TicketFlag[]): TicketFlag | undefined {
  if (flags.length === 0) return undefined;
  return [...flags].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  )[0];
}

function flagSeverityClass(severity: TicketFlag['severity']): string {
  switch (severity) {
    case 'urgent':
      return 'text-rose-300';
    case 'warning':
      return 'text-amber-300';
    case 'watch':
      return 'text-yellow-200';
    default:
      return 'text-slate-300';
  }
}

function dependencyLabel(ticket: Ticket): string {
  if (!ticket.dependency) return '—';
  if (ticket.dependency.blocked) {
    const note = ticket.dependency.note ? `: ${ticket.dependency.note}` : '';
    return `Blocked (${ticket.dependency.type}${note})`;
  }
  return ticket.dependency.type;
}

function jiraBrowseUrl(jiraUrl: string, key: string): string {
  return `${jiraUrl.replace(/\/$/, '')}/browse/${key}`;
}

export default function Tickets() {
  const [filter, setFilter] = useState<TicketFilter>('all');

  const { data, isLoading, error, isError } = useQuery({
    queryKey: ['tickets', filter],
    queryFn: () => api.getTickets(filter),
    retry: false,
  });

  return (
    <section className="panel">
      <div className="panel-heading flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span>Tickets</span>
        <label className="flex items-center gap-2 text-xs font-normal text-slate-400">
          Filter
          <select
            className="field min-w-[10rem]"
            value={filter}
            onChange={(e) => setFilter(e.target.value as TicketFilter)}
          >
            {FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isLoading && (
        <div className="px-5 py-8 text-center text-sm text-slate-400">Loading tickets…</div>
      )}

      {isError && (
        <div className="px-5 py-8 text-center text-sm text-slate-400">
          {error instanceof Error ? error.message : 'Failed to load tickets'}
        </div>
      )}

      {data && data.tickets.length === 0 && (
        <div className="px-5 py-8 text-center text-sm text-slate-400">
          No tickets match this filter.
        </div>
      )}

      {data && data.tickets.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3 font-medium">Key</th>
                <th className="px-5 py-3 font-medium">Summary</th>
                <th className="px-5 py-3 font-medium">Priority</th>
                <th className="px-5 py-3 font-medium">Points</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Operational owner</th>
                <th className="px-5 py-3 font-medium">Dependency</th>
                <th className="px-5 py-3 font-medium">PR link</th>
                <th className="px-5 py-3 font-medium">Risk</th>
                <th className="px-5 py-3 font-medium">Next action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {data.tickets.map((ticket) => {
                const flag = topFlag(ticket.flags);
                const jiraUrl = jiraBrowseUrl(data.jiraUrl, ticket.key);

                return (
                  <tr
                    key={ticket.key}
                    className="cursor-pointer text-slate-300 hover:bg-slate-800/40"
                    onClick={() => window.open(jiraUrl, '_blank', 'noopener,noreferrer')}
                  >
                    <td className="whitespace-nowrap px-5 py-3 font-medium text-indigo-300">
                      {ticket.key}
                    </td>
                    <td className="max-w-xs truncate px-5 py-3 text-slate-200" title={ticket.summary}>
                      {ticket.summary}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3">{ticket.priority ?? '—'}</td>
                    <td className="whitespace-nowrap px-5 py-3">{ticket.storyPoints}</td>
                    <td className="whitespace-nowrap px-5 py-3">
                      <span className="pill status-pill">{ticket.status}</span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3">
                      {OWNER_LABELS[ticket.operationalOwner] ?? ticket.operationalOwner}
                    </td>
                    <td className="max-w-[10rem] truncate px-5 py-3" title={dependencyLabel(ticket)}>
                      {dependencyLabel(ticket)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3">
                      {ticket.pr?.url ? (
                        <a
                          href={ticket.pr.url}
                          className="text-indigo-300 hover:text-indigo-200"
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          PR
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {flag ? (
                        <span className={`font-medium ${flagSeverityClass(flag.severity)}`}>
                          {flag.label}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="max-w-xs truncate px-5 py-3 text-slate-400" title={flag?.reason}>
                      {flag?.reason ?? '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
