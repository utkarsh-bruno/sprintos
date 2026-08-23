import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { CapacityOverride, Member, RepositoryType, SprintData, SprintState, Team, Ticket } from '@sprintos/types';
import { SPRINT_LENGTH_DAYS } from '@sprintos/types';
import { reviewStagesFor } from '@sprintos/shared';
import { api } from '../lib/api.js';

interface DashboardStats {
  imported: number;
  committed: number;
  deferred: number;
  totalCapacity: number;
  remainingCapacity: number;
  reviewQueue: Ticket[];
}

interface SprintOption {
  id: number;
  name: string;
  state: SprintState;
}

interface JiraTeam {
  id: string;
  name: string;
}

interface JiraUser {
  id: string;
  name: string;
  email?: string;
}

const repositoryTypes: RepositoryType[] = ['OSS', 'Enterprise', 'Shared'];

export default function Dashboard() {
  const [sprintId, setSprintId] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'track' | 'capacity' | 'team'>('overview');
  const [teamFilter, setTeamFilter] = useState('');
  const [issueSearch, setIssueSearch] = useState('');
  const queryClient = useQueryClient();
  const jiraSprints = useQuery({ queryKey: ['jira-sprints'], queryFn: () => api.get<SprintOption[]>('/jira/sprints') });
  const savedSprints = useQuery({ queryKey: ['saved-sprints'], queryFn: () => api.get<SprintData[]>('/sprints') });
  const sprint = useQuery({ queryKey: ['sprint', sprintId], queryFn: () => api.get<SprintData>(`/sprints/${sprintId}`), enabled: Boolean(sprintId), retry: false });
  const dashboard = useQuery({ queryKey: ['dashboard', sprintId], queryFn: () => api.get<DashboardStats>(`/sprints/${sprintId}/dashboard`), enabled: Boolean(sprintId), retry: false });
  const teams = useQuery({ queryKey: ['teams'], queryFn: () => api.get<Team[]>('/teams') });
  const jiraTeams = useQuery({ queryKey: ['jira-teams'], queryFn: () => api.get<JiraTeam[]>('/jira/teams') });
  const jiraUsers = useQuery({ queryKey: ['jira-users'], queryFn: () => api.get<JiraUser[]>('/jira/users'), enabled: activeTab === 'team' || activeTab === 'overview' });
  const options = useMemo(() => mergeSprintOptions(jiraSprints.data ?? [], savedSprints.data ?? []), [jiraSprints.data, savedSprints.data]);
  const selected = options.find((item) => String(item.id) === sprintId);
  const members = useMemo(() => teams.data?.flatMap((team) => team.members) ?? [], [teams.data]);
  const availableTicketTeams = useMemo(
    () => [...new Set([
      ...(sprint.data?.tickets.flatMap((ticket) => ticket.team ? [ticket.team] : []) ?? []),
      ...(jiraTeams.data?.map((team) => team.name) ?? [])
    ])].sort(),
    [jiraTeams.data, sprint.data]
  );
  const filteredTickets = useMemo(() => {
    const search = issueSearch.trim().toLowerCase();
    return (sprint.data?.tickets ?? []).filter((ticket) => {
      const matchesTeam = !teamFilter || ticket.team === teamFilter;
      const matchesSearch = !search || ticket.jiraId.toLowerCase().includes(search) || ticket.summary?.toLowerCase().includes(search);
      return matchesTeam && matchesSearch;
    });
  }, [issueSearch, sprint.data, teamFilter]);
  const committedTickets = useMemo(() => (sprint.data?.tickets ?? []).filter((ticket) => ticket.committed), [sprint.data]);
  const refreshSprint = () => {
    queryClient.invalidateQueries({ queryKey: ['sprint', sprintId] });
    queryClient.invalidateQueries({ queryKey: ['dashboard', sprintId] });
    queryClient.invalidateQueries({ queryKey: ['saved-sprints'] });
  };
  const importSprint = useMutation({
    mutationFn: () => api.post<SprintData>(`/sprints/${sprintId}/import`, { jiraSprintId: Number(sprintId), name: selected?.name, state: selected?.state }),
    onSuccess: refreshSprint
  });
  const patchTicket = useMutation({
    mutationFn: ({ jiraId, patch }: { jiraId: string; patch: Partial<Ticket> }) => api.patch<Ticket>(`/sprints/${sprintId}/tickets/${encodeURIComponent(jiraId)}`, patch),
    onSuccess: refreshSprint
  });
  const saveOverrides = useMutation({ mutationFn: (overrides: CapacityOverride[]) => api.put<CapacityOverride[]>(`/sprints/${sprintId}/capacity-overrides`, overrides), onSuccess: refreshSprint });
  const saveNotes = useMutation({ mutationFn: (planningNotes: string) => api.patch(`/sprints/${sprintId}/planning-notes`, { planningNotes }), onSuccess: refreshSprint });
  const finalizePlan = useMutation({
    mutationFn: () => api.post<SprintData>(`/sprints/${sprintId}/finalize`, {}),
    onSuccess: () => { refreshSprint(); setActiveTab('track'); }
  });
  const startSprint = useMutation({
    mutationFn: () => api.post<SprintData>(`/sprints/${sprintId}/start`, {}),
    onSuccess: refreshSprint
  });

  useEffect(() => {
    if (activeTab === 'track' && sprint.data && !sprint.data.finalizedAt) setActiveTab('overview');
  }, [activeTab, sprint.data]);

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-400">Sprint planning</p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-50">SprintOS</h1>
          <p className="mt-1 text-sm text-slate-400">Commit deliberately. Keep Jira as the source of truth.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Sprint" className="field min-w-64" value={sprintId} onChange={(event) => setSprintId(event.target.value)}>
            <option value="">Select a sprint</option>
            <SprintOptions label="Current sprint" items={options.filter((item) => item.state === 'active')} />
            <SprintOptions label="Future sprint" items={options.filter((item) => item.state === 'future')} />
            <SprintOptions label="Past sprint" items={options.filter((item) => item.state === 'closed')} />
          </select>
          <button className="button button-primary" disabled={!sprintId || importSprint.isPending} onClick={() => importSprint.mutate()}>
            {importSprint.isPending ? 'Syncing…' : sprint.data ? 'Refresh from Jira' : 'Import from Jira'}
          </button>
        </div>
      </header>

      <nav className="tab-list" aria-label="Sprint workspace">
        <TabButton active={activeTab === 'overview'} onClick={() => setActiveTab('overview')}>Overview</TabButton>
        {sprint.data?.finalizedAt && <TabButton active={activeTab === 'track'} onClick={() => setActiveTab('track')}>Track</TabButton>}
        <TabButton active={activeTab === 'capacity'} onClick={() => setActiveTab('capacity')}>Capacity</TabButton>
        <TabButton active={activeTab === 'team'} onClick={() => setActiveTab('team')}>Team setup</TabButton>
      </nav>

      {activeTab !== 'team' && <>
        {jiraSprints.isError && <Notice tone="error">Jira sprint list is unavailable. You can still open any previously imported board.</Notice>}
        {importSprint.isError && <Notice tone="error">{(importSprint.error as Error).message}</Notice>}
        {!sprintId && <Notice>Select an active or future sprint to plan it.</Notice>}
        {sprintId && sprint.isError && !importSprint.isPending && <Notice>Import this sprint first to create its planning board.</Notice>}
      </>}

      {activeTab === 'overview' && sprint.data && dashboard.data && (
        <>
          <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-indigo-400">{selected?.state === 'active' ? 'Current sprint' : 'Future sprint'}</p><h2 className="text-xl font-semibold text-slate-50">{selected?.name ?? `Sprint #${sprintId}`}</h2></div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-slate-400">{sprint.data.tickets.length} Jira issues imported</p>
              <button className="button button-primary" disabled={finalizePlan.isPending || !committedTickets.length} onClick={() => finalizePlan.mutate()}>
                {finalizePlan.isPending ? 'Finalising…' : sprint.data.finalizedAt ? 'Re-finalise plan' : 'Finalise plan'}
              </button>
            </div>
          </section>
          {finalizePlan.isError && <Notice tone="error">{(finalizePlan.error as Error).message}</Notice>}
          {sprint.data.finalizedAt && <Notice>Plan finalised {new Date(sprint.data.finalizedAt).toLocaleString()}. Open Track to follow status movement{sprint.data.startedAt ? ` · sprint started ${new Date(sprint.data.startedAt).toLocaleDateString()}` : ''}.</Notice>}
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Metric label="Imported" value={dashboard.data.imported} /><Metric label="Committed" value={dashboard.data.committed} emphasis /><Metric label="Deferred" value={dashboard.data.deferred} />
            <Metric label="Capacity" value={dashboard.data.totalCapacity} /><Metric label="Remaining" value={dashboard.data.remainingCapacity} danger={dashboard.data.remainingCapacity < 0} /><Metric label="Needs reviewers" value={dashboard.data.reviewQueue.length} />
          </section>
          <section className="panel flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
            <label className="flex-1 text-sm font-medium text-slate-300">Find Jira issue<input className="field mt-1 w-full" value={issueSearch} onChange={(event) => setIssueSearch(event.target.value)} placeholder="ID or summary, e.g. BRU-3674" /></label>
            <label className="flex-1 text-sm font-medium text-slate-300">Jira team<select className="field mt-1 w-full" value={teamFilter} onChange={(event) => setTeamFilter(event.target.value)}><option value="">All teams</option>{availableTicketTeams.map((team) => <option key={team}>{team}</option>)}</select>{!availableTicketTeams.length && <span className="mt-1 block text-xs font-normal text-slate-400">No Jira teams found yet.</span>}</label>
            {(teamFilter || issueSearch) && <button className="button button-secondary" onClick={() => { setTeamFilter(''); setIssueSearch(''); }}>Clear filters</button>}
          </section>
          {dashboard.data.remainingCapacity < 0 && <Notice tone="error">Commitments exceed capacity by {Math.abs(dashboard.data.remainingCapacity)} points. Defer work or revise the team’s capacity.</Notice>}
          <section className="grid gap-5 xl:grid-cols-2">
            <TicketColumn title="Committed" description="Work the team has agreed to deliver." tickets={filteredTickets.filter((ticket) => ticket.committed)} empty="No committed issues match these filters." users={jiraUsers.data ?? []} onPatch={(jiraId, patch) => patchTicket.mutate({ jiraId, patch })} busy={patchTicket.isPending} />
            <TicketColumn title="Deferred" description="Imported work that is not part of the sprint commitment." tickets={filteredTickets.filter((ticket) => !ticket.committed)} empty="No deferred issues match these filters." users={jiraUsers.data ?? []} onPatch={(jiraId, patch) => patchTicket.mutate({ jiraId, patch })} busy={patchTicket.isPending} />
          </section>
        </>
      )}

      {activeTab === 'track' && sprint.data?.finalizedAt && (
        <TrackingBoard
          tickets={committedTickets}
          startedAt={sprint.data.startedAt}
          onStart={() => startSprint.mutate()}
          starting={startSprint.isPending}
          startError={(startSprint.error as Error | null)?.message}
          onRefresh={() => importSprint.mutate()}
          refreshing={importSprint.isPending}
        />
      )}

      {activeTab === 'capacity' && sprint.data && dashboard.data && <section className="grid gap-5 xl:grid-cols-2"><CapacityPanel members={members} overrides={sprint.data.capacityOverrides} onSave={(overrides) => saveOverrides.mutate(overrides)} saving={saveOverrides.isPending} /><PlanningNotes initialValue={sprint.data.planningNotes ?? ''} onSave={(notes) => saveNotes.mutate(notes)} saving={saveNotes.isPending} /></section>}
      {activeTab === 'capacity' && !sprint.data && <Notice>Select and import a sprint first, then manage its capacity and notes here.</Notice>}
      {activeTab === 'team' && <TeamConfiguration teams={teams.data ?? []} jiraTeams={jiraTeams.data ?? []} jiraUsers={jiraUsers.data ?? []} loading={teams.isLoading || jiraTeams.isLoading || jiraUsers.isLoading} jiraError={(jiraTeams.error ?? jiraUsers.error) as Error | null} onChanged={() => { queryClient.invalidateQueries({ queryKey: ['teams'] }); queryClient.invalidateQueries({ queryKey: ['dashboard'] }); }} />}
    </main>
  );
}

