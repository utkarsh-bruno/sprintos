export type RepositoryType = 'OSS' | 'Enterprise' | 'Shared';

export const REVIEW_STAGES: Record<RepositoryType, string[]> = {
  OSS: ['Peer', 'Lead'],
  Enterprise: ['Peer', 'Lead', 'Sid'],
  Shared: ['Peer', 'Lead', 'Sid']
};

export interface Member {
  id: string;
  name?: string;
  capacity: number;
  role?: string;
}

export interface Team {
  name: string;
  members: Member[];
}

export interface JiraConfig {
  url: string;
  token: string;
  teamField: string;
}

export interface Config {
  jira: JiraConfig;
  teams: Team[];
}

export interface CapacityOverride {
  memberId: string;
  effectiveCapacity: number;
  reason?: string;
}

export interface Ticket {
  jiraId: string;
  summary?: string;
  status?: string;
  storyPoints?: number;
  repository?: RepositoryType;
  committed: boolean;
  author?: string;
  reviewers?: string[];
  notes?: string;
}

export interface SprintData {
  sprintId: string;
  jiraSprintId: number;
  tickets: Ticket[];
  capacityOverrides: CapacityOverride[];
  planningNotes?: string;
}
