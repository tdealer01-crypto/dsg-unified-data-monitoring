# DSG Unified Data Monitoring

Comprehensive monitoring system for schema consistency and data sync health across unified Supabase database powering 4 DSG repositories.

```
┌─────────────────────────────────────────────────────────────┐
│              Unified Supabase Instance                      │
│  (Single source of truth for all 4 repositories)            │
└─────────────────────────────────────────────────────────────┘
       ↑                    ↑                    ↑
       │                    │                    │
  ┌────┴──────┐       ┌─────┴──────┐      ┌────┴──────┐
  │Control    │       │DSG ONE V1  │      │AGI Sim/  │
  │Plane      │       │            │      │Cinema    │
  └──────┬────┘       └─────┬──────┘      └─────┬────┘
         │ Verified schema  │                   │
         │ RLS enforcement  │ org_id scoping    │
         └─────────────────────────────────────┘
                Service Role Keys
                (cross-repo access)
```

## Overview

This repository provides a complete monitoring solution for:
- **Schema Consistency**: Verify all repositories use compatible database schemas
- **Data Sync Health**: Monitor real-time data synchronization across repos
- **Divergence Detection**: Identify orphaned records and RLS violations
- **Cross-Repository Validation**: Ensure org_id boundaries and service role access

## Repositories Monitored

| Repository | URL | Purpose |
|---|---|---|
| **Control Plane** | tdealer01-crypto-dsg-control-plane | Main governance platform |
| **DSG ONE V1** | dsg-one-v1 | Production runtime (Render) |
| **AGI Simulation** | dsg-agi-simulation | AI simulation environment |
| **Cinema Proof** | dsg-cinema-proof-agent | Proof-of-concept agent |

**Unified Database:** Single Supabase PostgreSQL instance shared by all 4 repos with RLS-enforced org_id scoping.

## Quick Start

### 1. Installation

```bash
# Clone repository
git clone https://github.com/tdealer01-crypto/dsg-unified-data-monitoring.git
cd dsg-unified-data-monitoring

# Install dependencies
npm install

# Setup environment
cp .env.example .env.local
# Edit .env.local with your Supabase credentials
```

### 2. Environment Variables

```bash
NEXT_PUBLIC_SUPABASE_URL=https://[project].supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### 3. Run Monitoring

```bash
# Verify schema consistency across all repos
npm run verify:schema-consistency

# Monitor data sync health (generates report)
npm run monitor:health

# Check for divergences
npm run check:divergences

# Cross-repo validation
npm run validate:cross-repo
```

## Architecture

### Core Components

```
dsg-unified-data-monitoring/
├── architecture/           # System design & diagrams
│   ├── diagrams/          # Interactive HTML visualizations
│   ├── docs/              # Architecture documentation
│   └── overview.md        # System architecture guide
│
├── monitoring/            # Core monitoring libraries
│   ├── data-sync-monitor.ts      # Real-time sync monitoring
│   ├── schema-validator.ts       # Schema consistency checks
│   └── health-checker.ts         # Health score calculation
│
├── api/                   # API endpoints & middleware
│   ├── endpoints.ts       # GET/POST monitoring endpoints
│   ├── types.ts          # TypeScript types & interfaces
│   └── middleware.ts     # Auth & permission checking
│
├── scripts/              # Verification & utility scripts
│   ├── verify-schema-consistency.ts
│   ├── monitor-data-sync.ts
│   └── health-check.sh
│
├── docs/                 # Comprehensive documentation
│   ├── DATA_SYNC_MONITORING.md
│   ├── ARCHITECTURE.md
│   ├── SETUP.md
│   └── TROUBLESHOOTING.md
│
├── docker/               # Docker configuration
│   ├── Dockerfile
│   └── docker-compose.yml
│
└── .github/workflows/    # CI/CD automation
    ├── verify-schema.yml
    └── monitor-health.yml
