import { CANONICAL_REPOSITORIES, observeCanonicalRepositories } from '../src/github-monitor';

describe('canonical repository observations', () => {
  test('returns PASS only when every canonical ref is actually observed', async () => {
    const fetcher = async () => new Response(JSON.stringify({ sha: 'a'.repeat(40) }), { status: 200, headers: { 'content-type': 'application/json' } });
    const result = await observeCanonicalRepositories('test-token', fetcher);
    expect(result.status).toBe('PASS');
    expect(result.data.consistent).toBe(true);
    expect(result.data.repositories).toHaveLength(CANONICAL_REPOSITORIES.length);
  });

  test('returns REVIEW when any repository is not observable', async () => {
    let call = 0;
    const fetcher = async () => {
      call += 1;
      return call === 3
        ? new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 })
        : new Response(JSON.stringify({ sha: 'b'.repeat(40) }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const result = await observeCanonicalRepositories(undefined, fetcher);
    expect(result.status).toBe('REVIEW');
    expect(result.data.consistent).toBe(false);
    expect(result.data.repositories.some((item) => item.reason === 'GITHUB_HTTP_404')).toBe(true);
  });
});
