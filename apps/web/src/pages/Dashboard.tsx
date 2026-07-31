import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { SprintData } from '@sprintos/types';
import { api } from '../lib/api.js';

interface DashboardStats {
  imported: number;
  committed: number;
  deferred: number;
  totalCapacity: number;
  remainingCapacity: number;
  reviewQueue: SprintData['tickets'];
  blockedTickets: SprintData['tickets'];
}

export default function Dashboard() {
  const [sprintId, setSprintId] = useState('48');

  const dashboard = useQuery({
    queryKey: ['dashboard', sprintId],
    queryFn: () => api.get<DashboardStats>(`/sprints/${sprintId}/dashboard`),
    retry: false
  });

  return (
    <div className="mx-auto max-w-4xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">SprintOS</h1>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          Sprint
          <input
            className="w-20 rounded border border-slate-300 px-2 py-1"
            value={sprintId}
            onChange={(e) => setSprintId(e.target.value)}
          />
        </label>
      </header>

      {dashboard.isError && (
        <p className="rounded bg-amber-50 p-4 text-sm text-amber-800">
          {(dashboard.error as Error).message} — import this sprint from Jira first.
        </p>
      )}

      {dashboard.data && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat label="Imported points" value={dashboard.data.imported} />
          <Stat label="Committed points" value={dashboard.data.committed} />
          <Stat label="Deferred points" value={dashboard.data.deferred} />
          <Stat label="Total capacity" value={dashboard.data.totalCapacity} />
          <Stat label="Remaining capacity" value={dashboard.data.remainingCapacity} />
          <Stat label="Blocked tickets" value={dashboard.data.blockedTickets.length} />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}
