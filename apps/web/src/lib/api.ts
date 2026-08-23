import type { AppConfig, BriefItem, BriefPayload, ChangeEvent, PlanningMode, PlanningOverride, SyncStatus, Ticket, TicketFlag } from '@sprintos/types';

export type TicketFilter =
  | 'all'
  | 'needs-attention'
  | 'my-queue'
  | 'product'
  | 'dev'
  | 'lead'
  | 'qa'
  | 'blocked'
  | 'new';

export interface TicketsListResponse {
  filter: TicketFilter;
  jiraUrl: string;
  tickets: Ticket[];
  planningOverrides: Record<string, PlanningOverride>;
}

export interface WhatIfImpactResponse {
  extraLoadHours: number;
  extraLoadByParty: Record<string, number>;
  recommendation?: BriefItem;
}

export interface ChangesResponse {
  events: ChangeEvent[];
}

export interface TicketDetailResponse {
  jiraUrl: string;
  ticket: Ticket;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `${res.status} ${res.statusText}`);
  }
  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  getBrief: () => request<BriefPayload>('/brief'),
  getStatus: () => request<SyncStatus>('/status'),
  sync: () => request<BriefPayload>('/sync', { method: 'POST', body: '{}' }),
  resetSyncData: () =>
    request<{
      snapshotsRemoved: number;
      ticketsRemoved: number;
      changeEventsRemoved: number;
      ownershipEventsRemoved: number;
      syncRunsRemoved: number;
    }>('/sync/reset', { method: 'POST', body: '{}' }),
  getChanges: () => request<ChangesResponse>('/changes'),
  getConfig: () => request<AppConfig>('/config'),
  putConfig: (body: Partial<AppConfig>) => request<{ ok: boolean }>('/config', { method: 'PUT', body: JSON.stringify(body) }),
  getTickets: (filter: TicketFilter = 'all') =>
    request<TicketsListResponse>(`/tickets?filter=${encodeURIComponent(filter)}`),
  getTicket: (key: string) => request<TicketDetailResponse>(`/tickets/${encodeURIComponent(key)}`),
  patchTicketPlanning: (key: string, mode: PlanningMode, note?: string) =>
    request<{ ok: boolean; override: PlanningOverride }>(
      `/tickets/${encodeURIComponent(key)}/planning`,
      { method: 'PATCH', body: JSON.stringify({ mode, ...(note ? { note } : {}) }) },
    ),
  getTicketWhatIf: (key: string) =>
    request<WhatIfImpactResponse>(`/tickets/${encodeURIComponent(key)}/what-if`),
};
