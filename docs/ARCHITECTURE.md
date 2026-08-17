# Architecture Overview

## System Design

DSG Unified Data Monitoring provides a complete observability solution for a distributed system with a unified database.

### Components Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                   Monitoring & Verification                    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Schema Verification  │  Data Sync Monitor  │  Health     │  │
│  │  (verify-schema.ts)   │  (data-sync.ts)     │  Checker    │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
         ↑                                            ↑
         │                                            │
┌────────┴─────────────────────────────────────────┬─┴────────┐
│              REST API Layer                      │          │
│  ┌─────────────────────────────────────────┐    │          │
│  │  GET /api/dsg/v1/monitoring/data-sync   │    │          │
│  │  POST /api/dsg/v1/monitoring/data-sync  │    │          │
│  │  Permissions: read:monitoring,admin:*   │    │          │
│  └─────────────────────────────────────────┘    │          │
└────────┬────────────────────────────────────────┼───────────┘
         │                                        │
         ↓                                        │
┌─────────────────────────────────────────────────┴──────────────┐
│                                                                 │
│          Unified Supabase PostgreSQL Instance                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ organizations  │ users  │ agents  │ policies  │ ...       │  │
│  │ (RLS Enforced) | (org_id scoped)                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
         ↑            ↑             ↑            ↑
         │            │             │            │
    ┌────┴──┐    ┌────┴──┐    ┌─────┴──┐   ┌────┴──┐
    │CP     │    │DSG-ONE│    │AGI-SIM │   │CINEMA │
    │       │    │ (PROD)│    │        │   │       │
    └───────┘    └───────┘    └────────┘   └───────┘
```

## Data Model

### Core Tables (Org Scoped)

```sql
-- Organization boundaries
organizations {
  id: text (PRIMARY KEY)
  name: text
  plan: text
  status: text
  created_at: timestamptz
}

-- User/actor identity
users {
  id: uuid (PRIMARY KEY)
  org_id: text (FOREIGN KEY → organizations.id)
  email: text
  role: text
  auth_provider: text
  created_at: timestamptz
}

-- Agent definitions
agents {
  id: text (PRIMARY KEY)
  org_id: text (FOREIGN KEY → organizations.id)
  name: text
  policy_id: text (FOREIGN KEY → policies.id)
  status: text
  created_at: timestamptz
}

-- Policy definitions
policies {
  id: text (PRIMARY KEY)
  org_id: text (FOREIGN KEY → organizations.id)
  name: text
  version: text
  rules: jsonb
  created_at: timestamptz
}

-- Execution records
executions {
  id: uuid (PRIMARY KEY)
  org_id: text (FOREIGN KEY → organizations.id)
  agent_id: text (FOREIGN KEY → agents.id)
  decision: text
  request_payload: jsonb
  created_at: timestamptz
}

-- Audit trail
audit_logs {
  id: uuid (PRIMARY KEY)
  org_id: text (FOREIGN KEY → organizations.id)
  execution_id: uuid (FOREIGN KEY → executions.id)
  decision: text
  evidence: jsonb
  created_at: timestamptz
}

-- Runtime state
runtime_intents {
  id: text (PRIMARY KEY)
  org_id: text (FOREIGN KEY → organizations.id)
  agent_id: text
  status: text
  created_at: timestamptz
}

-- Proof evidence
proof_artifacts {
  id: text (PRIMARY KEY)
  org_id: text (FOREIGN KEY → organizations.id)
  approval_request_id: text
  status: text
  uri: text
  created_at: timestamptz
}
```

## Row-Level Security (RLS) Strategy

### Policy Enforcement

```sql
-- Example RLS policy on users table
CREATE POLICY users_org_isolation ON users
  USING (org_id = current_org_id())
  WITH CHECK (org_id = current_org_id());

-- Service role bypasses RLS
-- SELECT * FROM users;  -- Service role sees all

-- Auth user sees only their org
-- SELECT * FROM users
-- WHERE org_id = current_setting('user.org_id');
```

### Cross-Repository Access Pattern

```
┌─────────────────────────────────────────┐
│         Service Role Key (Shared)       │
│  Bypasses RLS for cross-repo reads      │
└─────────────────────────────────────────┘
         ↑            ↑           ↑
    ┌────┴──┐    ┌────┴──┐  ┌───┴────┐
    │ Repo1 │    │ Repo2 │  │ Repo3  │
    │ Query │    │ Query │  │ Query  │
    └───────┘    └───────┘  └────────┘
         │            │          │
         └────────────┼──────────┘
                      │
              ┌───────┴────────┐
              │  Unified DB    │
              │  (RLS Enforced)│
              └────────────────┘
```

## Monitoring Pipeline

### Schema Consistency Flow

```
1. Query Information Schema
   ↓
2. Extract Object Signatures
   ├─ Tables
   ├─ Functions
   ├─ Policies
   └─ Indices
   ↓
3. Generate Hash
   └─ SHA-256(sorted objects)
   ↓
4. Compare Across Repos
   ├─ Same hash = CONSISTENT
   └─ Different hash = DIVERGED
   ↓
5. Generate Report
   └─ Migration status
   └─ Schema objects
   └─ Hash value
```

### Data Sync Health Check

```
1. For Each Critical Table
   ├─ SELECT COUNT(*)
   ├─ SELECT MAX(updated_at)
   ├─ Calculate Hash
   └─ Return Metrics
   ↓
2. Detect Divergences
   ├─ Check org_id scoping
   ├─ Find orphaned records
   ├─ Verify required fields
   └─ Validate RLS
   ↓
