# DSG Unified Data Monitoring
> [!IMPORTANT]
> **Production platform authority — Azure only.** Vercel, Render, Railway, AWS, and Google Cloud are retired for DSG production; legacy URLs, checks, and statuses are not deployment or health evidence.
> Runtime secrets belong in Azure Key Vault and are resolved by the Azure service Managed Identity. GitHub OIDC may bootstrap or rotate them; `.env.example` is documentation only. Any unresolved Key Vault reference is `BLOCK`.
> Canonical secret-manager contract: [Control Plane Azure Key Vault operations](https://github.com/tdealer01-crypto/tdealer01-crypto-dsg-control-plane/blob/main/docs/ops/azure-runtime-env-sync.md).

Observed-truth monitoring, post-deploy performance evaluation, and evidence intake for the DSG governed agentic-organization loop.

> **Authority boundary:** this repository observes and evaluates measured evidence. It does **not** authorize promotion, execute rollback, merge code, or mutate production. DSG Control Plane remains the canonical execution/promotion authority; AGI Simulation proposes candidates; Cinema independently verifies proof material.

```text
AGI Simulation
  ↓ admitted candidates
Cinema raw evidence
  ↓
DSG Control Plane ALLOW
  ↓
Batch merge → one deployment
  ↓
DSG Unified Data Monitoring
  ├─ database / org-binding observations
  ├─ canonical repository/ref observations
  ├─ health + readiness evidence
  └─ baseline vs canary performance comparison
          ↓
      BLOCK / REVIEW / PASS
       ↓       ↓       ↓
 rollback   hold    next baseline
 signal     review   evidence
       \       |       /
        DSG Control Plane
              ↓
     deployment / baseline action
```

## Current implementation source

The observed-truth implementation is canonical on `main`. It was merged by PR #1 (`feat: observed-truth monitoring integration`); the former integration branch is no longer the runtime source of truth.

The repository also contains a separate historical `master` branch with an older monitoring implementation. `main` and `master` do not represent one continuous history. Do **not** merge `master` into `main` blindly; PR #1 intentionally rebuilt the useful monitoring behavior from `main` with fail-closed truth boundaries.

## Implemented capabilities

### 1. Critical Supabase observations

The monitor observes tenant-scoped row counts for eight critical tables:

- `organizations`
- `users`
- `agents`
- `policies`
- `executions`
- `audit_logs`
- `runtime_intents`
- `proof_artifacts`

`organizations` is scoped by `id`; tenant tables are scoped by `org_id`.

The service-role client bypasses RLS. Therefore service-role observations always report `rlsVerified: false`. Tenant-isolation/RLS proof requires a separate non-service-role evidence path.

### 2. Org-binding divergence detection

Rows missing `org_id` on tenant-scoped critical tables are treated as a blocker:

```text
missing org_id observed → BLOCK
query incomplete         → REVIEW
no missing bindings      → PASS
```

### 3. Canonical repository/ref observation

The monitor observes canonical refs for:

- `tdealer01-crypto/tdealer01-crypto-dsg-control-plane` → `main`
- `tdealer01-crypto/dsg-one-v1` → `main`
- `tdealer01-crypto/dsg-agi-simulation` → `master`
- `tdealer01-crypto/DSG-Cinema-Proof-Agent` → `main`
- `tdealer01-crypto/dsg-unified-data-monitoring` → `main`

Missing access or missing SHA becomes `REVIEW`, never a fabricated pass.

### 4. Post-deploy canary evaluator

`src/post-deploy-evaluator.ts` compares a deployed candidate against the approved baseline using measured production/canary metrics.

Protected metrics:

- success rate must not decrease;
- p99 latency must not increase;
- error rate must not increase;
- throughput must not decrease;
- cost per successful execution must not increase;
- audit completeness must not decrease;
- health and readiness must both pass.

A deployment is eligible to become the next baseline only when:

```text
NextBaselineEligible =
    HealthPassed
  ∧ ReadinessPassed
  ∧ SufficientCanaryEvidence
  ∧ NoProtectedMetricRegression
  ∧ AtLeastOneMeasuredImprovement
```

The evaluator returns one of three actions:

| Monitoring result | Recommended action | Meaning |
|---|---|---|
| `PASS` | `ACCEPT_NEXT_BASELINE` | Improvement measured; Control Plane may promote this measured deployment as the next baseline. |
| `REVIEW` | `HOLD_REVIEW` | No regression but evidence is insufficient or neutral; keep current baseline. |
| `BLOCK` | `ROLLBACK_RECOMMENDED` | Health/readiness failed, bindings invalid, evidence invalid, or a protected metric regressed. |

Monitoring **only emits the recommendation**. The response explicitly declares:

```text
monitoringAuthority = OBSERVATION_ONLY
executionAuthority  = DSG_CONTROL_PLANE
```

It also emits a SHA-256 `evidenceHash` bound to baseline commit, candidate commit, deployment ID, metrics, sample count, canary traffic, health, and readiness. Observation timestamp is excluded from the hash so the same measured evidence hashes identically when replayed.

## API

### Health

```http
GET /api/health
```

### Readiness

```http
GET /api/readiness
```

Missing required runtime configuration returns HTTP `503` with `BLOCK`.

### Data-sync / observed-truth checks

```http
GET /api/dsg/v1/monitoring/data-sync?check=full|metrics|divergence|cross-repo
Authorization: Bearer $MONITORING_API_KEY
```

### Post-deploy evaluation

```http
POST /api/dsg/v1/monitoring/post-deploy/evaluate
Authorization: Bearer $MONITORING_API_KEY
Content-Type: application/json
```

Example request:

```json
{
  "baselineCommit": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "candidateCommit": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  "deploymentId": "deploy-001",
  "baseline": {
    "successRate": 0.95,
    "latencyP99Ms": 300,
    "errorRate": 0.02,
    "throughputRps": 100,
    "costPerSuccess": 0.10,
    "auditCompleteness": 0.99
  },
  "canary": {
    "successRate": 0.97,
    "latencyP99Ms": 250,
    "errorRate": 0.015,
    "throughputRps": 110,
    "costPerSuccess": 0.09,
    "auditCompleteness": 0.995
  },
  "sampleCount": 100,
  "canaryTrafficPercent": 10,
  "healthPassed": true,
  "readinessPassed": true
}
```

Response semantics:

- HTTP `409` + `BLOCK` → rollback recommended;
- HTTP `200` + `REVIEW` → hold current baseline and collect/review more evidence;
- HTTP `200` + `PASS` → measured improvement verified and `nextBaselineEligible=true`.

The API never claims that rollback was actually executed or that the baseline was actually committed.

## Runtime configuration

Required:

- `SUPABASE_URL` — API URL of the exact Supabase project whose governance tables are being observed. This is configuration, not a secret.
- `SUPABASE_SERVICE_ROLE_KEY` — server-side Supabase service-role credential. Store it in Azure Key Vault; never expose it through a `NEXT_PUBLIC_*` setting.
- `MONITORING_ORG_ID` — an existing `public.organizations.id` from that same Supabase project. Validate the UUID against the live table before deployment; do not invent an ID.
- `MONITORING_API_KEY` — a high-entropy bearer secret used only by this monitoring API. It is **not issued by Supabase**. Generate/rotate it as a runtime secret in Azure Key Vault and resolve it into the Azure service through Managed Identity.

Optional:

- `DSG_GITHUB_AUTOMATION_TOKEN` — authenticated observation of private canonical repositories; keep it in Azure Key Vault when required.
- `DSG_CONTROL_PLANE_POST_DEPLOY_URL` — canonical HTTPS Control Plane post-deploy feedback endpoint.
- `DSG_CONTROL_PLANE_POST_DEPLOY_SECRET` — HMAC secret shared only with Control Plane; keep it in Azure Key Vault.
- `PORT` — HTTP port, default `3000`.

### Secret-manager deployment contract

Production secret values are never committed to this repository and must not be placed in `.env.example`.

1. Create or rotate required secret values in Azure Key Vault through the approved GitHub OIDC bootstrap/rotation identity.
2. Give the Azure monitoring service Managed Identity only `Key Vault Secrets User` access to the vault.
3. Bind versionless Key Vault references for each runtime secret (`SUPABASE_SERVICE_ROLE_KEY`, `MONITORING_API_KEY`, and any optional secret that is enabled).
4. Keep non-secret runtime settings such as `SUPABASE_URL`, `MONITORING_ORG_ID`, endpoint URLs, and `PORT` as ordinary Azure App Settings unless policy requires a stricter store.
5. Require every Key Vault reference status to be `Resolved` before readiness can be considered configured.
6. Verify `/api/readiness` and then run authenticated live monitoring probes. Configuration readback alone is not evidence that Supabase connectivity, canonical repo observation, or the closed post-deploy loop passed.

The Control Plane runbook linked at the top of this README is the canonical implementation pattern for Key Vault, Managed Identity, and GitHub OIDC authority separation.

## Quick start

```bash
npm ci
npm run lint
npm run type-check
npm test
npm run build
npm start
```

Docker:

```bash
docker build -t dsg-unified-monitoring .
```

## CI policy

`Unified Monitoring CI` is fail-closed and requires:

1. committed lockfile;
2. `npm ci`;
3. lint;
4. TypeScript type check;
5. unit tests;
6. build;
7. Docker build.

No `|| true`, fake production evidence, or self-issued promotion claim is permitted.

## Function status

| Function | Status | Truth boundary |
|---|---|---|
| Critical-table scoped observations | **IMPLEMENTED / CI VERIFIED checkpoint** | Service-role observation; not RLS proof. |
| Missing `org_id` divergence gate | **IMPLEMENTED / CI VERIFIED checkpoint** | Can return `BLOCK`. |
| Canonical repo/ref observation | **IMPLEMENTED / CI VERIFIED checkpoint** | Visibility failures return `REVIEW`. |
| `/api/health` and `/api/readiness` | **IMPLEMENTED / CI VERIFIED checkpoint** | Readiness fails closed on missing config. |
| Authenticated data-sync API | **IMPLEMENTED / CI VERIFIED checkpoint** | Bearer auth required. |
| Post-deploy baseline/canary comparison | **IMPLEMENTED / CI VERIFIED checkpoint** | Pure evaluator; no production mutation. |
| Rollback recommendation signal | **IMPLEMENTED / CI VERIFIED checkpoint** | Recommendation only; Control Plane executes. |
| Next-baseline evidence + SHA-256 binding | **IMPLEMENTED / CI VERIFIED checkpoint** | Eligibility evidence only; Control Plane commits baseline. |
| Live Supabase evidence | **RUNTIME BINDING REQUIRED** | Must be observed against the real configured instance. |
| Tenant-isolation/RLS proof | **NOT YET VERIFIED** | Requires non-service-role test identity/evidence. |
| Production deployment | **OUTSIDE AUTHORITY; AZURE RUNTIME BINDING REQUIRED SEPARATELY** | This repo observes only; deployment authority remains outside Monitoring. |

## Result states

All monitoring components use:

- `PASS`
- `REVIEW`
- `BLOCK`
- `NOT_RUN`

A failed or incomplete observation is never converted into `PASS`.

## Closed-loop role in DSG self-evolution

```text
frequent AGI simulation
        ↓
admitted candidate pool
        ↓
batch review + Cinema + Control Plane ALLOW
        ↓
batch merge
        ↓
one deployment
        ↓
canary workload + health/readiness
        ↓
DSG Unified Data Monitoring
   ├─ regression → ROLLBACK_RECOMMENDED
   ├─ neutral     → HOLD_REVIEW
   └─ improved    → ACCEPT_NEXT_BASELINE
                         ↓
                  DSG Control Plane
                         ↓
              measured next baseline
                         ↓
                  AGI Simulation
```

This repository is therefore the **observed-truth feedback layer** of the evolution loop: it measures the real deployed outcome so simulated improvement cannot be treated as production improvement without live evidence.

## Current promotion limits

`main` does **not** claim:

- production readiness;
- live Supabase proof before runtime binding;
- tenant RLS enforcement from a service-role client;
- actual rollback merely because rollback is recommended;
- a committed next baseline merely because it is eligible;
- deployment merely because Azure is the declared production platform.

## License

MIT.
