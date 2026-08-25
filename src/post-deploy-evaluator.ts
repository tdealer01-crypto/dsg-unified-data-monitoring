import crypto from 'node:crypto';
import type { CheckResult, EvidenceRef, MonitorStatus } from './types';

export interface PerformanceMetrics {
  successRate: number;
  latencyP99Ms: number;
  errorRate: number;
  throughputRps: number;
  costPerSuccess: number;
  auditCompleteness: number;
}

export interface PostDeployEvaluationInput {
  baselineCommit: string;
  candidateCommit: string;
  deploymentId: string;
  baseline: PerformanceMetrics;
  canary: PerformanceMetrics;
  sampleCount: number;
  canaryTrafficPercent: number;
  healthPassed: boolean;
  readinessPassed: boolean;
  observedAt: string;
}

export type PostDeployRecommendedAction =
  | 'ACCEPT_NEXT_BASELINE'
  | 'ROLLBACK_RECOMMENDED'
  | 'HOLD_REVIEW';

export interface MetricDelta {
  successRate: number;
  latencyP99Ms: number;
  errorRate: number;
  throughputRps: number;
  costPerSuccess: number;
  auditCompleteness: number;
}

export interface PostDeployEvaluationData {
  baselineCommit: string;
  candidateCommit: string;
  deploymentId: string;
  deltas: MetricDelta;
  improvements: string[];
  regressions: string[];
  sampleCount: number;
  canaryTrafficPercent: number;
  healthPassed: boolean;
  readinessPassed: boolean;
  evidenceHash: string;
  recommendedAction: PostDeployRecommendedAction;
  rollbackRecommended: boolean;
  nextBaselineEligible: boolean;
  monitoringAuthority: 'OBSERVATION_ONLY';
  executionAuthority: 'DSG_CONTROL_PLANE';
}

const MIN_SAMPLE_COUNT = 20;
const EPSILON = 1e-12;

function finiteMetricSet(metrics: PerformanceMetrics): boolean {
  return Object.values(metrics).every((value) => Number.isFinite(value));
}

function validMetricRanges(metrics: PerformanceMetrics): boolean {
  return metrics.successRate >= 0 && metrics.successRate <= 1 &&
    metrics.errorRate >= 0 && metrics.errorRate <= 1 &&
    metrics.auditCompleteness >= 0 && metrics.auditCompleteness <= 1 &&
    metrics.latencyP99Ms >= 0 &&
    metrics.throughputRps >= 0 &&
    metrics.costPerSuccess >= 0;
}

