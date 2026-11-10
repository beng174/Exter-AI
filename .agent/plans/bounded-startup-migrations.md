# Bounded database startup

## Purpose and big picture
Repair the deployment that built successfully but never opened a port. Keep
existing data, auth, provider switches, budgets and polling rules. PostgreSQL
initialisation must finish or fail with a controlled phase/code within a fixed
deadline. Unchanged startup schemas must not replay locking DDL every restart.

## Progress
- [x] 2026-11-10 UTC: read supplied logs; build succeeded at 00:03:15, then no
  HTTP listener before timeout. Latest base 17df7f9 includes PR #26.
- [x] 2026-11-10 UTC: traced the first post-credential await to unbounded migrate.
- [x] 2026-11-10 UTC: added bounded migration lifecycle, receipts and controlled logs.
- [x] 2026-11-10 UTC: 10 targeted tests passed, including the actual stalled entrypoint.
- [x] 2026-11-10 UTC: disposable Postgres integration passed, including actual web
  startup/authenticated health while relation and advisory locks remained held.
- [x] 2026-11-10 UTC: type check, 549 tests and production build passed.
- [x] 2026-11-10 UTC: secret scan passed; pushed and opened PR #27 against exter-test-drive.

## Surprises and discoveries
The supplied deployment used 6db19f5, before the Accuracy PR. The same startup
wait remains in latest index.ts. pg.Pool has no connection timeout; migrate waits
for its advisory lock and complete DDL without query/lock timeouts. Worker and
scheduler repeat the same DDL. IF NOT EXISTS does not avoid ALTER table locks.
The log alone cannot distinguish a connection stall from a database lock.

## Decision log
2026-11-10: preserve listening only after successful initialisation. Render uses
TCP health, so opening a placeholder listener early would signal readiness too
soon. Use bounded connection/query/server lock/statement deadlines instead.
Only startup may skip a known applied schema fingerprint; explicit db:migrate
retains repeatable repair/backfill semantics. Never cancel other database users.

## Outcomes and retrospective
549 unit/process fixture tests, type checking, production build and secret scan passed.
PR: https://github.com/beng174/Exter-AI/pull/27.
The disposable PostgreSQL integration passed separately. A stalled local handshake exits after two attempts in
about 21 seconds, with a controlled connect failure and no bound port or printed
connection string. Cached real-Postgres startup serves authenticated health while
DDL/advisory locks are held; explicit failed DDL rolls back and later retries
recover. No production database access or confirmed production lock owner. A
public unauthenticated health probe returned 401, establishing only that a web
listener and auth gate currently respond.

## Context and orientation
server/index.ts awaits server/infrastructure/database.ts before app/listen.
server/infrastructure/runtime.ts uses the same migrate function for worker,
scheduler and manual migration. Three SQL files define public, kernel and owned
schemas. Existing tests rely on explicit migrate replaying safe data repairs.

## Plan of work
Add fixed database connection and per-migration deadlines, typed sanitised errors,
progress phases and an atomic fingerprint receipt. Startup checks receipts before
locking DDL and rechecks under the advisory lock. Retry only transient contention
within a total startup deadline. Add fixture unit, process and disposable
Postgres coverage. Document observable logs and safe deployment/recovery.

## Concrete steps
From /workspace/Exter-startup-fix run npm run check, npm test, npm run build,
npm run secrets:check. Use injected clients and a disposable local PostgreSQL
schema; never production DATABASE_URL or provider credentials.

## Validation and acceptance
Demonstrate bounded failed connections, advisory-lock contention and relation
locks; no held transaction after failure. A repeated startup skips unchanged DDL,
including while a public table is busy; explicit migration still runs data repairs.
Changed SQL creates a new receipt only after commit. Errors never include URLs,
credentials, SQL or server message text. Production startup still authenticates
every route and starts no browser, model or unsolicited provider request.

## Idempotence and recovery
Receipt writes share the schema transaction; failures roll back and retries are
safe. Existing rows/media/analyses are untouched. Close only this migration's
connection on transport/deadline failure, not other database sessions. A manual
db:migrate remains available for deliberate repairs. Rollback code may leave
additive receipt rows in place safely.

## Interfaces and dependencies
Keep migrate(pool) compatible. Add startup-specific options/helper without new
dependencies, environment settings, health endpoint exposure or Render plan
changes. The isolated worktree preserves existing unrelated dirty worktrees.
