# DSG Unified Data Monitoring

Observed-truth monitoring and evidence intake for the DSG agentic-organization workstream.

## Authority boundary

This repository **does not authorize execution or promotion**. It observes system state and returns evidence-oriented results. DSG Control Plane remains the canonical authority; AGI Simulation proposes candidates; Cinema independently verifies proof material.

## Current implemented checks

- Supabase critical-table scoped row-count observation.
- Administrative check for rows missing `org_id` on tenant-scoped tables.
- Canonical GitHub repository/ref observation for Control Plane, DSG ONE v1, AGI Simulation, Cinema and this monitoring repository.
- `/api/health`, `/api/readiness`, and authenticated `/api/dsg/v1/monitoring/data-sync`.
- Result states: `PASS`, `REVIEW`, `BLOCK`, `NOT_RUN`.

The Supabase service-role client bypasses RLS. Therefore service-role monitoring **never claims RLS enforcement is verified**. Tenant-isolation proof must use a separate non-service-role identity/evidence path.

## API

`GET /api/dsg/v1/monitoring/data-sync?check=full|metrics|divergence|cross-repo`

Requires `Authorization: Bearer $MONITORING_API_KEY`.

## Required runtime configuration

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `MONITORING_ORG_ID`
- `MONITORING_API_KEY`

Optional: `DSG_GITHUB_AUTOMATION_TOKEN` enables authenticated observation of private canonical repositories.

## Verification policy

CI is fail-closed: committed lockfile, `npm ci`, lint, typecheck, tests, build and Docker build must all pass. No `|| true` or fabricated production evidence is permitted.

This integration branch is not a production-ready claim. Live Supabase and authenticated cross-repository checks remain evidence gates before promotion/deployment.
