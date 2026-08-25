export interface ServiceConfig {
  port: number;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  monitoringOrgId: string;
  monitoringApiKey: string;
  githubToken?: string;
}

export type ConfigResult =
  | { ready: true; config: ServiceConfig; missing: [] }
  | { ready: false; config: null; missing: string[] };

const REQUIRED = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'MONITORING_ORG_ID',
  'MONITORING_API_KEY',
] as const;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ConfigResult {
  const missing = REQUIRED.filter((key) => !env[key]?.trim());
  if (missing.length > 0) return { ready: false, config: null, missing };

  const rawPort = env.PORT?.trim() || '3000';
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    return { ready: false, config: null, missing: ['PORT_INVALID'] };
  }

  return {
    ready: true,
    missing: [],
    config: {
      port,
      supabaseUrl: env.SUPABASE_URL!,
      supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY!,
      monitoringOrgId: env.MONITORING_ORG_ID!,
      monitoringApiKey: env.MONITORING_API_KEY!,
      githubToken: env.DSG_GITHUB_AUTOMATION_TOKEN || env.GITHUB_TOKEN,
    },
  };
}