function sprintProgress(startedAt: string) {
  const start = new Date(startedAt);
  start.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = Math.floor((today.getTime() - start.getTime()) / 86_400_000) + 1;
  return { day: Math.max(1, day), remaining: Math.max(0, SPRINT_LENGTH_DAYS - day), ended: day > SPRINT_LENGTH_DAYS };
}

function TrackingBoard({ tickets, startedAt, onStart, starting, startError, onRefresh, refreshing }: { tickets: Ticket[]; startedAt?: string; onStart: () => void; starting: boolean; startError?: string; onRefresh: () => void; refreshing: boolean }) {
  const byStatus = useMemo(() => {
    const groups = new Map<string, Ticket[]>();
    for (const ticket of tickets) {
      const status = ticket.status ?? 'No status';
      groups.set(status, [...(groups.get(status) ?? []), ticket]);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [tickets]);
  const moved = tickets.filter((ticket) => ticket.baselineStatus && ticket.status !== ticket.baselineStatus);
  const progress = startedAt ? sprintProgress(startedAt) : null;

  return (
    <>
      <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-indigo-400">Execution</p>
          <h2 className="text-xl font-semibold text-slate-50">Status tracking</h2>
          <p className="mt-1 text-sm text-slate-400">Committed issues by current Jira status. Refresh from Jira to pick up moves.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="button button-secondary" disabled={refreshing} onClick={onRefresh}>{refreshing ? 'Refreshing…' : 'Refresh from Jira'}</button>
          {!startedAt ? (
            <button className="button button-primary" disabled={starting} onClick={onStart}>{starting ? 'Starting…' : `Start sprint (${SPRINT_LENGTH_DAYS} days)`}</button>
          ) : (
            <div className={`metric-card px-4 py-2 ${progress?.ended ? 'border-amber-400/40 bg-amber-500/10' : 'border-indigo-400/40 bg-indigo-500/10'}`}>
              <p className="text-xs font-medium text-slate-400">{progress?.ended ? 'Sprint ended' : 'Sprint day'}</p>
              <p className="text-lg font-bold text-slate-50">{progress?.ended ? `${SPRINT_LENGTH_DAYS} / ${SPRINT_LENGTH_DAYS}` : `Day ${progress?.day} / ${SPRINT_LENGTH_DAYS}`}</p>
              {!progress?.ended && <p className="text-xs text-slate-400">{progress?.remaining} day{progress?.remaining === 1 ? '' : 's'} left</p>}
            </div>
          )}
        </div>
      </section>
      {startError && <Notice tone="error">{startError}</Notice>}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Committed" value={tickets.length} emphasis />
        <Metric label="Statuses" value={byStatus.length} />
        <Metric label="Moved" value={moved.length} danger={moved.length > 0} />
        <Metric label="Unchanged" value={tickets.length - moved.length} />
      </section>
      {moved.length > 0 && (
        <section className="panel overflow-hidden">
          <div className="panel-heading"><h3>Moved since finalise</h3></div>
          <div className="divide-y divide-slate-800">
            {moved.map((ticket) => (
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm" key={ticket.jiraId}>
                <div><span className="font-semibold text-indigo-300">{ticket.jiraId}</span><span className="ml-2 text-slate-300">{ticket.summary}</span></div>
                <p className="text-slate-400"><span className="text-slate-500">{ticket.baselineStatus}</span> → <span className="font-medium text-slate-100">{ticket.status}</span></p>
              </div>
            ))}
          </div>
        </section>
      )}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {byStatus.map(([status, items]) => (
          <div className="panel overflow-hidden" key={status}>
            <div className="panel-heading flex items-center justify-between gap-2"><h3>{status}</h3><span className="pill status-pill">{items.length}</span></div>
            <div className="space-y-2 p-3">
              {items.map((ticket) => {
                const shifted = Boolean(ticket.baselineStatus && ticket.baselineStatus !== ticket.status);
                return (
                  <article className={`rounded-lg border px-3 py-2 ${shifted ? 'border-amber-400/40 bg-amber-500/5' : 'border-slate-700/80 bg-slate-950/40'}`} key={ticket.jiraId}>
                    <p className="text-sm font-semibold text-indigo-300">{ticket.jiraId}</p>
                    <p className="mt-0.5 text-sm text-slate-300">{ticket.summary ?? 'Untitled'}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-400">
                      {ticket.assignee && <span>{ticket.assignee}</span>}
                      {ticket.reviewStage && <span className="pill repository-pill">{ticket.reviewStage}</span>}
                      {shifted && <span className="pill bg-amber-500/15 text-amber-200">was {ticket.baselineStatus}</span>}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        ))}
      </section>
      {!tickets.length && <Notice>No committed issues to track. Go back to Overview and commit work, then re-finalise.</Notice>}
    </>
  );
}

function mergeSprintOptions(remote: SprintOption[], saved: SprintData[]): SprintOption[] {
  const options = new Map(remote.map((item) => [item.id, item]));
  for (const sprint of saved) options.set(sprint.jiraSprintId, options.get(sprint.jiraSprintId) ?? { id: sprint.jiraSprintId, name: sprint.sprintName ?? `Sprint #${sprint.jiraSprintId}`, state: sprint.sprintState ?? 'future' });
  const stateRank: Record<SprintState, number> = { active: 0, future: 1, closed: 2 };
  return [...options.values()].sort((a, b) => stateRank[a.state] - stateRank[b.state] || b.id - a.id);
}

function SprintOptions({ label, items }: { label: string; items: SprintOption[] }) { return items.length ? <optgroup label={label}>{items.map((item) => <option key={item.id} value={item.id}>{item.name} · #{item.id}</option>)}</optgroup> : null; }
function TabButton({ active, children, onClick }: { active: boolean; children: string; onClick: () => void }) { return <button className={`tab-button ${active ? 'tab-button-active' : ''}`} aria-selected={active} onClick={onClick}>{children}</button>; }

function matchJiraUser(user: JiraUser, search: string): boolean {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  return user.name.toLowerCase().includes(q) || (user.email?.toLowerCase().includes(q) ?? false);
}

function JiraUserPicker({ users, value, onChange, disabled, placeholder = 'Search Jira users…', emptyLabel = 'No matching users', ariaLabel }: { users: JiraUser[]; value: string; onChange: (userId: string) => void; disabled?: boolean; placeholder?: string; emptyLabel?: string; ariaLabel: string }) {
  const [search, setSearch] = useState('');
  const matches = users.filter((user) => matchJiraUser(user, search));
  return <div className="space-y-2"><input aria-label={ariaLabel} className="field w-full py-1.5 text-xs" value={search} disabled={disabled} placeholder={placeholder} onChange={(event) => setSearch(event.target.value)} /><select aria-label={`${ariaLabel} results`} className="field w-full py-1.5 text-xs" value={value} disabled={disabled || !matches.length} onChange={(event) => onChange(event.target.value)}><option value="">{users.length ? (matches.length ? `Select user (${matches.length})` : emptyLabel) : 'Loading Jira users…'}</option>{matches.map((user) => <option key={user.id} value={user.id}>{user.name}{user.email ? ` · ${user.email}` : ''}</option>)}</select></div>;
}

function TicketColumn({ title, description, tickets, empty, users, onPatch, busy }: { title: string; description: string; tickets: Ticket[]; empty: string; users: JiraUser[]; onPatch: (jiraId: string, patch: Partial<Ticket>) => void; busy: boolean }) {
  return <section className="panel overflow-hidden"><div className="panel-heading flex items-start justify-between gap-3"><div><h3>{title}</h3><p className="mt-0.5 text-xs font-normal text-slate-400">{description}</p></div><span className="pill status-pill">{tickets.length} items</span></div><div className="space-y-3 bg-slate-950/40 p-3">{tickets.length ? tickets.map((ticket) => <TicketCard key={ticket.jiraId} ticket={ticket} users={users} onPatch={onPatch} busy={busy} />) : <p className="px-2 py-5 text-center text-sm text-slate-400">{empty}</p>}</div></section>;
}

function TicketCard({ ticket, users, onPatch, busy }: { ticket: Ticket; users: JiraUser[]; onPatch: (jiraId: string, patch: Partial<Ticket>) => void; busy: boolean }) {
  const repository = ticket.repository ?? 'Shared'; const stages = reviewStagesFor(repository);
  const reviewers = ticket.reviewers ?? [];
  const availableReviewers = users.filter((user) => !reviewers.includes(user.name));
  const addReviewer = (userId: string) => {
    const user = users.find((item) => item.id === userId);
    if (!user || reviewers.includes(user.name)) return;
    onPatch(ticket.jiraId, { reviewers: [...reviewers, user.name] });
  };
  return <article className="ticket-card"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-indigo-300">{ticket.jiraId}</p><h4 className="mt-1 text-sm font-medium leading-5 text-slate-200">{ticket.summary ?? 'Untitled Jira issue'}</h4>{ticket.assignee && <p className="mt-1 text-xs text-slate-400">Assignee · {ticket.assignee}</p>}</div><span className="shrink-0 rounded-lg bg-slate-800 px-2 py-1 text-xs font-semibold text-slate-300">{ticket.storyPoints ?? 0} pts</span></div><div className="mt-3 flex flex-wrap gap-2"><span className="pill status-pill">{ticket.status ?? 'No status'}</span>{ticket.team && <span className="pill bg-emerald-500/15 text-emerald-300">{ticket.team}</span>}<span className="pill repository-pill">{repository}</span></div><div className="mt-4 flex flex-wrap gap-2"><button className="button button-secondary px-2.5 py-1.5 text-xs" disabled={busy} onClick={() => onPatch(ticket.jiraId, { committed: !ticket.committed })}>{ticket.committed ? 'Defer' : 'Commit'}</button><select aria-label={`${ticket.jiraId} repository type`} className="field py-1.5 text-xs" value={repository} disabled={busy} onChange={(event) => { const type = event.target.value as RepositoryType; onPatch(ticket.jiraId, { repository: type, reviewStage: reviewStagesFor(type)[0] }); }}>{repositoryTypes.map((type) => <option key={type}>{type}</option>)}</select><select aria-label={`${ticket.jiraId} review stage`} className="field py-1.5 text-xs" value={ticket.reviewStage ?? stages[0]} disabled={busy} onChange={(event) => onPatch(ticket.jiraId, { reviewStage: event.target.value })}>{stages.map((stage) => <option key={stage}>{stage}</option>)}</select></div><div className="mt-3"><p className="text-xs font-medium text-slate-400">Reviewers</p>{reviewers.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{reviewers.map((name) => <span className="pill status-pill gap-1.5" key={name}>{name}<button type="button" className="text-slate-500 hover:text-red-400" aria-label={`Remove ${name}`} disabled={busy} onClick={() => onPatch(ticket.jiraId, { reviewers: reviewers.filter((reviewer) => reviewer !== name) })}>×</button></span>)}</div>}<select aria-label={`${ticket.jiraId} add reviewer`} className="field mt-2 w-full py-1.5 text-xs" value="" disabled={busy || !availableReviewers.length} onChange={(event) => addReviewer(event.target.value)}><option value="">{users.length ? 'Add reviewer' : 'Loading Jira users…'}</option>{availableReviewers.map((user) => <option key={user.id} value={user.id}>{user.name}{user.email ? ` · ${user.email}` : ''}</option>)}</select></div></article>;
}

function CapacityPanel({ members, overrides, onSave, saving }: { members: Member[]; overrides: CapacityOverride[]; onSave: (overrides: CapacityOverride[]) => void; saving: boolean }) {
  const [memberId, setMemberId] = useState(''); const [capacity, setCapacity] = useState(''); const [reason, setReason] = useState('');
  const save = () => { if (!memberId || !Number.isFinite(Number(capacity))) return; onSave([...overrides.filter((item) => item.memberId !== memberId), { memberId, effectiveCapacity: Number(capacity), reason: reason || undefined }]); setMemberId(''); setCapacity(''); setReason(''); };
  return <section className="panel p-5"><h3 className="text-sm font-semibold">Capacity overrides</h3><p className="mt-1 text-sm text-slate-400">Record leave, support rotations, or other exceptions for this sprint only.</p><div className="mt-4 space-y-2">{overrides.length ? overrides.map((item) => <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-950/50 px-3 py-2 text-sm" key={item.memberId}><span><strong>{members.find((member) => member.id === item.memberId)?.name ?? item.memberId}</strong> · {item.effectiveCapacity} pts {item.reason && <span className="text-slate-400">· {item.reason}</span>}</span><button className="text-xs font-medium text-slate-400 hover:text-red-400" disabled={saving} onClick={() => onSave(overrides.filter((override) => override.memberId !== item.memberId))}>Remove</button></div>) : <p className="text-sm text-slate-400">No overrides in this sprint.</p>}</div><div className="mt-4 grid gap-2 sm:grid-cols-3"><select className="field" value={memberId} onChange={(event) => setMemberId(event.target.value)}><option value="">Choose member</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name ?? member.id} · {member.capacity} pts</option>)}</select><input className="field" type="number" min="0" placeholder="Override points" value={capacity} onChange={(event) => setCapacity(event.target.value)} /><input className="field" placeholder="Reason (optional)" value={reason} onChange={(event) => setReason(event.target.value)} /></div><button className="button button-primary mt-3" disabled={saving || !memberId || capacity === ''} onClick={save}>Save override</button></section>;
}

function PlanningNotes({ initialValue, onSave, saving }: { initialValue: string; onSave: (notes: string) => void; saving: boolean }) { const [notes, setNotes] = useState(initialValue); useEffect(() => setNotes(initialValue), [initialValue]); return <section className="panel p-5"><h3 className="text-sm font-semibold">Planning notes</h3><p className="mt-1 text-sm text-slate-400">Capture risks, decisions, and dependencies alongside the commitment.</p><textarea className="field mt-4 min-h-36 w-full resize-y" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="e.g. Needs API review before the second week…" /><button className="button button-primary mt-3" disabled={saving} onClick={() => onSave(notes)}>Save notes</button></section>; }

function TeamConfiguration({ teams, jiraTeams, jiraUsers, loading, jiraError, onChanged }: { teams: Team[]; jiraTeams: JiraTeam[]; jiraUsers: JiraUser[]; loading: boolean; jiraError: Error | null; onChanged: () => void }) {
  const [name, setName] = useState(''); const [members, setMembers] = useState<Member[]>([]); const [memberId, setMemberId] = useState(''); const [memberCapacity, setMemberCapacity] = useState(''); const [editingName, setEditingName] = useState<string | null>(null);
  const saveTeam = useMutation({ mutationFn: (team: Team) => editingName ? api.put<Team>(`/teams/${encodeURIComponent(editingName)}`, team) : api.post<Team>('/teams', team), onSuccess: () => { setName(''); setMembers([]); setMemberId(''); setMemberCapacity(''); setEditingName(null); onChanged(); } });
  const removeTeam = useMutation({ mutationFn: (teamName: string) => api.delete(`/teams/${encodeURIComponent(teamName)}`), onSuccess: onChanged });
  const reset = () => { setEditingName(null); setName(''); setMembers([]); setMemberId(''); setMemberCapacity(''); };
  const save = () => { if (name) saveTeam.mutate({ name, members }); };
  const addMember = () => { const user = jiraUsers.find((item) => item.id === memberId); if (!user || !Number.isFinite(Number(memberCapacity))) return; setMembers((current) => [...current.filter((member) => member.id !== user.id), { id: user.id, name: user.name, capacity: Number(memberCapacity) }]); setMemberId(''); setMemberCapacity(''); };
  const edit = (team: Team) => { setEditingName(team.name); setName(team.name); setMembers(team.members); };
  const availableUsers = jiraUsers.filter((user) => !members.some((member) => member.id === user.id));
  return <section className="panel p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-semibold">Team configuration</h2><p className="mt-1 text-sm text-slate-400">Select Jira teams and Jira users, then set only each person’s sprint capacity.</p></div>{editingName && <button className="button button-secondary" onClick={reset}>Cancel edit</button>}</div>{jiraError && <p className="mt-3 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-200">Jira teams or users could not be loaded: {(jiraError as Error).message}</p>}<div className="mt-4 grid gap-3 md:grid-cols-2">{loading ? <p className="text-sm text-slate-400">Loading Jira teams and users…</p> : teams.map((team) => <article className="rounded-xl border border-slate-700 p-4" key={team.name}><div className="flex items-center justify-between gap-2"><h3 className="font-semibold text-slate-100">{team.name}</h3><div className="flex gap-3 text-xs font-medium"><button className="text-indigo-300 hover:text-indigo-200" onClick={() => edit(team)}>Edit</button><button className="text-slate-400 hover:text-red-400" onClick={() => removeTeam.mutate(team.name)}>Remove</button></div></div><p className="mt-2 text-sm text-slate-400">{team.members.map((member) => `${member.name ?? member.id} (${member.capacity})`).join(' · ') || 'No members added'}</p></article>)}</div><div className="mt-5 grid gap-3 md:grid-cols-2"><label className="text-sm font-medium text-slate-300">Jira team<select className="field mt-1 w-full" value={name} onChange={(event) => setName(event.target.value)}><option value="">Select a Jira team</option>{editingName && !jiraTeams.some((team) => team.name === editingName) && <option value={editingName}>{editingName}</option>}{jiraTeams.map((team) => <option key={team.id} value={team.name}>{team.name}</option>)}</select></label><div><p className="text-sm font-medium text-slate-300">Jira user</p><div className="mt-1"><JiraUserPicker ariaLabel="Jira user" users={availableUsers} value={memberId} onChange={setMemberId} disabled={loading} /></div><div className="mt-2 flex gap-2"><input className="field min-w-0 flex-1" type="number" min="0" placeholder="Capacity points" value={memberCapacity} onChange={(event) => setMemberCapacity(event.target.value)} /><button className="button button-secondary" disabled={!memberId || memberCapacity === ''} onClick={addMember}>Add person</button></div></div></div><div className="mt-4 space-y-2">{members.map((member) => <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-950/50 px-3 py-2 text-sm" key={member.id}><span className="min-w-40 flex-1 font-medium text-slate-300">{member.name ?? member.id}</span><input aria-label={`${member.name ?? member.id} capacity`} className="field w-32 py-1" type="number" min="0" value={member.capacity} onChange={(event) => setMembers((current) => current.map((item) => item.id === member.id ? { ...item, capacity: Number(event.target.value) } : item))} /><span className="text-slate-400">points</span><button className="text-xs font-medium text-slate-400 hover:text-red-400" onClick={() => setMembers((current) => current.filter((item) => item.id !== member.id))}>Remove</button></div>)}</div><button className="button button-primary mt-4" disabled={saveTeam.isPending || !name} onClick={save}>{editingName ? 'Save team' : 'Add team'}</button>{saveTeam.isError && <p className="mt-2 text-sm text-red-400">{(saveTeam.error as Error).message}</p>}</section>;
}
function Metric({ label, value, emphasis, danger }: { label: string; value: number; emphasis?: boolean; danger?: boolean }) { return <div className={`metric-card ${emphasis ? 'border-indigo-400/40 bg-indigo-500/10' : ''} ${danger ? 'border-red-400/40 bg-red-500/10' : ''}`}><p className="text-xs font-medium text-slate-400">{label}</p><p className={`mt-1 text-2xl font-bold ${danger ? 'text-red-400' : 'text-slate-50'}`}>{value}</p></div>; }
function Notice({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'error' }) { return <p className={`rounded-xl border px-4 py-3 text-sm ${tone === 'error' ? 'border-red-400/40 bg-red-500/10 text-red-300' : 'border-amber-400/40 bg-amber-500/10 text-amber-200'}`}>{children}</p>; }
