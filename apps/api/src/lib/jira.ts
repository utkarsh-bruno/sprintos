import type { AppConfig } from '@sprintos/types';

type JiraConfig = AppConfig['jira'];

interface JiraIssue {
  key: string;
  fields?: Record<string, unknown>;
}

interface JiraSprintRef {
  id: number;
  name: string;
  state: 'active' | 'future' | 'closed';
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

export interface JiraIssueSnapshot {
  jiraId: string;
  summary?: string;
  status?: string;
  team?: string;
  assignee?: string;
  storyPoints?: number;
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

// The Agile /board/{id}/sprint listing came back empty on this instance's
// scrum boards (permission or board-linking gap, not worth chasing) — reading
// sprint refs directly off recent issues' Sprint field works reliably instead.
export async function listSprints(config: JiraConfig): Promise<JiraSprintRef[]> {
  const base = jiraBase(config);

  const res = await fetch(`${base}/rest/api/3/search/jql`, {
    method: 'POST',
    headers: { ...authHeaders(config), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jql: `"Sprint" is not EMPTY ORDER BY updated DESC`,
      maxResults: 100,
      fields: [config.sprintField]
    })
  });
  if (!res.ok) {
    throw new Error(`Jira request failed: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as { issues: JiraIssue[] };

  const byId = new Map<number, JiraSprintRef>();
  for (const issue of data.issues) {
    const sprints = (issue.fields?.[config.sprintField] as JiraSprintRef[] | undefined) ?? [];
    for (const sprint of sprints) byId.set(sprint.id, sprint);
  }

  return [...byId.values()].sort(
    (a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || b.id - a.id
  );
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
      jql: '"Sprint" is not EMPTY ORDER BY updated DESC',
      maxResults: 100,
      fields: [config.teamField]
    })
  });
  if (!res.ok) throw new Error(`Jira request failed: ${res.status} ${res.statusText}`);
  const data = (await res.json()) as { issues: JiraIssue[] };
  return uniqueById(data.issues.flatMap((issue) => teamRefs(issue.fields?.[config.teamField])));
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

export async function fetchSprintIssues(config: JiraConfig, jiraSprintId: number): Promise<JiraIssueSnapshot[]> {
  const base = jiraBase(config);
  const headers = authHeaders(config);
  const issues: JiraIssue[] = [];
  let startAt = 0;
  const maxResults = 50;

  while (true) {
    const res = await fetch(
      `${base}/rest/agile/1.0/sprint/${jiraSprintId}/issue?startAt=${startAt}&maxResults=${maxResults}`,
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

  return issues.map((issue) => ({
    jiraId: issue.key,
    summary: typeof issue.fields?.summary === 'string' ? issue.fields.summary : undefined,
    status: (issue.fields?.status as { name?: string } | undefined)?.name,
    team: teamRefs(issue.fields?.[config.teamField])[0]?.name,
    assignee: (issue.fields?.assignee as { displayName?: string } | null | undefined)?.displayName,
    storyPoints: config.storyPointFields
      .map((f) => issue.fields?.[f])
      .find((v): v is number => typeof v === 'number'),
  }));
}
