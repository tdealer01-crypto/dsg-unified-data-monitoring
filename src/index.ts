import 'dotenv/config';
import crypto from 'node:crypto';
import express, { NextFunction, Request, Response } from 'express';
import { loadConfig } from './config';
import { checkOrgBindingCompleteness, createAdministrativeClient, observeCriticalTables } from './data-sync-monitor';
import { observeCanonicalRepositories } from './github-monitor';

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function createApp(env: NodeJS.ProcessEnv = process.env) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '256kb' }));

  app.get('/api/health', (_req, res) => {
    const config = loadConfig(env);
    res.status(200).json({ service: 'dsg-unified-data-monitoring', status: 'UP', configured: config.ready });
  });

  app.get('/api/readiness', (_req, res) => {
    const config = loadConfig(env);
    if (!config.ready) {
      return res.status(503).json({
        status: 'BLOCK',
        reason: 'REQUIRED_CONFIGURATION_MISSING',
        missing: config.missing,
        nextAction: 'Bind the required environment variables; secret values are never returned.',
      });
    }
    return res.status(200).json({ status: 'PASS', reason: 'REQUIRED_CONFIGURATION_PRESENT' });
  });

  const requireMonitoringAuth = (req: Request, res: Response, next: NextFunction) => {
    const config = loadConfig(env);
    if (!config.ready) {
      return res.status(503).json({ status: 'BLOCK', reason: 'SERVICE_NOT_CONFIGURED', missing: config.missing });
    }
    const supplied = req.header('authorization')?.replace(/^Bearer\s+/i, '') || '';
    if (!supplied || !safeEqual(supplied, config.config.monitoringApiKey)) {
      return res.status(401).json({ status: 'BLOCK', reason: 'MONITORING_AUTH_REQUIRED' });
    }
    res.locals.config = config.config;
    return next();
  };

  app.get('/api/dsg/v1/monitoring/data-sync', requireMonitoringAuth, async (req, res) => {
    const config = res.locals.config as NonNullable<ReturnType<typeof loadConfig>['config']>;
    const check = String(req.query.check || 'full');

    if (check === 'cross-repo') {
      const result = await observeCanonicalRepositories(config.githubToken);
      return res.status(result.status === 'BLOCK' ? 409 : 200).json(result);
    }

    const client = createAdministrativeClient(config.supabaseUrl, config.supabaseServiceRoleKey);
    if (check === 'metrics') {
      const result = await observeCriticalTables(client, config.monitoringOrgId);
      return res.status(200).json(result);
    }
    if (check === 'divergence') {
      const result = await checkOrgBindingCompleteness(client);
      return res.status(result.status === 'BLOCK' ? 409 : 200).json(result);
    }
    if (check !== 'full') {
      return res.status(400).json({ status: 'BLOCK', reason: 'UNKNOWN_CHECK', allowed: ['full', 'metrics', 'divergence', 'cross-repo'] });
    }

    const [metrics, bindings, repositories] = await Promise.all([
      observeCriticalTables(client, config.monitoringOrgId),
      checkOrgBindingCompleteness(client),
      observeCanonicalRepositories(config.githubToken),
    ]);
    const status = bindings.status === 'BLOCK' ? 'BLOCK' :
      [metrics.status, bindings.status, repositories.status].every((value) => value === 'PASS') ? 'PASS' : 'REVIEW';

    return res.status(status === 'BLOCK' ? 409 : 200).json({
      status,
      reason: status === 'PASS' ? 'FULL_OBSERVATION_COMPLETE' : status === 'BLOCK' ? 'FULL_OBSERVATION_FOUND_BLOCKER' : 'FULL_OBSERVATION_REQUIRES_REVIEW',
      nextAction: status === 'PASS' ? null : 'Inspect component results. RLS enforcement requires a separate non-service-role tenant isolation proof.',
      data: { metrics: metrics.data.metrics, passRate: metrics.data.passRate, bindings: bindings.data, crossRepo: repositories.data },
      evidence: [...metrics.evidence, ...bindings.evidence, ...repositories.evidence],
      claims: { rlsVerified: false, productionReady: false },
    });
  });

  return app;
}

if (require.main === module) {
  const config = loadConfig();
  const port = config.ready ? config.config.port : Number(process.env.PORT || 3000);
  createApp().listen(port, () => {
    console.log(JSON.stringify({ event: 'monitoring_server_started', port }));
  });
}
