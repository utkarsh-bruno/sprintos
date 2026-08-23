import type { BriefPayload, Ticket, TicketFlag } from '@sprintos/types';

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
  sync: () => request<BriefPayload>('/sync', { method: 'POST', body: '{}' }),
  getTickets: (filter: TicketFilter = 'all') =>
    request<TicketsListResponse>(`/tickets?filter=${encodeURIComponent(filter)}`),
  getTicket: (key: string) => request<TicketDetailResponse>(`/tickets/${encodeURIComponent(key)}`),
};
