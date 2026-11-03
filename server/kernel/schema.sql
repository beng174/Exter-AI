-- Additive worker kernel; legacy application records and paid analyses stay intact.
CREATE TABLE IF NOT EXISTS kernel_jobs (
 id uuid PRIMARY KEY,
 workspace_id text NOT NULL,
 platform text NOT NULL CHECK(platform IN ('meta','tiktok')),
 native_ad_id text NOT NULL CHECK(native_ad_id ~ '^[0-9]{1,40}$'),
 idempotency_key text NOT NULL UNIQUE CHECK(idempotency_key ~ '^[a-f0-9]{64}$'),
 artifact jsonb NOT NULL,
 pipeline_version text NOT NULL,
 config jsonb NOT NULL,
 context_hash text NOT NULL CHECK(context_hash ~ '^[a-f0-9]{64}$'),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','paused','review_required','complete','failed','cancelled')),
 checkpoint jsonb NOT NULL DEFAULT '{}',
 result jsonb,
 error_code text CHECK(error_code IN ('transient','authentication','permission','budget','invalid','uncertain_paid','attempts_exhausted','cancelled')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts >= 0),
 retry_count integer NOT NULL DEFAULT 0 CHECK(retry_count >= 0),
 max_attempts integer NOT NULL DEFAULT 3 CHECK(max_attempts BETWEEN 1 AND 10),
 available_at timestamptz NOT NULL DEFAULT now(),
 lease_owner text,
 lease_token integer NOT NULL DEFAULT 0 CHECK(lease_token >= 0),
 lease_until timestamptz,
 paid_dispatch_in_flight boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz,
 CHECK(artifact->>'workspaceId' = workspace_id)
);
CREATE INDEX IF NOT EXISTS kernel_jobs_claim ON kernel_jobs(available_at,created_at) WHERE status IN ('queued','running');
CREATE INDEX IF NOT EXISTS kernel_jobs_workspace ON kernel_jobs(workspace_id,created_at);

-- Request identities fence paid calls independently of worker retries.
-- Rejected calls may reuse their existing hold. Uncertain/completed calls never replay.
CREATE TABLE IF NOT EXISTS kernel_dispatches (
 job_id uuid NOT NULL REFERENCES kernel_jobs,
 request_key text NOT NULL,
 reservation_id text NOT NULL UNIQUE REFERENCES cost_ledger,
 state text NOT NULL CHECK(state IN ('in_flight','rejected','completed','uncertain')),
 attempts integer NOT NULL DEFAULT 1 CHECK(attempts > 0),
 started_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz,
 PRIMARY KEY(job_id,request_key)
);
