import type { CheckResult, MonitorStatus } from './types';

export interface CanonicalRepository {
  repo: string;
  branch: string;
}

export const CANONICAL_REPOSITORIES: readonly CanonicalRepository[] = [
  { repo: 'tdealer01-crypto/tdealer01-crypto-dsg-control-plane', branch: 'main' },
  { repo: 'tdealer01-crypto/dsg-one-v1', branch: 'main' },
  { repo: 'tdealer01-crypto/dsg-agi-simulation', branch: 'master' },
  { repo: 'tdealer01-crypto/DSG-Cinema-Proof-Agent', branch: 'main' },
  { repo: 'tdealer01-crypto/dsg-unified-data-monitoring', branch: 'main' },
] as const;

export interface RepoObservation {
  repository: string;
  branch: string;
  commitSha: string | null;
  status: MonitorStatus;
  reason: string;
  observedAt: string;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export async function observeCanonicalRepositories(
  token?: string,
  fetcher: FetchLike = fetch,
): Promise<CheckResult<{ repositories: RepoObservation[]; consistent: boolean }>> {
  const repositories: RepoObservation[] = [];

  for (const target of CANONICAL_REPOSITORIES) {
    const observedAt = new Date().toISOString();
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    try {
      const response = await fetcher(
        `https://api.github.com/repos/${target.repo}/commits/${encodeURIComponent(target.branch)}`,
        { headers },
      );
      if (!response.ok) {
        repositories.push({
          repository: target.repo,
          branch: target.branch,
          commitSha: null,
          status: 'REVIEW',
          reason: `GITHUB_HTTP_${response.status}`,
          observedAt,
        });
        continue;
      }
      const payload = await response.json() as { sha?: unknown };
      const sha = typeof payload.sha === 'string' ? payload.sha : null;
      repositories.push({
        repository: target.repo,
        branch: target.branch,
        commitSha: sha,
        status: sha ? 'PASS' : 'REVIEW',
        reason: sha ? 'REF_OBSERVED' : 'SHA_MISSING_FROM_RESPONSE',
        observedAt,
      });
    } catch (error) {
      repositories.push({
        repository: target.repo,
        branch: target.branch,
        commitSha: null,
        status: 'REVIEW',
        reason: `GITHUB_QUERY_EXCEPTION:${error instanceof Error ? error.name : 'UNKNOWN'}`,
        observedAt,
      });
    }
  }

  const consistent = repositories.every((item) => item.status === 'PASS');
  const observedAt = new Date().toISOString();
  return {
    status: consistent ? 'PASS' : 'REVIEW',
    reason: consistent ? 'ALL_CANONICAL_REFS_OBSERVED' : 'CANONICAL_REPO_VISIBILITY_INCOMPLETE',
    nextAction: consistent ? null : 'Bind a GitHub token with access to all canonical repositories and rerun.',
    data: { repositories, consistent },
    evidence: [{
      kind: 'github_ref',
      uri: 'github://canonical-repositories',
      observedAt,
      details: { authenticated: Boolean(token) },
    }],
  };
}
