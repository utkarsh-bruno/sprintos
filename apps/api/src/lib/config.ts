import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AppConfig } from '@sprintos/types';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR ?? path.resolve(dirname, '../../../../data');

const DEFAULTS: AppConfig = {
  jira: {
    url: 'https://usebruno.atlassian.net',
    email: '',
    token: '',
    teamField: 'customfield_10392',
    prField: 'customfield_10454',
    sprintField: 'customfield_10020',
    storyPointFields: ['customfield_10016', 'customfield_11204'],
    projectKey: 'BRU',
    teamName: 'Commit Club',
    qaField: 'customfield_10727',
  },
  github: {
    token: '',
  },
  repos: {
    oss: ['usebruno/bruno'],
    enterprise: ['teambruno/bruno-enterprise-edition'],
  },
  people: {
    lead: {
      jiraAccountId: '',
      actsAsDeveloper: true,
    },
    additionalReview: {
      jiraAccountId: '',
    },
  },
  roles: {
    pmLabel: 'PM',
    additionalReviewLabel: 'Additional Review',
  },
  statusOwnerMap: {
    Planning: 'product',
    PLANNING: 'product',
    'Product Planning': 'product',
    'To Do': 'product',
    'In Progress': 'developer',
    'In Review': 'lead',
    'IN REVIEW': 'lead',
    'Peer review': 'lead',
    QA: 'qa',
    Testing: 'qa',
    UAT: 'qa',
    Staged: 'qa',
    Done: 'done',
    Merged: 'done',
  },
  sprint: {
    workingDays: 10,
    freezeDay: 8,
    hoursPerPoint: 5,
    capacity: {
      developerHoursPerDay: 8,
      leadReviewHoursPerDay: 8,
      additionalReviewHoursPerDay: 8,
      qaHoursPerDay: 8,
    },
    thresholds: {
      developerPrExpectedByDay: 6,
      leadReviewSlaWorkingDays: 1,
      staleWatchDays: 1,
      staleWarningDays: 2,
      staleUrgentDays: 3,
    },
    estimates: {
      baseReviewHours: 0.5,
      mergeHours: 0.5,
      fileReviewFactor: 0.05,
      maxFileReviewFactor: 1.5,
      linesPerReviewUnit: 500,
      lineReviewFactor: 0.25,
      maxLineReviewFactor: 2,
    },
  },
  teamMembers: [],
};

function deepMerge<T>(target: T, source: Partial<T>): T {
  if (source === null || typeof source !== 'object' || Array.isArray(source)) {
    return source as T;
  }

  const result = { ...target } as T;

  for (const key of Object.keys(source) as (keyof T)[]) {
    const sourceVal = source[key];
    if (sourceVal === undefined) continue;

    const targetVal = target[key];
    if (
      sourceVal !== null &&
      typeof sourceVal === 'object' &&
      !Array.isArray(sourceVal) &&
      targetVal !== null &&
      typeof targetVal === 'object' &&
      !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(targetVal, sourceVal as Partial<typeof targetVal>);
    } else {
      result[key] = sourceVal as T[keyof T];
    }
  }

  return result;
}

function isMaskedOrEmptyToken(value: string | undefined): boolean {
  return value === '••••••' || value === '';
}

export async function readAppConfig(): Promise<AppConfig> {
  try {
    const raw = await readFile(path.join(DATA_DIR, 'config.json'), 'utf-8');
    const fileConfig = JSON.parse(raw) as Partial<AppConfig>;
    return deepMerge(structuredClone(DEFAULTS), fileConfig);
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') {
      return structuredClone(DEFAULTS);
    }
    throw err;
  }
}

export async function writeAppConfig(config: AppConfig): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(path.join(DATA_DIR, 'config.json'), JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

export function redactConfig(config: AppConfig): AppConfig {
  return {
    ...config,
    jira: {
      ...config.jira,
      token: config.jira.token ? '••••••' : '',
    },
    github: {
      ...config.github,
      token: config.github.token ? '••••••' : '',
    },
  };
}

export async function mergeAppConfig(partial: Partial<AppConfig>): Promise<AppConfig> {
  const existing = await readAppConfig();
  const merged = deepMerge(existing, partial);

  if (partial.jira && isMaskedOrEmptyToken(partial.jira.token)) {
    merged.jira.token = existing.jira.token;
  }
  if (partial.github && isMaskedOrEmptyToken(partial.github.token)) {
    merged.github.token = existing.github.token;
  }

  if (partial.jira && 'activeSprintId' in partial.jira && partial.jira.activeSprintId == null) {
    delete merged.jira.activeSprintId;
  }

  return merged;
}
