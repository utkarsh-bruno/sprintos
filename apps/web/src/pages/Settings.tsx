import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AppConfig, TeamMember, TeamMemberRole } from '@sprintos/types';
import { api } from '../lib/api.js';

type SettingsForm = {
  jiraUrl: string;
  jiraEmail: string;
  jiraToken: string;
  githubToken: string;
  leadAccountId: string;
  additionalReviewAccountId: string;
  prField: string;
  projectKey: string;
  teamName: string;
  activeSprintId: string;
};

const TEAM_ROLES: { value: TeamMemberRole; label: string }[] = [
  { value: 'developer', label: 'Developer' },
  { value: 'product', label: 'Product' },
  { value: 'qa', label: 'QA' },
  { value: 'lead', label: 'Lead' },
  { value: 'merge', label: 'Merge' },
];

function emptyTeamMember(): TeamMember {
  return {
    jiraAccountId: '',
    displayName: '',
    roles: ['developer'],
    hoursPerDay: 8,
  };
}

interface JiraSprintOption {
  id: number;
  name: string;
  state: string;
}

function configToForm(config: AppConfig): SettingsForm {
  return {
    jiraUrl: config.jira.url,
    jiraEmail: config.jira.email,
    jiraToken: config.jira.token,
    githubToken: config.github.token,
    leadAccountId: config.people.lead.jiraAccountId,
    additionalReviewAccountId: config.people.additionalReview.jiraAccountId,
    prField: config.jira.prField,
    projectKey: config.jira.projectKey ?? '',
    teamName: config.jira.teamName ?? '',
    activeSprintId: config.jira.activeSprintId != null ? String(config.jira.activeSprintId) : '',
  };
}

function formToPartialConfig(form: SettingsForm): Partial<AppConfig> {
  const trimmed = form.activeSprintId.trim();
  const activeSprintId = trimmed ? Number(trimmed) : null;
  return {
    jira: {
      url: form.jiraUrl,
      email: form.jiraEmail,
      token: form.jiraToken,
      prField: form.prField,
      projectKey: form.projectKey.trim() || undefined,
      teamName: form.teamName.trim() || undefined,
      activeSprintId: activeSprintId != null && !Number.isNaN(activeSprintId) ? activeSprintId : null,
    } as AppConfig['jira'],
    github: {
      token: form.githubToken,
    },
    people: {
      lead: {
        jiraAccountId: form.leadAccountId,
        actsAsDeveloper: true,
      },
      additionalReview: {
        jiraAccountId: form.additionalReviewAccountId,
      },
    },
  };
}

