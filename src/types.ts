export type MonitorStatus = 'PASS' | 'REVIEW' | 'BLOCK' | 'NOT_RUN';

export interface EvidenceRef {
  kind: 'api_response' | 'database_count' | 'github_ref' | 'configuration';
  uri: string;
  observedAt: string;
  details?: Record<string, unknown>;
}

export interface CheckResult<T> {
  status: MonitorStatus;
  reason: string;
  nextAction: string | null;
  data: T;
  evidence: EvidenceRef[];
}

export interface TableObservation {
  table: string;
  scopeColumn: string;
  scopeValue: string;
  rowCount: number | null;
  status: MonitorStatus;
  reason: string;
  observedAt: string;
  rlsVerified: false;
}