```

### Unified Data Model

**8 Critical Tables Monitored:**

| Table | Scoping | RLS | Purpose |
|---|---|---|---|
| organizations | Root | Yes | Tenant boundaries |
| users | org_id | Yes | Actor identity |
| agents | org_id | Yes | Agent definitions |
| policies | org_id | Yes | Policy rules |
| executions | org_id | Yes | Execution records |
| audit_logs | org_id | Yes | Audit trail |
| runtime_intents | org_id | Yes | Runtime state |
| proof_artifacts | org_id | Yes | Proof evidence |

## API Endpoints

### Monitor Data Sync

```http
GET /api/dsg/v1/monitoring/data-sync
```

**Query Parameters:**
- `check=full` - Full sync report (default)
- `check=metrics` - Table metrics only
- `check=divergence` - Divergence detection
- `check=cross-repo` - Cross-repo validation

**Permissions:** `read:monitoring`

**Example:**
```bash
curl -H "Authorization: Bearer $API_KEY" \
  https://dsg-one-v1-aimo.onrender.com/api/dsg/v1/monitoring/data-sync
```

### Trigger Sync Report

```http
POST /api/dsg/v1/monitoring/data-sync
```

**Body:**
```json
{
  "action": "report" | "reconcile"
}
```

**Permissions:** `admin:data-sync`

**Example:**
```bash
curl -X POST -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"action":"reconcile"}' \
  https://dsg-one-v1-aimo.onrender.com/api/dsg/v1/monitoring/data-sync
```

## Key Features

### ✅ Schema Consistency Verification
- Migration alignment checks
- Table definition validation
- Function signature verification
- Index coverage analysis
- SHA-256 schema hashing

### ✅ Real-Time Data Sync Monitoring
- 8 critical table tracking
- Row count monitoring
- Modification timestamp tracking
- State hash comparison
- Health score calculation (0-100)

### ✅ Divergence Detection
- Orphaned record identification
- Unscoped field detection
- Missing required fields
- RLS policy violations
- Foreign key constraint checks

### ✅ Cross-Repository Validation
- Service role access verification
- Org_id boundary enforcement
- Table permission confirmation
- Visibility scope validation
- Auth user isolation checks

## Usage Examples

### 1. Check Schema Consistency

```bash
npm run verify:schema-consistency
```

Output: `schema-consistency-report.json`
```json
{
  "timestamp": "2026-08-17T12:34:56Z",
  "repositories": [
    "tdealer01-crypto-dsg-control-plane",
    "dsg-one-v1",
    "dsg-agi-simulation",
    "dsg-cinema-proof-agent"
  ],
  "migrations": { ... },
  "schema": {
    "tables": [...],
    "functions": [...],
    "hash": "abc123..."
  },
  "summary": { "status": "consistent" }
}
```

### 2. Monitor Data Sync Health

```bash
# Get full health report
curl -H "Authorization: Bearer $API_KEY" \
  https://production-url/api/dsg/v1/monitoring/data-sync

# Output includes:
# - Health score (0-100)
# - Table metrics (row counts, modification times)
# - Divergences detected
# - Recommendations
```

### 3. Detect Divergences

```bash
# Check for data inconsistencies
curl -H "Authorization: Bearer $API_KEY" \
  https://production-url/api/dsg/v1/monitoring/data-sync?check=divergence

# Output includes:
# - Orphaned records
# - Unscoped org_id fields
# - Missing required fields
# - RLS violations
```

### 4. Validate Cross-Repository Access

```bash
# Verify service roles and org isolation
curl -H "Authorization: Bearer $API_KEY" \
  https://production-url/api/dsg/v1/monitoring/data-sync?check=cross-repo