3. Calculate Health Score
   └─ score = 100 - (divergences * 10) - (unsynced_tables * 5)
   ↓
4. Generate Recommendations
   └─ Based on detected issues
```

### Cross-Repository Validation

```
1. Test Service Role Access
   ├─ Read from each table
   ├─ Verify permissions
   └─ Check FOREIGN KEYs
   ↓
2. Verify Org Isolation
   ├─ Sample 2 organizations
   ├─ Try cross-org access
   ├─ Confirm isolation enforced
   └─ Check auth vs service role
   ↓
3. Validate Boundaries
   ├─ Org_id scoping
   ├─ User isolation
   └─ Permission enforcement
   ↓
4. Generate Consistency Report
   └─ consistent: true/false
   └─ issues: [array of problems]
```

## API Data Flow

### GET Request Flow

```
Client Request
  │
  ├─→ Auth Middleware (verify token, check permissions)
  │    └─→ extract org_id from token
  │
  ├─→ Query Parser (parse ?check= parameter)
  │
  ├─→ Route Handler (match check type)
  │    │
  │    ├─ full     →  generateFullReport()
  │    ├─ metrics  →  getTableMetrics()
  │    ├─ divergence → detectDivergences()
  │    └─ cross-repo  → validateCrossRepoConsistency()
  │
  ├─→ Database Queries (via Supabase client + service role)
  │
  ├─→ Data Processing (calculate health score, recommendations)
  │
  └─→ JSON Response (200 OK with data or 500 error)
```

### POST Request Flow

```
Client Request
  │
  ├─→ Auth Middleware (verify token, check admin permissions)
  │
  ├─→ Body Parser (parse JSON)
  │
  ├─→ Action Handler (match action type)
  │    │
  │    ├─ report    → generateFullReport()
  │    └─ reconcile → reconcileData()
  │
  ├─→ Database Queries
  │
  ├─→ Processing & Recommendations
  │
  └─→ JSON Response (200 OK or 500 error)
```

## Critical Tables & Their Role

| Table | Purpose | Org Scoping | RLS | Cross-Repo |
|---|---|---|---|---|
| organizations | Tenant root | - | Yes | Visible |
| users | Actor identity | org_id | Yes | Scoped |
| agents | AI agents | org_id | Yes | Scoped |
| policies | Rules engine | org_id | Yes | Scoped |
| executions | Action log | org_id | Yes | Scoped |
| audit_logs | Compliance | org_id | Yes | Scoped |
| runtime_intents | Pending actions | org_id | Yes | Scoped |
| proof_artifacts | Evidence | org_id | Yes | Scoped |

## Divergence Types

### 1. Scoping Violations
```sql
-- Bad: org_id is NULL
SELECT * FROM users WHERE org_id IS NULL;

-- Fix: Set org_id or delete orphaned records
UPDATE users SET org_id = 'org_123' WHERE id = '...';
```

### 2. Orphaned Records
```sql
-- Bad: org_id references non-existent organization
SELECT * FROM users u
WHERE NOT EXISTS (SELECT 1 FROM organizations o WHERE o.id = u.org_id);

-- Fix: Delete orphaned records
DELETE FROM users WHERE org_id NOT IN (SELECT id FROM organizations);
```

### 3. Missing Required Fields
```sql
-- Bad: Required field is NULL
SELECT * FROM agents WHERE name IS NULL;

-- Fix: Add missing values
UPDATE agents SET name = 'default-name' WHERE name IS NULL;
```

### 4. RLS Policy Violations
```sql
-- Check if policies are actually enforced
SELECT * FROM pg_policies WHERE tablename = 'users';

-- Verify policy blocks cross-org access
SELECT * FROM users WHERE org_id != current_org_id();  -- Should be empty
```

## Health Score Calculation

```typescript
const healthScore = Math.max(
  0,
  100 - divergences.length * 10 - (unsyncedTables.length * 5)
);

// Score interpretation:
// 95-100: Excellent   ✅ No action needed
// 85-94:  Good        ✓ Monitor closely
// 75-84:  Fair        ⚠ Review divergences
// 65-74:  Poor        ⚠️ Immediate action needed
// < 65:   Critical    🚨 Emergency response required
```

## Monitoring Intervals

| Check | Interval | Priority |
|---|---|---|
| Health Score | Every 5 minutes | High |
| Table Metrics | Every 10 minutes | Medium |
| Divergence Detection | Every 15 minutes | High |
| Schema Consistency | Every hour | Medium |
| Cross-Repo Validation | Every 30 minutes | Medium |
| Full Report | Daily | Low |

## Performance Characteristics

- **Schema Consistency Check**: O(tables + functions) ≈ 30 seconds
- **Table Metrics**: O(critical_tables) ≈ 5 seconds per table
- **Divergence Detection**: O(rows_checked) ≈ 60 seconds
- **Health Score Calculation**: O(1) ≈ < 1 second
- **Full Report Generation**: O(all) ≈ 2 minutes

## Scalability Notes

### Single Organization
- Suitable for < 1M rows per table
- Health check: < 5 seconds
- Full report: < 2 minutes

### Multiple Organizations
- Service role scoped to org_id during queries
- Parallel processing per org possible
- Health check: < 30 seconds (10 orgs)

### Large Deployments
- Consider async background jobs for hourly schema checks
- Implement caching for health scores (5-minute TTL)
- Use database connection pooling

## Related Documentation

- [DATA_SYNC_MONITORING.md](./DATA_SYNC_MONITORING.md) - Operational guide
- [SETUP.md](./SETUP.md) - Installation & configuration
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) - Issue resolution
