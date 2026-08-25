import { evaluatePostDeployCanary, PerformanceMetrics, PostDeployEvaluationInput } from '../src/post-deploy-evaluator';

const baseline: PerformanceMetrics = {
  successRate: 0.95,
  latencyP99Ms: 300,
  errorRate: 0.02,
  throughputRps: 100,
  costPerSuccess: 0.10,
  auditCompleteness: 0.99,
};

function input(overrides: Partial<PostDeployEvaluationInput> = {}): PostDeployEvaluationInput {
  return {
    baselineCommit: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    candidateCommit: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    deploymentId: 'deploy-001',
    baseline,
    canary: {
      successRate: 0.97,
      latencyP99Ms: 250,
      errorRate: 0.015,
      throughputRps: 110,
      costPerSuccess: 0.09,
      auditCompleteness: 0.995,
    },
    sampleCount: 100,
    canaryTrafficPercent: 10,
    healthPassed: true,
    readinessPassed: true,
    observedAt: '2026-08-25T08:00:00.000Z',
    ...overrides,
  };
}

describe('post-deploy canary evaluator', () => {
  test('accepts a measured improvement as next-baseline evidence', () => {
    const result = evaluatePostDeployCanary(input());
    expect(result.status).toBe('PASS');
    expect(result.reason).toBe('POST_DEPLOY_IMPROVEMENT_VERIFIED');
    expect(result.data.recommendedAction).toBe('ACCEPT_NEXT_BASELINE');
    expect(result.data.nextBaselineEligible).toBe(true);
    expect(result.data.rollbackRecommended).toBe(false);
    expect(result.data.monitoringAuthority).toBe('OBSERVATION_ONLY');
    expect(result.data.executionAuthority).toBe('DSG_CONTROL_PLANE');
    expect(result.data.evidenceHash).toMatch(/^[a-f0-9]{64}$/);
  });

  test('recommends rollback when a protected metric regresses', () => {
    const result = evaluatePostDeployCanary(input({
      canary: {
        ...baseline,
        successRate: 0.97,
        latencyP99Ms: 301,
        throughputRps: 110,
      },
    }));
    expect(result.status).toBe('BLOCK');
    expect(result.reason).toBe('PROTECTED_METRIC_REGRESSION');
    expect(result.data.regressions).toContain('LATENCY_P99_REGRESSION');
    expect(result.data.recommendedAction).toBe('ROLLBACK_RECOMMENDED');
    expect(result.data.rollbackRecommended).toBe(true);
    expect(result.data.nextBaselineEligible).toBe(false);
  });

  test('recommends rollback when health or readiness fails', () => {
    const result = evaluatePostDeployCanary(input({ healthPassed: false }));
    expect(result.status).toBe('BLOCK');
    expect(result.reason).toBe('POST_DEPLOY_HEALTH_FAILED');
    expect(result.data.regressions).toContain('HEALTH_CHECK_FAILED');
    expect(result.data.recommendedAction).toBe('ROLLBACK_RECOMMENDED');
  });

  test('holds a neutral deployment instead of promoting it as a new baseline', () => {
    const result = evaluatePostDeployCanary(input({ canary: { ...baseline } }));
    expect(result.status).toBe('REVIEW');
    expect(result.reason).toBe('NO_MEASURED_POST_DEPLOY_IMPROVEMENT');
    expect(result.data.recommendedAction).toBe('HOLD_REVIEW');
    expect(result.data.nextBaselineEligible).toBe(false);
  });

  test('requires enough canary samples before accepting an improvement', () => {
    const result = evaluatePostDeployCanary(input({ sampleCount: 5 }));
    expect(result.status).toBe('REVIEW');
    expect(result.reason).toBe('CANARY_EVIDENCE_INSUFFICIENT');
    expect(result.data.recommendedAction).toBe('HOLD_REVIEW');
    expect(result.data.nextBaselineEligible).toBe(false);
  });

  test('fails closed when baseline and candidate commits are the same', () => {
    const same = 'cccccccccccccccccccccccccccccccccccccccc';
    const result = evaluatePostDeployCanary(input({ baselineCommit: same, candidateCommit: same }));
    expect(result.status).toBe('BLOCK');
    expect(result.reason).toBe('BASELINE_CANDIDATE_COMMIT_EQUAL');
    expect(result.data.rollbackRecommended).toBe(true);
  });

  test('evidence hash is independent of observation timestamp', () => {
    const first = evaluatePostDeployCanary(input({ observedAt: '2026-08-25T08:00:00.000Z' }));
    const second = evaluatePostDeployCanary(input({ observedAt: '2026-08-25T09:00:00.000Z' }));
    expect(first.data.evidenceHash).toBe(second.data.evidenceHash);
  });
});