function stableEvidenceHash(input: PostDeployEvaluationInput): string {
  const canonical = {
    schemaVersion: 'dsg-post-deploy-evaluation-v1',
    baselineCommit: input.baselineCommit,
    candidateCommit: input.candidateCommit,
    deploymentId: input.deploymentId,
    baseline: input.baseline,
    canary: input.canary,
    sampleCount: input.sampleCount,
    canaryTrafficPercent: input.canaryTrafficPercent,
    healthPassed: input.healthPassed,
    readinessPassed: input.readinessPassed,
  };
  return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

function result(
  status: MonitorStatus,
  reason: string,
  nextAction: string | null,
  input: PostDeployEvaluationInput,
  data: Omit<PostDeployEvaluationData, 'evidenceHash' | 'monitoringAuthority' | 'executionAuthority'>,
): CheckResult<PostDeployEvaluationData> {
  const evidenceHash = stableEvidenceHash(input);
  const evidence: EvidenceRef[] = [{
    kind: 'performance_comparison',
    uri: `dsg-monitoring://post-deploy/${encodeURIComponent(input.deploymentId)}`,
    observedAt: input.observedAt,
    details: {
      schemaVersion: 'dsg-post-deploy-evaluation-v1',
      baselineCommit: input.baselineCommit,
      candidateCommit: input.candidateCommit,
      evidenceHash,
    },
  }];

  return {
    status,
    reason,
    nextAction,
    data: {
      ...data,
      evidenceHash,
      monitoringAuthority: 'OBSERVATION_ONLY',
      executionAuthority: 'DSG_CONTROL_PLANE',
    },
    evidence,
  };
}

export function evaluatePostDeployCanary(
  input: PostDeployEvaluationInput,
): CheckResult<PostDeployEvaluationData> {
  const emptyDeltas: MetricDelta = {
    successRate: 0,
    latencyP99Ms: 0,
    errorRate: 0,
    throughputRps: 0,
    costPerSuccess: 0,
    auditCompleteness: 0,
  };

  const baseData = {
    baselineCommit: input.baselineCommit,
    candidateCommit: input.candidateCommit,
    deploymentId: input.deploymentId,
    deltas: emptyDeltas,
    improvements: [] as string[],
    regressions: [] as string[],
    sampleCount: input.sampleCount,
    canaryTrafficPercent: input.canaryTrafficPercent,
    healthPassed: input.healthPassed,
    readinessPassed: input.readinessPassed,
    recommendedAction: 'HOLD_REVIEW' as PostDeployRecommendedAction,
    rollbackRecommended: false,
    nextBaselineEligible: false,
  };

  if (!input.baselineCommit.trim() || !input.candidateCommit.trim() || !input.deploymentId.trim()) {
    return result('BLOCK', 'DEPLOYMENT_BINDING_MISSING', 'Bind baseline commit, candidate commit, and deployment id before evaluation.', input, {
      ...baseData,
      recommendedAction: 'ROLLBACK_RECOMMENDED',
      rollbackRecommended: true,
    });
  }

  if (input.baselineCommit === input.candidateCommit) {
    return result('BLOCK', 'BASELINE_CANDIDATE_COMMIT_EQUAL', 'A post-deploy candidate must be bound to a commit different from the approved baseline.', input, {
      ...baseData,
      recommendedAction: 'ROLLBACK_RECOMMENDED',
      rollbackRecommended: true,
    });
  }

  if (!finiteMetricSet(input.baseline) || !finiteMetricSet(input.canary) ||
      !validMetricRanges(input.baseline) || !validMetricRanges(input.canary)) {
    return result('BLOCK', 'METRIC_EVIDENCE_INVALID', 'Reject invalid or non-finite performance evidence and rerun the canary measurement.', input, {
      ...baseData,
      recommendedAction: 'ROLLBACK_RECOMMENDED',
      rollbackRecommended: true,
    });
  }

  const deltas: MetricDelta = {
    successRate: input.canary.successRate - input.baseline.successRate,
    latencyP99Ms: input.canary.latencyP99Ms - input.baseline.latencyP99Ms,
    errorRate: input.canary.errorRate - input.baseline.errorRate,
    throughputRps: input.canary.throughputRps - input.baseline.throughputRps,
    costPerSuccess: input.canary.costPerSuccess - input.baseline.costPerSuccess,
    auditCompleteness: input.canary.auditCompleteness - input.baseline.auditCompleteness,
  };

  const regressions: string[] = [];
  const improvements: string[] = [];

  if (deltas.successRate < -EPSILON) regressions.push('SUCCESS_RATE_REGRESSION');
  if (deltas.latencyP99Ms > EPSILON) regressions.push('LATENCY_P99_REGRESSION');
  if (deltas.errorRate > EPSILON) regressions.push('ERROR_RATE_REGRESSION');
  if (deltas.throughputRps < -EPSILON) regressions.push('THROUGHPUT_REGRESSION');
  if (deltas.costPerSuccess > EPSILON) regressions.push('COST_PER_SUCCESS_REGRESSION');
  if (deltas.auditCompleteness < -EPSILON) regressions.push('AUDIT_COMPLETENESS_REGRESSION');

  if (deltas.successRate > EPSILON) improvements.push('SUCCESS_RATE_IMPROVED');
  if (deltas.latencyP99Ms < -EPSILON) improvements.push('LATENCY_P99_IMPROVED');
  if (deltas.errorRate < -EPSILON) improvements.push('ERROR_RATE_IMPROVED');
  if (deltas.throughputRps > EPSILON) improvements.push('THROUGHPUT_IMPROVED');
  if (deltas.costPerSuccess < -EPSILON) improvements.push('COST_PER_SUCCESS_IMPROVED');
  if (deltas.auditCompleteness > EPSILON) improvements.push('AUDIT_COMPLETENESS_IMPROVED');

  const common = {
    ...baseData,
    deltas,
    improvements,
    regressions,
  };

  if (!input.healthPassed || !input.readinessPassed) {
    const healthFailures = [
      ...(input.healthPassed ? [] : ['HEALTH_CHECK_FAILED']),
      ...(input.readinessPassed ? [] : ['READINESS_CHECK_FAILED']),
    ];
    return result('BLOCK', 'POST_DEPLOY_HEALTH_FAILED', 'Control Plane should execute the approved rollback path; Monitoring only emits the rollback recommendation.', input, {
      ...common,
      regressions: [...regressions, ...healthFailures],
      recommendedAction: 'ROLLBACK_RECOMMENDED',
      rollbackRecommended: true,
    });
  }

  if (regressions.length > 0) {
    return result('BLOCK', 'PROTECTED_METRIC_REGRESSION', 'Control Plane should execute the approved rollback path because one or more protected production metrics regressed.', input, {
      ...common,
      recommendedAction: 'ROLLBACK_RECOMMENDED',
      rollbackRecommended: true,
    });
  }

  if (!Number.isInteger(input.sampleCount) || input.sampleCount < MIN_SAMPLE_COUNT ||
      input.canaryTrafficPercent <= 0 || input.canaryTrafficPercent > 100) {
    return result('REVIEW', 'CANARY_EVIDENCE_INSUFFICIENT', `Collect at least ${MIN_SAMPLE_COUNT} samples with canary traffic in the range (0, 100].`, input, {
      ...common,
      recommendedAction: 'HOLD_REVIEW',
    });
  }

  if (improvements.length === 0) {
    return result('REVIEW', 'NO_MEASURED_POST_DEPLOY_IMPROVEMENT', 'Keep the current baseline and collect more evidence; a non-regressing but neutral deployment is not eligible as the next baseline.', input, {
      ...common,
      recommendedAction: 'HOLD_REVIEW',
    });
  }

  return result('PASS', 'POST_DEPLOY_IMPROVEMENT_VERIFIED', null, input, {
    ...common,
    recommendedAction: 'ACCEPT_NEXT_BASELINE',
    nextBaselineEligible: true,
  });
}
