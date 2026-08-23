export type RepositoryType = 'OSS' | 'Enterprise' | 'Shared';
export type SprintState = 'active' | 'future' | 'closed';

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
  email: string;
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
  team?: string;
  assignee?: string;
  storyPoints?: number;
  repository?: RepositoryType;
  committed: boolean;
  author?: string;
  reviewers?: string[];
  reviewStage?: string;
  notes?: string;
  /** Status at plan finalize; used to detect movement during the sprint. */
  baselineStatus?: string;
}

export interface SprintData {
  sprintId: string;
  jiraSprintId: number;
  sprintName?: string;
  sprintState?: SprintState;
  tickets: Ticket[];
  capacityOverrides: CapacityOverride[];
  planningNotes?: string;
  finalizedAt?: string;
  startedAt?: string;
}

export const SPRINT_LENGTH_DAYS = 10;
