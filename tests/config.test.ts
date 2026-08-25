import { loadConfig } from '../src/config';
import { CRITICAL_TABLES } from '../src/data-sync-monitor';

describe('configuration and scope contracts', () => {
  test('fails closed when required production configuration is missing', () => {
    const result = loadConfig({ PORT: '3000' });
    expect(result.ready).toBe(false);
    if (!result.ready) {
      expect(result.missing).toEqual(expect.arrayContaining([
        'SUPABASE_URL',
        'SUPABASE_SERVICE_ROLE_KEY',
        'MONITORING_ORG_ID',
        'MONITORING_API_KEY',
      ]));
    }
  });

  test('uses organizations.id and org_id for tenant-scoped tables', () => {
    expect(CRITICAL_TABLES.find((item) => item.table === 'organizations')?.scopeColumn).toBe('id');
    for (const item of CRITICAL_TABLES.filter((target) => target.table !== 'organizations')) {
      expect(item.scopeColumn).toBe('org_id');
    }
  });
});