# Output includes:
# - Service role access status
# - Org boundary enforcement
# - Table permission validation
# - Visibility scope verification
```

## Monitoring Checklist

### Daily
- [ ] Health score > 90
- [ ] Zero critical divergences
- [ ] All tables synced
- [ ] No orphaned records
- [ ] RLS policies enforced

### Weekly
- [ ] Migration consistency verified
- [ ] Cross-repo visibility confirmed
- [ ] Row count trends analyzed
- [ ] Audit log completeness checked
- [ ] Evidence chain integrity verified

### Monthly
- [ ] Schema version alignment reviewed
- [ ] Backup/recovery tested
- [ ] Performance metrics analyzed
- [ ] Unused tables cleaned up
- [ ] Policy effectiveness reviewed

## Architecture Diagrams

Interactive diagrams available in `architecture/diagrams/`:

1. **Unified Database Architecture** - Shows 4 repos connecting to single Supabase
2. **Monitoring Flow** - Illustrates data sync verification workflow
3. **Schema Consistency Matrix** - Details critical tables and RLS coverage

View diagrams:
```bash
# Open in browser
open architecture/diagrams/unified-database.html
```

## Documentation

- **[ARCHITECTURE.md](./docs/ARCHITECTURE.md)** - System design and data model
- **[DATA_SYNC_MONITORING.md](./docs/DATA_SYNC_MONITORING.md)** - Comprehensive monitoring guide
- **[SETUP.md](./docs/SETUP.md)** - Installation and configuration
- **[TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md)** - Common issues and solutions

## Integration with CI/CD

Add to GitHub Actions workflow:

```yaml
- name: Verify Schema Consistency
  run: npm run verify:schema-consistency
  
- name: Check Data Sync Health
  run: |
    curl -H "Authorization: Bearer $ADMIN_API_KEY" \
      $DEPLOYMENT_URL/api/dsg/v1/monitoring/data-sync?check=full
```

## Docker Support

Run monitoring in containerized environment:

```bash
# Build image
docker build -f docker/Dockerfile -t dsg-unified-monitoring .

# Run with docker-compose
docker-compose -f docker/docker-compose.yml up

# Monitor logs
docker logs -f dsg-monitoring
```

## Production Readiness Gates

Before marking production as healthy:

- [ ] Schema consistency report passes
- [ ] Health score > 95
- [ ] Zero critical divergences
- [ ] All cross-repo checks pass
- [ ] RLS policies verified on critical tables
- [ ] Audit logs capturing all changes
- [ ] Backup/recovery tested

## Troubleshooting

### Schema Divergence Detected

```sql
-- Check what's different
SELECT * FROM information_schema.tables 
WHERE table_schema = 'public'
ORDER BY table_name;

-- Compare with expected from migrations
SELECT migration_name FROM supabase.migrations;
```

### Orphaned Records Found

```sql
-- Find orphaned users
SELECT * FROM users 
WHERE org_id NOT IN (SELECT id FROM organizations);

-- Clean up
DELETE FROM users 
WHERE org_id NOT IN (SELECT id FROM organizations);
```

### RLS Policy Violations

```sql
-- Check policies on table
SELECT * FROM pg_policies 
WHERE tablename = 'users';

-- Verify policy logic
SELECT * FROM users 
WHERE org_id = current_org_id();
```

See [TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md) for more solutions.

## Contributing

1. Create feature branch: `git checkout -b feature/monitoring-improvement`
2. Make changes and test
3. Submit PR with:
   - Description of changes
   - Test results
   - Performance impact analysis

## Performance Metrics

- Schema consistency check: < 30 seconds
- Health check: < 5 seconds per table
- Divergence detection: < 60 seconds
- Full report: < 2 minutes

## License

MIT - See LICENSE file

## Support

For issues or questions:
1. Check [TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md)
2. Review [docs/DATA_SYNC_MONITORING.md](./docs/DATA_SYNC_MONITORING.md)
3. Open issue in repository

## Related Repositories

- [tdealer01-crypto-dsg-control-plane](https://github.com/tdealer01-crypto/tdealer01-crypto-dsg-control-plane)
- [dsg-one-v1](https://github.com/tdealer01-crypto/dsg-one-v1)
- [dsg-agi-simulation](https://github.com/tdealer01-crypto/dsg-agi-simulation)
- [dsg-cinema-proof-agent](https://github.com/tdealer01-crypto/dsg-cinema-proof-agent)

---

**Last Updated:** 2026-08-17  
**Version:** 1.0.0  
**Status:** Production Ready
