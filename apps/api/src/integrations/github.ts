import type { PullRequestData } from '@sprintos/types';
import { parseGithubSlug } from '@sprintos/shared';

export function parsePrNumber(url: string): { slug: string; number: number } | null {
  const slug = parseGithubSlug(url);
  const num = url.match(/\/pull\/(\d+)/);
  if (!slug || !num) return null;
  return { slug, number: Number(num[1]) };
}

export async function fetchPullRequest(token: string, slug: string, number: number): Promise<PullRequestData> {
  const res = await fetch(`https://api.github.com/repos/${slug}/pulls/${number}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'SprintOS' }
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  const pr = await res.json();
  return {
    url: pr.html_url,
    owner: slug.split('/')[0],
    repo: slug.split('/')[1],
    number,
    state: pr.state,
    merged: pr.merged_at != null,
    authorLogin: pr.user?.login,
    additions: pr.additions,
    deletions: pr.deletions,
    changedFiles: pr.changed_files,
    changedLines: (pr.additions ?? 0) + (pr.deletions ?? 0),
    createdAt: pr.created_at,
    updatedAt: pr.updated_at
  };
}
