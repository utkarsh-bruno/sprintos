import type { AppConfig } from '@sprintos/types';
import { parsePrUrls } from './pr-parser.js';

type JiraConfig = AppConfig['jira'];

interface JiraIssue {
  id: string;
  key: string;
  fields?: Record<string, unknown>;
}

export interface JiraSprintRef {
  id: number;
  name: string;
  state: 'active' | 'future' | 'closed';
}

export interface JiraSprintMeta {
  name: string;
  startDate?: string;
  endDate?: string;
}

export interface JiraTeamRef {
  id: string;
  name: string;
}

export interface JiraUserRef {
  id: string;
  name: string;
  email?: string;
}

export interface JiraTicketRaw {
  id: string;
  key: string;
  summary: string;
  status: string;
  statusCategory?: string;
  priority?: string;
  storyPoints: number;
  assignee?: { accountId: string; displayName: string };
  qaAssignee?: { accountId: string; displayName: string };
  team?: string;
  sprintId: string;
  jiraUpdatedAt: string;
  prUrls: string[];
}

function assertConfigured(config: JiraConfig) {
  if (!config.url || !config.email || !config.token) {
    throw new Error('Jira not configured: set jira.url, jira.email and jira.token in config.json');
  }
}

function authHeaders(config: JiraConfig) {
  const auth = Buffer.from(`${config.email}:${config.token}`).toString('base64');
  return { Authorization: `Basic ${auth}`, Accept: 'application/json' };
}

const STATE_ORDER: Record<JiraSprintRef['state'], number> = { active: 0, future: 1, closed: 2 };

function jiraBase(config: JiraConfig): string {
  assertConfigured(config);
  return config.url.replace(/\/$/, '');
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  return [...new Map(items.map((item) => [item.id, item])).values()].sort((a, b) =>
    a.id.localeCompare(b.id)
  );
}

function teamRefs(value: unknown): JiraTeamRef[] {
  if (Array.isArray(value)) return value.flatMap(teamRefs);
  if (typeof value === 'string' && value.trim()) return [{ id: value, name: value }];
  if (value && typeof value === 'object') {
    const team = value as { id?: unknown; name?: unknown; value?: unknown };
    const name = typeof team.name === 'string' ? team.name : typeof team.value === 'string' ? team.value : undefined;
    if (name) return [{ id: typeof team.id === 'string' ? team.id : name, name }];
  }
  return [];
}

function storyPointsFromFields(fields: Record<string, unknown>, storyPointFields: string[]): number {
  const value = storyPointFields
    .map((f) => fields[f])
    .find((v): v is number => typeof v === 'number');
  return value ?? 1;
}

function userRef(value: unknown): { accountId: string; displayName: string } | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || typeof candidate !== 'object') return undefined;
  const user = candidate as { accountId?: string; displayName?: string };
  if (!user.accountId || !user.displayName) return undefined;
  return { accountId: user.accountId, displayName: user.displayName };
}

function projectJqlClause(config: JiraConfig): string {
  const key = config.projectKey?.trim();
  return key ? `project = ${key} AND ` : '';
}

function issueInProject(key: string, config: JiraConfig): boolean {
  const projectKey = config.projectKey?.trim();
  if (!projectKey) return true;
  return key.toUpperCase().startsWith(`${projectKey.toUpperCase()}-`);
}

function issueMatchesTeam(fields: Record<string, unknown>, config: JiraConfig): boolean {
  const teamName = config.teamName?.trim();
  if (!teamName) return true;
  const teams = teamRefs(fields[config.teamField]);
  return teams.some((t) => t.name.toLowerCase() === teamName.toLowerCase());
}

function issueMatchesFilters(issue: JiraIssue, config: JiraConfig): boolean {
  if (!issueInProject(issue.key, config)) return false;
  return issueMatchesTeam(issue.fields ?? {}, config);
}

/** Filter persisted tickets by project/team config (handles stale rows from before filters applied). */
export function ticketMatchesJiraFilters(
  ticket: { key: string; team?: string },
  config: JiraConfig,
): boolean {
  if (!issueInProject(ticket.key, config)) return false;
  const teamName = config.teamName?.trim();
  if (!teamName) return true;
  if (!ticket.team) return false;
  return ticket.team.toLowerCase() === teamName.toLowerCase();
}

function sprintIssueFields(config: JiraConfig): string {
  const fields = [
    'summary',
    'status',
    'priority',
    'assignee',
    'updated',
    config.teamField,
    config.prField,
    ...config.storyPointFields,
  ];
  if (config.qaField?.trim()) {
    fields.push(config.qaField.trim());
  }
  return fields.join(',');
}

