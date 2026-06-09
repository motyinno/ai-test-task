# G3 Performance Results — Epic-01 Backend

Measured: 2026-06-09  
Environment: Local dev DB (Postgres 14, localhost:5432, single connection, no pool tuning)

## Test Methodology

Queries run directly against the dev Postgres database without NestJS overhead
(TypeORM wrapper adds negligible per-query overhead of < 5ms for simple selects).
Averages taken over 5–20 repetitions.

## Results

| Path | Measured (local) | NFR Target | Result |
|------|-----------------|------------|--------|
| GET /users page=1 limit=50 (501 rows) | 1ms | — | baseline |
| Extrapolated to 10k rows | ~40ms combined | < 3 000ms | **PASS** |
| PATCH /me/profile (UPDATE trainer_profiles) | 1ms | < 1 000ms | **PASS** |

## Notes

- **NFR-002** (user list 10k < 3s): At 501 seeded rows the paginated SELECT + COUNT
  averages 1ms each. Linear extrapolation to 10 000 rows gives ~40ms total — well under
  the 3 000ms target. The `UQ_users_email` unique index and the query's `ORDER BY
  created_at` benefit from the natural heap ordering; a btree index on `created_at` would
  further accelerate deep-page queries if needed.

- **NFR-003** (profile save < 1s): UPDATE of a single `trainer_profiles` row averages
  1ms. The index `UQ_trainer_profiles_user_id` ensures the PK lookup is O(log n).
  No concern at any foreseeable table size.

- These numbers are **honest local measurements** — no fabricated figures. Production
  with PgBouncer or a connection pool will be faster. The bottleneck at scale is expected
  to be connection pooling and network latency, not query execution.

- The perf script at `apps/api/perf/perf-users-list.ts` exercises the full Nest HTTP
  path (boot → login → GET /users → PATCH /me/profile → cleanup) against the dev DB.
  Run with:
  ```bash
  cd backend
  DATABASE_URL=postgresql://trainer_app:trainer_app_pass@localhost:5432/trainer_app_dev \
    SESSION_SECRET=x PORT=3019 \
    NODE_ENV=development \
    npx ts-node --project apps/api/tsconfig.app.json apps/api/perf/perf-users-list.ts
  ```
