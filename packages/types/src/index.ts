export type OwnerParty = 'product' | 'developer' | 'lead' | 'qa' | 'merge' | 'done' | 'unknown';
export type RepoType = 'oss' | 'enterprise' | 'unknown';
export type PlanningMode = 'planned' | 'not-touching' | 'defer' | 'watch' | 'force-include';

export interface PersonRef {
  accountId: string;
  displayName: string;
}

export interface PullRequestData {
  url: string;
  owner?: string;
  repo?: string;
  number?: number;
  state?: 'open' | 'closed';
  merged?: boolean;
  authorLogin?: string;
  additions?: number;
  deletions?: number;
  changedFiles?: number;
  changedLines?: number;
  reviewsRequested?: number;
  approvals?: number;
  createdAt?: string;
  updatedAt?: string;
  repoType?: RepoType;
  incomplete?: boolean;
}

export interface DependencyState {
  type: OwnerParty | 'external' | 'unknown';
  blocked: boolean;
  note?: string;
  since?: string;
}

export interface Ticket {
  id: string;
  key: string;
  summary: string;
  status: string;
  statusCategory?: string;
  priority?: string;
  storyPoints: number;
  assignee?: PersonRef;
  qaAssignee?: PersonRef;
  team?: string;
  sprintId: string;
  sprintDayCreated?: number;
  operationalOwner: OwnerParty;
  ownerReason: string;
  dependency?: DependencyState;
  pr?: PullRequestData;
  jiraUpdatedAt: string;
  firstSeenAt: string;
  lastSeenAt: string;
  flags: TicketFlag[];
}

export interface TicketFlag {
  label: string;
  reason: string;
  severity: 'info' | 'watch' | 'warning' | 'urgent';
}

export interface Sprint {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  freezeDay: number;
  workingDays: number;
}

export interface SprintConfig {
  workingDays: number;
  freezeDay: number;
  hoursPerPoint: number;
  capacity: {
    developerHoursPerDay: number;
    leadReviewHoursPerDay: number;
    additionalReviewHoursPerDay: number;
    qaHoursPerDay: number;
  };
  thresholds: {
    developerPrExpectedByDay: number;
    leadReviewSlaWorkingDays: number;
    staleWatchDays: number;
    staleWarningDays: number;
    staleUrgentDays: number;
  };
  estimates: {
    baseReviewHours: number;
    mergeHours: number;
    fileReviewFactor: number;
    maxFileReviewFactor: number;
    linesPerReviewUnit: number;
    lineReviewFactor: number;
    maxLineReviewFactor: number;
  };
}

export type TeamMemberRole = 'developer' | 'qa' | 'lead' | 'merge' | 'product';

export interface TeamMember {
  jiraAccountId: string;
  displayName: string;
  roles: TeamMemberRole[];
  /** Defaults to sprint.capacity.developerHoursPerDay when unset. */
  hoursPerDay?: number;
}

export interface AppConfig {
  jira: {
    url: string;
    email: string;
    token: string;
    teamField: string;
    prField: string;
    sprintField: string;
    storyPointFields: string[];
    /** When set, only consider sprints and tickets from this Jira project (e.g. BRU). */
    projectKey?: string;
    /** When set, only sync tickets assigned to this Jira team (customfield_10392). */
    teamName?: string;
    /** When set, sync this Jira sprint instead of auto-picking the first active one. */
    activeSprintId?: number;
    /** Jira user picker for QA assignee (e.g. customfield_10727). */
    qaField?: string;
  };
  github: { token: string };
  repos: { oss: string[]; enterprise: string[] };
  people: {
    lead: { jiraAccountId: string; actsAsDeveloper: boolean };
    additionalReview: { jiraAccountId: string };
  };
  roles: { pmLabel: string; additionalReviewLabel: string };
  statusOwnerMap: Record<string, OwnerParty>;
  sprint: SprintConfig;
  teamMembers?: TeamMember[];
}

export interface ChangeEvent {
  id?: number;
  ticketKey: string;
  type: string;
  beforeValue?: string;
  afterValue?: string;
  detectedAt: string;
}

export interface OwnershipEvent {
  id?: number;
  ticketKey: string;
  fromOwner: OwnerParty;
  toOwner: OwnerParty;
  reason: string;
  detectedAt: string;
}

export interface PlanningOverride {
  ticketKey: string;
  mode: PlanningMode;
  note?: string;
  updatedAt: string;
}

export interface SyncStatus {
  lastSyncAt?: string;
  lastSuccessAt?: string;
  status: 'idle' | 'syncing' | 'success' | 'partial' | 'failed';
  jiraIssueCount?: number;
  githubPrCount?: number;
  errorMessage?: string;
  isFirstSync?: boolean;
  sprint?: Sprint;
  sprintDay?: number;
  workingDaysUntilFreeze?: number;
  /** Jira status names seen on tickets but missing from statusOwnerMap. */
  unmappedStatuses?: string[];
}

export interface BriefPayload {
  sync: SyncStatus;
  changed: ChangeEvent[];
  needsMe: BriefItem[];
  attentionByParty: Record<string, number>;
  forecast: ForecastRow[];
  personForecast: ForecastRow[];
  todaysCalls: BriefItem[];
  overallLabel?: string;
  overallReason?: string;
}

export interface BriefItem {
  ticketKey?: string;
  label: string;
  reason: string;
}

export interface ForecastRow {
  party: string;
  loadHours: number;
  capacityHours: number;
  utilizationPct: number;
  status: 'ok' | 'tight' | 'overload';
}