// The Agile /board/{id}/sprint listing came back empty on this instance's
// scrum boards (permission or board-linking gap, not worth chasing) — reading
// sprint refs directly off recent issues' Sprint field works reliably instead.
export async function listSprints(config: JiraConfig): Promise<JiraSprintRef[]> {
  const base = jiraBase(config);

  const res = await fetch(`${base}/rest/api/3/search/jql`, {
    method: 'POST',
    headers: { ...authHeaders(config), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jql: `${projectJqlClause(config)}"Sprint" is not EMPTY ORDER BY updated DESC`,
      maxResults: 100,
      fields: [config.sprintField, config.teamField]
    })
  });
  if (!res.ok) {
    throw new Error(`Jira request failed: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as { issues: JiraIssue[] };

  const byId = new Map<number, JiraSprintRef>();
  for (const issue of data.issues) {
    if (!issueMatchesFilters(issue, config)) continue;
    const sprints = (issue.fields?.[config.sprintField] as JiraSprintRef[] | undefined) ?? [];
    for (const sprint of sprints) byId.set(sprint.id, sprint);
  }

  return [...byId.values()].sort(
    (a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || b.id - a.id
  );
}

export async function fetchActiveSprint(config: JiraConfig): Promise<JiraSprintRef | null> {
  const sprints = await listSprints(config);
  if (config.activeSprintId != null) {
    const pinned = sprints.find((sprint) => sprint.id === config.activeSprintId);
    if (pinned) return pinned;
  }
  return sprints.find((sprint) => sprint.state === 'active') ?? null;
}

export async function fetchSprintMeta(config: AppConfig, jiraSprintId: number): Promise<JiraSprintMeta> {
  const res = await fetch(`${jiraBase(config.jira)}/rest/agile/1.0/sprint/${jiraSprintId}`, {
    headers: authHeaders(config.jira)
  });
  if (!res.ok) {
    throw new Error(`Jira request failed: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as { name?: unknown; startDate?: unknown; endDate?: unknown };
  return {
    name: typeof data.name === 'string' ? data.name : '',
    ...(typeof data.startDate === 'string' ? { startDate: data.startDate } : {}),
    ...(typeof data.endDate === 'string' ? { endDate: data.endDate } : {}),
  };
}

// Jira does not expose a universal Teams endpoint. The configured team custom
// field is the reliable source in this Jira instance, so we discover the teams
// already used by recent issues rather than introducing a second directory.
export async function listTeams(config: JiraConfig): Promise<JiraTeamRef[]> {
  const res = await fetch(`${jiraBase(config)}/rest/api/3/search/jql`, {
    method: 'POST',
    headers: { ...authHeaders(config), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      // A bare ORDER BY is rejected by Jira's JQL parser. Sprint is available
      // across this workspace and keeps discovery aligned with planning work.
      jql: `${projectJqlClause(config)}"Sprint" is not EMPTY ORDER BY updated DESC`,
      maxResults: 100,
      fields: [config.teamField]
    })
  });
  if (!res.ok) throw new Error(`Jira request failed: ${res.status} ${res.statusText}`);
  const data = (await res.json()) as { issues: JiraIssue[] };
  return uniqueById(
    data.issues
      .filter((issue) => issueMatchesFilters(issue, config))
      .flatMap((issue) => teamRefs(issue.fields?.[config.teamField])),
  );
}

export async function listUsers(config: JiraConfig, query = ''): Promise<JiraUserRef[]> {
  const params = new URLSearchParams({ query, maxResults: '1000' });
  // Unlike the assignable-user endpoint, this directory endpoint does not
  // require a project or issue context and is suitable for team setup.
  const res = await fetch(`${jiraBase(config)}/rest/api/3/user/search?${params}`, { headers: authHeaders(config) });
  if (!res.ok) throw new Error(`Jira request failed: ${res.status} ${res.statusText}`);
  const users = (await res.json()) as Array<{ accountId?: unknown; displayName?: unknown; emailAddress?: unknown }>;
  return uniqueById(users.flatMap((user) => {
    if (typeof user.accountId !== 'string' || typeof user.displayName !== 'string') return [];
    return [{ id: user.accountId, name: user.displayName, ...(typeof user.emailAddress === 'string' ? { email: user.emailAddress } : {}) }];
  }));
}

export async function fetchSprintTickets(
  config: AppConfig,
  jiraSprintId: number,
  sprintId: string
): Promise<JiraTicketRaw[]> {
  const base = jiraBase(config.jira);
  const headers = authHeaders(config.jira);
  const fields = sprintIssueFields(config.jira);
  const issues: JiraIssue[] = [];
  let startAt = 0;
  const maxResults = 50;

  while (true) {
    const res = await fetch(
      `${base}/rest/agile/1.0/sprint/${jiraSprintId}/issue?startAt=${startAt}&maxResults=${maxResults}&fields=${encodeURIComponent(fields)}`,
      { headers }
    );
    if (!res.ok) {
      throw new Error(`Jira request failed: ${res.status} ${res.statusText}`);
    }
    const page = (await res.json()) as { issues: JiraIssue[]; total: number };
    issues.push(...page.issues);
    startAt += page.issues.length;
    if (page.issues.length === 0 || startAt >= page.total) break;
  }

  return issues
    .filter((issue) => issueMatchesFilters(issue, config.jira))
    .map((issue) => {
    const issueFields = issue.fields ?? {};
    const status = issueFields.status as { name?: string; statusCategory?: { name?: string } } | undefined;
    const assignee = userRef(issueFields.assignee);
    const qaAssignee = config.jira.qaField?.trim()
      ? userRef(issueFields[config.jira.qaField.trim()])
      : undefined;
    const priority = issueFields.priority as { name?: string } | undefined;
    const team = teamRefs(issueFields[config.jira.teamField])[0]?.name;

    return {
      id: issue.id,
      key: issue.key,
      summary: typeof issueFields.summary === 'string' ? issueFields.summary : '',
      status: status?.name ?? '',
      ...(status?.statusCategory?.name ? { statusCategory: status.statusCategory.name } : {}),
      ...(priority?.name ? { priority: priority.name } : {}),
      storyPoints: storyPointsFromFields(issueFields, config.jira.storyPointFields),
      ...(assignee ? { assignee } : {}),
      ...(qaAssignee ? { qaAssignee } : {}),
      ...(team ? { team } : {}),
      sprintId,
      jiraUpdatedAt: typeof issueFields.updated === 'string' ? issueFields.updated : '',
      prUrls: parsePrUrls(issueFields[config.jira.prField]),
    };
  });
}
