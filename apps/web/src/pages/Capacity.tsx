import { useQuery } from '@tanstack/react-query';
import type { ForecastRow } from '@sprintos/types';
import { api } from '../lib/api.js';

function forecastBarColor(status: ForecastRow['status']): string {
  switch (status) {
    case 'bottleneck':
      return 'bg-rose-500';
    case 'tight':
      return 'bg-amber-400';
    default:
      return 'bg-emerald-500';
  }
}

function statusLabel(status: ForecastRow['status']): string {
  switch (status) {
    case 'bottleneck':
      return 'Bottleneck';
    case 'tight':
      return 'Tight';
    default:
      return 'OK';
  }
}

export default function Capacity() {
  const { data: brief, isLoading, error, isError } = useQuery({
    queryKey: ['brief'],
    queryFn: () => api.getBrief(),
    retry: false,
  });

  return (
    <section className="panel">
      <div className="panel-heading">Capacity</div>

      {isLoading && (
        <div className="px-5 py-8 text-center text-sm text-slate-400">Loading forecast…</div>
      )}

      {isError && (
        <div className="px-5 py-8 text-center text-sm text-slate-400">
          {error instanceof Error ? error.message : 'Failed to load capacity forecast'}
        </div>
      )}

      {brief && brief.forecast.length === 0 && (
        <div className="px-5 py-8 text-center text-sm text-slate-400">No forecast data available.</div>
      )}

      {brief && brief.forecast.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3 font-medium">Party</th>
                <th className="px-5 py-3 font-medium">Load (h)</th>
                <th className="px-5 py-3 font-medium">Capacity (h)</th>
                <th className="px-5 py-3 font-medium">Utilization</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {brief.forecast.map((row) => (
                <tr key={row.party} className="text-slate-300">
                  <td className="whitespace-nowrap px-5 py-3 font-medium text-slate-200">
                    {row.party}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3">{row.loadHours}</td>
                  <td className="whitespace-nowrap px-5 py-3">{row.capacityHours}</td>
                  <td className="whitespace-nowrap px-5 py-3">{row.utilizationPct}%</td>
                  <td className="px-5 py-3">
                    <div className="flex min-w-[12rem] items-center gap-3">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
                        <div
                          className={`h-full rounded-full ${forecastBarColor(row.status)}`}
                          style={{ width: `${Math.min(row.utilizationPct, 100)}%` }}
                        />
                      </div>
                      <span className="whitespace-nowrap text-xs text-slate-400">
                        {statusLabel(row.status)}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