export default function Settings() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<SettingsForm | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [saved, setSaved] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  const { data, isLoading, error, isError } = useQuery({
    queryKey: ['config'],
    queryFn: () => api.getConfig(),
    retry: false,
  });

  const { data: jiraSprints } = useQuery({
    queryKey: ['jira-sprints'],
    queryFn: () => api.get<JiraSprintOption[]>('/jira/sprints'),
    retry: false,
    enabled: Boolean(data?.jira.url && data?.jira.email),
  });

  useEffect(() => {
    if (data) {
      setForm(configToForm(data));
      setTeamMembers(data.teamMembers ?? []);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: (partial: Partial<AppConfig>) => api.putConfig(partial),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['config'] });
      queryClient.removeQueries({ queryKey: ['brief'] });
      queryClient.removeQueries({ queryKey: ['status'] });
      queryClient.removeQueries({ queryKey: ['tickets'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 5000);
    },
  });

  const resetMutation = useMutation({
    mutationFn: () => api.resetSyncData(),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: ['brief'] });
      queryClient.removeQueries({ queryKey: ['status'] });
      queryClient.removeQueries({ queryKey: ['tickets'] });
      queryClient.removeQueries({ queryKey: ['changes'] });
      setResetDone(true);
      setTimeout(() => setResetDone(false), 8000);
    },
  });

  function updateField<K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    saveMutation.mutate({
      ...formToPartialConfig(form),
      teamMembers: teamMembers.filter(
        (m) => m.jiraAccountId.trim() && m.displayName.trim() && m.roles.length > 0,
      ),
    });
  }

  function updateTeamMember(index: number, patch: Partial<TeamMember>) {
    setTeamMembers((prev) =>
      prev.map((member, i) => (i === index ? { ...member, ...patch } : member)),
    );
  }

  function toggleTeamRole(index: number, role: TeamMemberRole) {
    setTeamMembers((prev) =>
      prev.map((member, i) => {
        if (i !== index) return member;
        const roles = member.roles.includes(role)
          ? member.roles.filter((r) => r !== role)
          : [...member.roles, role];
        return { ...member, roles: roles.length > 0 ? roles : [role] };
      }),
    );
  }

  async function importTeamFromSprint() {
    const ticketData = await api.getTickets('all');
    const existing = new Set(teamMembers.map((m) => m.jiraAccountId));
    const next = [...teamMembers];

    for (const ticket of ticketData.tickets) {
      if (ticket.assignee && !existing.has(ticket.assignee.accountId)) {
        existing.add(ticket.assignee.accountId);
        next.push({
          jiraAccountId: ticket.assignee.accountId,
          displayName: ticket.assignee.displayName,
          roles: ['developer'],
          hoursPerDay: 8,
        });
      }
      if (ticket.qaAssignee && !existing.has(ticket.qaAssignee.accountId)) {
        existing.add(ticket.qaAssignee.accountId);
        next.push({
          jiraAccountId: ticket.qaAssignee.accountId,
          displayName: ticket.qaAssignee.displayName,
          roles: ['qa'],
          hoursPerDay: 8,
        });
      }
    }

    setTeamMembers(next);
  }

  return (
    <section className="panel">
      <div className="panel-heading">Settings</div>

      {isLoading && (
        <div className="px-5 py-8 text-center text-sm text-slate-400">Loading configuration…</div>
      )}

      {isError && (
        <div className="px-5 py-8 text-center text-sm text-slate-400">
          {error instanceof Error ? error.message : 'Failed to load configuration'}
        </div>
      )}

      {form && (
        <form className="space-y-6 px-5 py-6" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Jira URL
              </span>
              <input
                className="field w-full"
                value={form.jiraUrl}
                onChange={(e) => updateField('jiraUrl', e.target.value)}
                placeholder="https://your-org.atlassian.net"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Jira email
              </span>
              <input
                className="field w-full"
                type="email"
                value={form.jiraEmail}
                onChange={(e) => updateField('jiraEmail', e.target.value)}
                placeholder="you@company.com"
              />
            </label>
            <label className="space-y-1.5 sm:col-span-2">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Jira API token
              </span>
              <input
                className="field w-full"
                type="password"
                value={form.jiraToken}
                onChange={(e) => updateField('jiraToken', e.target.value)}
                placeholder="••••••"
                autoComplete="off"
              />
            </label>
            <label className="space-y-1.5 sm:col-span-2">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                GitHub token
              </span>
              <input
                className="field w-full"
                type="password"
                value={form.githubToken}
                onChange={(e) => updateField('githubToken', e.target.value)}
                placeholder="••••••"
                autoComplete="off"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Lead Jira account ID
              </span>
              <input
                className="field w-full"
                value={form.leadAccountId}
                onChange={(e) => updateField('leadAccountId', e.target.value)}
                placeholder="712020:…"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Additional review Jira account ID
              </span>
              <input
                className="field w-full"
                value={form.additionalReviewAccountId}
                onChange={(e) => updateField('additionalReviewAccountId', e.target.value)}
                placeholder="712020:…"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Jira project key
              </span>
              <input
                className="field w-full"
                value={form.projectKey}
                onChange={(e) => updateField('projectKey', e.target.value.toUpperCase())}
                placeholder="BRU"
              />
              <p className="text-xs text-slate-500">
                Only sprints and tickets from this project (e.g. BRU, not CONT).
              </p>
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Jira team name
              </span>
              <input
                className="field w-full"
                value={form.teamName}
                onChange={(e) => updateField('teamName', e.target.value)}
                placeholder="Commit Club"
              />
              <p className="text-xs text-slate-500">
                Only tickets with this team ({`customfield_10392`}) are synced — e.g. Commit Club, not
                Silicon Squad.
              </p>
            </label>
            <label className="space-y-1.5 sm:col-span-2">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Active sprint (Jira)
              </span>
              <select
                className="field w-full"
                value={form.activeSprintId}
                onChange={(e) => updateField('activeSprintId', e.target.value)}
              >
                <option value="">Auto — first active sprint in Jira</option>
                {(jiraSprints ?? [])
                  .filter((s) => s.state === 'active' || s.state === 'future')
                  .map((s) => (
                    <option key={s.id} value={String(s.id)}>
                      {s.name} ({s.state})
                    </option>
                  ))}
              </select>
              <p className="text-xs text-slate-500">
                If tickets look wrong, pick your sprint here, save, then Sync on Current.
              </p>
            </label>
            <label className="space-y-1.5 sm:col-span-2">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Jira PR custom field ID
              </span>
              <input
                className="field w-full"
                value={form.prField}
                onChange={(e) => updateField('prField', e.target.value)}
                placeholder="customfield_10454"
              />
            </label>
          </div>

          <div className="border-t border-slate-800 pt-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-medium text-slate-200">Team roster</h3>
                <p className="mt-1 max-w-xl text-sm text-slate-400">
                  Map Jira people to roles and hours/day for per-person capacity on the Capacity
                  page.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setTeamMembers((prev) => [...prev, emptyTeamMember()])}
                >
                  Add person
                </button>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => void importTeamFromSprint()}
                >
                  Import from sprint
                </button>
              </div>
            </div>

            {teamMembers.length === 0 ? (
              <p className="mt-4 text-sm text-slate-400">
                No team members yet. Import from sprint or add manually.
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                {teamMembers.map((member, index) => (
                  <div
                    key={`${member.jiraAccountId || 'new'}-${index}`}
                    className="grid gap-3 rounded-xl border border-slate-800 bg-slate-900/40 p-4 sm:grid-cols-2 lg:grid-cols-12"
                  >
                    <label className="space-y-1 lg:col-span-3">
                      <span className="text-xs text-slate-500">Display name</span>
                      <input
                        className="field w-full"
                        value={member.displayName}
                        onChange={(e) => updateTeamMember(index, { displayName: e.target.value })}
                        placeholder="Gopu Raju"
                      />
                    </label>
                    <label className="space-y-1 lg:col-span-4">
                      <span className="text-xs text-slate-500">Jira account ID</span>
                      <input
                        className="field w-full"
                        value={member.jiraAccountId}
                        onChange={(e) => updateTeamMember(index, { jiraAccountId: e.target.value })}
                        placeholder="712020:…"
                      />
                    </label>
                    <label className="space-y-1 lg:col-span-2">
                      <span className="text-xs text-slate-500">Hours/day</span>
                      <input
                        className="field w-full"
                        type="number"
                        min={1}
                        max={24}
                        value={member.hoursPerDay ?? 8}
                        onChange={(e) =>
                          updateTeamMember(index, { hoursPerDay: Number(e.target.value) || 8 })
                        }
                      />
                    </label>
                    <div className="space-y-1 lg:col-span-2">
                      <span className="text-xs text-slate-500">Roles</span>
                      <div className="flex flex-wrap gap-2 pt-1">
                        {TEAM_ROLES.map((role) => (
                          <label key={role.value} className="flex items-center gap-1.5 text-xs">
                            <input
                              type="checkbox"
                              checked={member.roles.includes(role.value)}
                              onChange={() => toggleTeamRole(index, role.value)}
                            />
                            {role.label}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-end lg:col-span-1">
                      <button
                        type="button"
                        className="button button-secondary w-full text-xs"
                        onClick={() =>
                          setTeamMembers((prev) => prev.filter((_, i) => i !== index))
                        }
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {saveMutation.isError && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">
              {saveMutation.error instanceof Error
                ? saveMutation.error.message
                : 'Failed to save configuration'}
            </div>
          )}

          {saved && (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200">
              Configuration saved. Open <strong>Current</strong> and click <strong>Sync</strong> to
              refresh sprint data.
            </div>
          )}

          <button
            type="submit"
            className="button button-primary"
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? 'Saving…' : 'Save configuration'}
          </button>

          <div className="border-t border-slate-800 pt-6">
            <h3 className="text-sm font-medium text-slate-200">Sync data</h3>
            <p className="mt-2 max-w-xl text-sm text-slate-400">
              Clear snapshots, tickets, change history, and sync runs for a fresh baseline. Planning
              overrides are kept. Use this after changing team or project filters.
            </p>
            {resetDone && (
              <div className="mt-4 rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200">
                Sync data cleared. Open <strong>Current</strong> and click <strong>Sync</strong> to
                rebuild from Jira.
              </div>
            )}
            {resetMutation.isError && (
              <div className="mt-4 rounded-xl border border-rose-500/40 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">
                {resetMutation.error instanceof Error
                  ? resetMutation.error.message
                  : 'Failed to reset sync data'}
              </div>
            )}
            <button
              type="button"
              className="button button-secondary mt-4"
              disabled={resetMutation.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    'Clear all sync snapshots, tickets, and change history? Planning overrides will be kept.',
                  )
                ) {
                  resetMutation.mutate();
                }
              }}
            >
              {resetMutation.isPending ? 'Clearing…' : 'Reset sync data'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
