import type { PullRequestData } from '@sprintos/types';
import { parseGithubSlug } from '@sprintos/shared';

export function parsePrNumber(url: string): { slug: string; number: number } | null {
  const slug = parseGithubSlug(url);
  const num = url.match(/\/pull\/(\d+)/);
  if (!slug || !num) return null;
  return { slug, number: Number(num[1]) };
}

function pullRequestHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'SprintOS',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

function mapPullRequestResponse(slug: string, number: number, pr: Record<string, unknown>): PullRequestData {
  return {
    url: pr.html_url as string,
    owner: slug.split('/')[0],
    repo: slug.split('/')[1],
    number,
    state: pr.state as 'open' | 'closed',
    merged: pr.merged_at != null,
    authorLogin: (pr.user as { login?: string } | undefined)?.login,
    additions: pr.additions as number | undefined,
    deletions: pr.deletions as number | undefined,
    changedFiles: pr.changed_files as number | undefined,
    changedLines: ((pr.additions as number | undefined) ?? 0) + ((pr.deletions as number | undefined) ?? 0),
    createdAt: pr.created_at as string | undefined,
    updatedAt: pr.updated_at as string | undefined,
  };
}

export async function fetchPullRequest(token: string, slug: string, number: number): Promise<PullRequestData> {
  const url = `https://api.github.com/repos/${slug}/pulls/${number}`;
  let res = await fetch(url, { headers: pullRequestHeaders(token) });

  // Public repos: fall back to unauthenticated fetch when token is rejected or missing scopes.
  if (!res.ok && token) {
    res = await fetch(url, { headers: pullRequestHeaders() });
  }

  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  const pr = (await res.json()) as Record<string, unknown>;
  return mapPullRequestResponse(slug, number, pr);
}
