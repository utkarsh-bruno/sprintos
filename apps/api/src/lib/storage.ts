import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Config, SprintData } from '@sprintos/types';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR ?? path.resolve(dirname, '../../../../data');

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(path.join(DATA_DIR, file), 'utf-8');
    return JSON.parse(raw) as T;
  } catch (err: any) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

async function writeJson(file: string, data: unknown): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(path.join(DATA_DIR, file), JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

export function readConfig(): Promise<Config> {
  return readJson<Config>('config.json', { jira: { url: '', email: '', token: '', teamField: '' }, teams: [] });
}

export function writeConfig(config: Config): Promise<void> {
  return writeJson('config.json', config);
}

export function readSprint(sprintId: string): Promise<SprintData | null> {
  return readJson<SprintData | null>(`sprint-${sprintId}.json`, null);
}

export function writeSprint(sprintId: string, data: SprintData): Promise<void> {
  return writeJson(`sprint-${sprintId}.json`, data);
}

export async function listSprints(): Promise<SprintData[]> {
  try {
    const files = await readdir(DATA_DIR);
    const sprintFiles = files.filter((file) => /^sprint-.+\.json$/.test(file));
    return (await Promise.all(sprintFiles.map((file) => readJson<SprintData | null>(file, null))))
      .filter((sprint): sprint is SprintData => sprint !== null)
      .sort((a, b) => b.jiraSprintId - a.jiraSprintId);
  } catch (err: any) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}
