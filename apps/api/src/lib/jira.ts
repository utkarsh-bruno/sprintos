import type { JiraConfig, Ticket } from '@sprintos/types';

// ponytail: story point field id varies per Jira instance; trying common ones.
// Add a configurable field id to JiraConfig if a customer's instance isn't covered.
const STORY_POINT_FIELDS = ['customfield_10016', 'customfield_10002', 'storyPoints'];

interface JiraIssue {
  key: string;
  fields: Record<string, unknown>;
}

export async function fetchSprintIssues(config: JiraConfig, jiraSprintId: number): Promise<Ticket[]> {
  if (!config.url || !config.token) {
    throw new Error('Jira not configured: set jira.url and jira.token in config.json');
  }

  const base = config.url.replace(/\/$/, '');
  const issues: JiraIssue[] = [];
  let startAt = 0;
  const maxResults = 50;

  while (true) {
    const res = await fetch(
      `${base}/rest/agile/1.0/sprint/${jiraSprintId}/issue?startAt=${startAt}&maxResults=${maxResults}`,
      { headers: { Authorization: `Bearer ${config.token}`, Accept: 'application/json' } }
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
    summary: typeof issue.fields.summary === 'string' ? issue.fields.summary : undefined,
    status: (issue.fields.status as { name?: string } | undefined)?.name,
    storyPoints: STORY_POINT_FIELDS.map((f) => issue.fields[f]).find(
      (v): v is number => typeof v === 'number'
    ),
    committed: false
  }));
}
