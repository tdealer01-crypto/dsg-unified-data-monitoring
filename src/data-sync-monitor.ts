import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { CheckResult, TableObservation } from './types';

interface TableTarget {
  table: string;
  scopeColumn: 'id' | 'org_id';
}

export const CRITICAL_TABLES: readonly TableTarget[] = [
  { table: 'organizations', scopeColumn: 'id' },
  { table: 'users', scopeColumn: 'org_id' },
  { table: 'agents', scopeColumn: 'org_id' },
  { table: 'policies', scopeColumn: 'org_id' },
  { table: 'executions', scopeColumn: 'org_id' },
  { table: 'audit_logs', scopeColumn: 'org_id' },
  { table: 'runtime_intents', scopeColumn: 'org_id' },
  { table: 'proof_artifacts', scopeColumn: 'org_id' },
] as const;

export function createAdministrativeClient(url: string, serviceRoleKey: string): SupabaseClient {
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function observeCriticalTables(
  client: SupabaseClient,
  orgId: string,
): Promise<CheckResult<{ metrics: TableObservation[]; passRate: number }>> {
  const metrics: TableObservation[] = [];

  for (const target of CRITICAL_TABLES) {
    const observedAt = new Date().toISOString();
    try {
      const response = await client
        .from(target.table)
        .select('*', { count: 'exact', head: true })
        .eq(target.scopeColumn, orgId);

      if (response.error) {
        metrics.push({
          table: target.table,
          scopeColumn: target.scopeColumn,
          scopeValue: orgId,
          rowCount: null,
          status: 'REVIEW',
          reason: `TABLE_QUERY_FAILED:${response.error.code || 'UNKNOWN'}`,
          observedAt,
          rlsVerified: false,
        });
        continue;
      }

      metrics.push({
        table: target.table,
        scopeColumn: target.scopeColumn,
        scopeValue: orgId,
        rowCount: response.count ?? null,
        status: response.count === null ? 'REVIEW' : 'PASS',
        reason: response.count === null ? 'COUNT_NOT_RETURNED' : 'COUNT_OBSERVED',
        observedAt,
        rlsVerified: false,
      });
    } catch (error) {
      metrics.push({
        table: target.table,
        scopeColumn: target.scopeColumn,
        scopeValue: orgId,
        rowCount: null,
        status: 'REVIEW',
        reason: `TABLE_QUERY_EXCEPTION:${error instanceof Error ? error.name : 'UNKNOWN'}`,
        observedAt,
        rlsVerified: false,
      });
    }
  }

  const passed = metrics.filter((item) => item.status === 'PASS').length;
  const passRate = metrics.length === 0 ? 0 : passed / metrics.length;
  const status = metrics.every((item) => item.status === 'PASS') ? 'PASS' : 'REVIEW';
  const observedAt = new Date().toISOString();

  return {
    status,
    reason: status === 'PASS' ? 'ALL_CRITICAL_TABLE_COUNTS_OBSERVED' : 'ONE_OR_MORE_TABLES_REQUIRE_REVIEW',
    nextAction: status === 'PASS' ? null : 'Inspect table-level reasons; do not claim complete monitoring until all required observations succeed.',
    data: { metrics, passRate },
    evidence: [{
      kind: 'database_count',
      uri: 'supabase://critical-table-counts',
      observedAt,
      details: {
        organization: orgId,
        note: 'Administrative service-role observation; this does not verify RLS enforcement.',
      },
    }],
  };
}

export async function checkOrgBindingCompleteness(
  client: SupabaseClient,
): Promise<CheckResult<{ missingOrgBindings: Record<string, number | null> }>> {
  const missingOrgBindings: Record<string, number | null> = {};
  let queryFailed = false;
  let violationFound = false;

  for (const target of CRITICAL_TABLES.filter((item) => item.scopeColumn === 'org_id')) {
    try {
      const response = await client
        .from(target.table)
        .select('*', { count: 'exact', head: true })
        .is('org_id', null);
      if (response.error || response.count === null) {
        missingOrgBindings[target.table] = null;
        queryFailed = true;
      } else {
        missingOrgBindings[target.table] = response.count;
        if (response.count > 0) violationFound = true;
      }
    } catch {
      missingOrgBindings[target.table] = null;
      queryFailed = true;
    }
  }

  const observedAt = new Date().toISOString();
  if (violationFound) {
    return {
      status: 'BLOCK',
      reason: 'ROWS_WITHOUT_ORG_BINDING_OBSERVED',
      nextAction: 'Inspect and repair unscoped rows before using monitoring output as promotion evidence.',
      data: { missingOrgBindings },
      evidence: [{ kind: 'database_count', uri: 'supabase://org-binding-completeness', observedAt }],
    };
  }
  if (queryFailed) {
    return {
      status: 'REVIEW',
      reason: 'ORG_BINDING_CHECK_INCOMPLETE',
      nextAction: 'Verify table existence/schema and rerun the completeness check.',
      data: { missingOrgBindings },
      evidence: [{ kind: 'database_count', uri: 'supabase://org-binding-completeness', observedAt }],
    };
  }
  return {
    status: 'PASS',
    reason: 'NO_MISSING_ORG_BINDINGS_OBSERVED',
    nextAction: null,
    data: { missingOrgBindings },
    evidence: [{ kind: 'database_count', uri: 'supabase://org-binding-completeness', observedAt }],
  };
}
