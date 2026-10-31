CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE IF NOT EXISTS budget_settings (
 cost_type text PRIMARY KEY CHECK(cost_type IN ('inference','data_providers')),
 monthly_budget_gbp numeric NOT NULL CHECK(monthly_budget_gbp >= 0)
);
INSERT INTO budget_settings VALUES ('inference',0),('data_providers',0) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS cost_ledger (
 id text PRIMARY KEY, cost_type text NOT NULL REFERENCES budget_settings,
 provider text NOT NULL, cost_gbp numeric NOT NULL CHECK(cost_gbp >= 0),
 cost_basis text NOT NULL CHECK(cost_basis IN ('estimated','observed')),
 status text NOT NULL DEFAULT 'reserved', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cost_ledger_month ON cost_ledger(cost_type,created_at);
CREATE TABLE IF NOT EXISTS watchlists (
 id text PRIMARY KEY, workspace_id text NOT NULL, page_ids jsonb NOT NULL DEFAULT '[]',
 search_terms jsonb NOT NULL DEFAULT '[]', countries jsonb NOT NULL DEFAULT '["GB"]', enabled boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS collection_runs (
 id text PRIMARY KEY, watchlist_id text NOT NULL REFERENCES watchlists, source text NOT NULL DEFAULT 'meta',
 started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz, status text NOT NULL DEFAULT 'queued',
 records_new integer NOT NULL DEFAULT 0, records_updated integer NOT NULL DEFAULT 0,
 query_index integer NOT NULL DEFAULT 0, cursor text, config jsonb, errors jsonb NOT NULL DEFAULT '[]', last_successful_check timestamptz
);
CREATE TABLE IF NOT EXISTS collection_jobs (
 id text PRIMARY KEY REFERENCES collection_runs, status text NOT NULL DEFAULT 'queued',
 available_at timestamptz NOT NULL DEFAULT now(), lease_until timestamptz, lease_owner text,
 attempts integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS public_ads (
 platform text NOT NULL, native_id text NOT NULL, advertiser_id text,
 first_seen_at timestamptz NOT NULL DEFAULT now(), start_time timestamptz, stop_time timestamptz,
 last_seen_active_at timestamptz, PRIMARY KEY(platform,native_id)
);
CREATE TABLE IF NOT EXISTS ad_observations (
 platform text NOT NULL, native_id text NOT NULL, run_id text NOT NULL REFERENCES collection_runs,
 workspace_id text NOT NULL, observed_at timestamptz NOT NULL DEFAULT now(),
 active_status text NOT NULL, reach jsonb NOT NULL, raw_payload jsonb NOT NULL,
 PRIMARY KEY(platform,native_id,run_id), FOREIGN KEY(platform,native_id) REFERENCES public_ads
);
CREATE TABLE IF NOT EXISTS schedule_slots (
 watchlist_id text NOT NULL REFERENCES watchlists, day date NOT NULL, run_id text NOT NULL REFERENCES collection_runs,
 PRIMARY KEY(watchlist_id,day)
);

ALTER TABLE collection_runs ADD COLUMN IF NOT EXISTS config jsonb;
CREATE TABLE IF NOT EXISTS collection_cursors (
 run_id text NOT NULL REFERENCES collection_runs, query_index integer NOT NULL, cursor text NOT NULL,
 PRIMARY KEY(run_id,query_index,cursor)
);
CREATE TABLE IF NOT EXISTS backup_runs(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,created_at timestamptz NOT NULL,status text NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS watchlists_workspace ON watchlists(workspace_id);
