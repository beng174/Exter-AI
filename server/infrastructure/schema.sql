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
-- Preserve the original hold when it is later settled or explicitly released.
-- Earlier settled/released rows cannot establish their original hold; leave null.
ALTER TABLE cost_ledger ADD COLUMN IF NOT EXISTS initial_reserved_gbp numeric CHECK(initial_reserved_gbp >= 0);
UPDATE cost_ledger SET initial_reserved_gbp=cost_gbp WHERE initial_reserved_gbp IS NULL AND status='reserved';
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

ALTER TABLE watchlists ADD COLUMN IF NOT EXISTS brand_key text;
ALTER TABLE watchlists ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'brand' CHECK(purpose IN ('brand','discovery'));
ALTER TABLE watchlists ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1;
DROP INDEX IF EXISTS watchlists_workspace;
CREATE UNIQUE INDEX IF NOT EXISTS watchlists_workspace_brand ON watchlists(workspace_id,brand_key) WHERE brand_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS watchlists_workspace_page ON watchlists(workspace_id,(page_ids->>0)) WHERE purpose='brand' AND enabled AND brand_key IS NOT NULL AND jsonb_array_length(page_ids)=1;
CREATE TABLE IF NOT EXISTS meta_request_gate(id integer PRIMARY KEY CHECK(id=1),next_request_at timestamptz NOT NULL DEFAULT now());
INSERT INTO meta_request_gate(id) VALUES(1) ON CONFLICT DO NOTHING;

-- Keep all historical rows and payloads. New unchanged checks only advance confirmation.
ALTER TABLE ad_observations ADD COLUMN IF NOT EXISTS last_confirmed_at timestamptz;
ALTER TABLE ad_observations ADD COLUMN IF NOT EXISTS payload_hash text;
ALTER TABLE ad_observations ADD COLUMN IF NOT EXISTS observation_hash text;
ALTER TABLE ad_observations ADD COLUMN IF NOT EXISTS raw_payload_run_id text;
ALTER TABLE ad_observations ALTER COLUMN raw_payload DROP NOT NULL;
CREATE INDEX IF NOT EXISTS ad_observations_latest ON ad_observations(workspace_id,platform,native_id,observed_at DESC,run_id DESC);
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ad_observations_payload_source') THEN
  ALTER TABLE ad_observations ADD CONSTRAINT ad_observations_payload_source
   FOREIGN KEY(platform,native_id,raw_payload_run_id) REFERENCES ad_observations(platform,native_id,run_id) NOT VALID;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ad_observations_payload_present') THEN
  ALTER TABLE ad_observations ADD CONSTRAINT ad_observations_payload_present
   CHECK(raw_payload IS NOT NULL OR raw_payload_run_id IS NOT NULL) NOT VALID;
 END IF;
END $$;

CREATE TABLE IF NOT EXISTS database_size_samples (
 sample_hour timestamptz PRIMARY KEY, measured_at timestamptz NOT NULL,
 size_bytes bigint NOT NULL CHECK(size_bytes>=0)
);
ALTER TABLE watchlists ADD COLUMN IF NOT EXISTS meta_page_size integer NOT NULL DEFAULT 100 CHECK(meta_page_size IN (100,50,25,10));
ALTER TABLE collection_jobs ADD COLUMN IF NOT EXISTS page_size integer CHECK(page_size IN (100,50,25,10));
ALTER TABLE collection_runs ADD COLUMN IF NOT EXISTS pages_fetched integer CHECK(pages_fetched>=0);
ALTER TABLE collection_runs ADD COLUMN IF NOT EXISTS stopped_at timestamptz;
CREATE TABLE IF NOT EXISTS meta_collection_failures (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 run_id text NOT NULL REFERENCES collection_runs,attempted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 kind text NOT NULL CHECK(kind IN ('legacy','budget','not_connected','permission','schema','retry_limit','rate_limited','timeout','unavailable','page_size','disabled','page_id')),
 graph_code integer CHECK(graph_code>=0),graph_subcode integer CHECK(graph_subcode>=0),
 http_status integer CHECK(http_status BETWEEN 100 AND 599),page_size integer CHECK(page_size IN (100,50,25,10)),
 timed_out boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS meta_collection_failures_run ON meta_collection_failures(run_id,id DESC);

-- Media-only enrichment; official observations and retained media are never replaced.
CREATE TABLE IF NOT EXISTS ad_media_runs (
 id text PRIMARY KEY,watchlist_id text NOT NULL REFERENCES watchlists,workspace_id text NOT NULL,brand_key text NOT NULL,
 revision integer NOT NULL,page_id text NOT NULL,window_from date NOT NULL,window_to date NOT NULL,
 phase text NOT NULL CHECK(phase IN ('page','missing')),target_ids jsonb NOT NULL DEFAULT '[]',priority_ids jsonb NOT NULL DEFAULT '[]',
 cap integer NOT NULL CHECK(cap BETWEEN 1 AND 500),status text NOT NULL DEFAULT 'queued',
 actor_run_id text,dataset_id text,reservation_id text REFERENCES cost_ledger,gbp_per_usd numeric CHECK(gbp_per_usd>0),
 result_offset integer NOT NULL DEFAULT 0,results integer NOT NULL DEFAULT 0,ads_with_media integer NOT NULL DEFAULT 0,
 error_kind text,started_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz,
 available_at timestamptz NOT NULL DEFAULT now(),lease_owner text,lease_until timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS ad_media_one_active ON ad_media_runs(watchlist_id) WHERE status IN ('queued','running','starting','uncertain','paused');
CREATE INDEX IF NOT EXISTS ad_media_available ON ad_media_runs(available_at) WHERE status IN ('queued','running','starting');
CREATE INDEX IF NOT EXISTS ad_media_workspace_runs ON ad_media_runs(workspace_id,started_at DESC);
CREATE TABLE IF NOT EXISTS ad_media_creatives (
 id text PRIMARY KEY,run_id text NOT NULL REFERENCES ad_media_runs,workspace_id text NOT NULL,brand_key text NOT NULL,native_id text NOT NULL,
 page_id text NOT NULL,format text CHECK(format IN ('image','video','carousel','catalogue')),assets jsonb NOT NULL DEFAULT '[]',
 video_eligible boolean NOT NULL DEFAULT false,complete boolean NOT NULL DEFAULT false,expected_videos integer NOT NULL DEFAULT 0,error_kind text,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(run_id,native_id)
);
CREATE INDEX IF NOT EXISTS ad_media_creatives_latest ON ad_media_creatives(workspace_id,brand_key,native_id,created_at DESC);

ALTER TABLE ad_media_runs ADD COLUMN IF NOT EXISTS download_videos boolean NOT NULL DEFAULT false;
ALTER TABLE ad_media_runs ADD COLUMN IF NOT EXISTS known_video_ids jsonb NOT NULL DEFAULT '[]';
ALTER TABLE ad_media_runs ADD COLUMN IF NOT EXISTS known_video_candidates jsonb NOT NULL DEFAULT '[]';
CREATE TABLE IF NOT EXISTS ad_media_preview_days (
 workspace_id text NOT NULL,brand_key text NOT NULL,page_id text NOT NULL,native_id text NOT NULL,
 day date NOT NULL,run_id text NOT NULL REFERENCES ad_media_runs,attempted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reason text NOT NULL CHECK(reason IN ('not_returned','expired','unsupported','wrong_page','provider','disk')),
 PRIMARY KEY(workspace_id,brand_key,page_id,native_id,day)
);
CREATE TABLE IF NOT EXISTS ad_media_disk_health (
 id integer PRIMARY KEY CHECK(id=1),data jsonb NOT NULL,measured_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public_category_batches (
 id text PRIMARY KEY,workspace_id text NOT NULL,items jsonb NOT NULL,status text NOT NULL DEFAULT 'queued',
 model text NOT NULL,provider_name text,reservation_id text REFERENCES cost_ledger,gbp_per_usd numeric,
 error_kind text,created_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz,
 available_at timestamptz NOT NULL DEFAULT now(),lease_owner text,lease_until timestamptz
);
CREATE INDEX IF NOT EXISTS public_category_workspace ON public_category_batches(workspace_id,status);
CREATE TABLE IF NOT EXISTS public_category_refill_gate(id integer PRIMARY KEY CHECK(id=1),next_check timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS public_ad_categories (
 workspace_id text NOT NULL,brand_key text NOT NULL,page_id text NOT NULL,native_id text NOT NULL,source_hash text NOT NULL,
 prompt_version text NOT NULL,model text NOT NULL,categories jsonb NOT NULL,batch_id text NOT NULL REFERENCES public_category_batches,
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(workspace_id,brand_key,page_id,native_id,source_hash,prompt_version)
);

-- Only sanitised, explicitly approved user diagnostics; generic Graph text stays excluded.
ALTER TABLE meta_collection_failures ADD COLUMN IF NOT EXISTS error_user_title text CHECK(char_length(error_user_title)<=300);
ALTER TABLE meta_collection_failures ADD COLUMN IF NOT EXISTS error_user_msg text CHECK(char_length(error_user_msg)<=300);
ALTER TABLE ad_media_runs ADD COLUMN IF NOT EXISTS requested_ids jsonb;
ALTER TABLE ad_media_runs ADD COLUMN IF NOT EXISTS dispatched_at timestamptz;
ALTER TABLE ad_media_runs ADD COLUMN IF NOT EXISTS returned_ads integer NOT NULL DEFAULT 0;
ALTER TABLE ad_media_runs ADD COLUMN IF NOT EXISTS matched_ads integer NOT NULL DEFAULT 0;
ALTER TABLE ad_media_runs ADD COLUMN IF NOT EXISTS actor_requested_count integer;
ALTER TABLE ad_media_runs ADD COLUMN IF NOT EXISTS actor_returned_count integer;
ALTER TABLE ad_media_runs ADD COLUMN IF NOT EXISTS actor_query_count integer;
ALTER TABLE ad_media_runs ADD COLUMN IF NOT EXISTS actor_stop_reasons jsonb NOT NULL DEFAULT '[]';
ALTER TABLE ad_media_runs ADD COLUMN IF NOT EXISTS input_details jsonb;
CREATE TABLE IF NOT EXISTS ad_media_requests (
 run_id text NOT NULL REFERENCES ad_media_runs,native_id text NOT NULL,
 requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),returned_at timestamptz,matched_at timestamptz,
 outcome text NOT NULL DEFAULT 'requested' CHECK(outcome IN ('requested','not_returned','expired','unsupported','wrong_page','stored','disk','provider')),
 PRIMARY KEY(run_id,native_id)
);
CREATE INDEX IF NOT EXISTS ad_media_requests_ad ON ad_media_requests(native_id,requested_at DESC);

ALTER TABLE ad_media_runs ADD COLUMN IF NOT EXISTS actor_input_count integer;
ALTER TABLE ad_media_runs ADD COLUMN IF NOT EXISTS actor_input_checked boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS ad_media_refill_gate(id integer PRIMARY KEY CHECK(id=1),next_check timestamptz NOT NULL);
ALTER TABLE ad_media_runs ADD COLUMN IF NOT EXISTS known_media_ids jsonb NOT NULL DEFAULT '[]';

-- Public creator research is isolated by workspace; no tokens or raw provider datasets.
CREATE TABLE IF NOT EXISTS creator_discovery_settings (
 workspace_id text PRIMARY KEY, brief jsonb NOT NULL, brief_version text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS creator_discovery_quotes (
 id text PRIMARY KEY, workspace_id text NOT NULL, brief jsonb NOT NULL, brief_version text NOT NULL,
 max_cost_gbp numeric NOT NULL, per_batch_gbp numeric NOT NULL, conversion numeric NOT NULL,
 batches integer NOT NULL, expires_at timestamptz NOT NULL, used boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS creator_discovery_runs (
 id text PRIMARY KEY, workspace_id text NOT NULL, kind text NOT NULL,
 status text NOT NULL DEFAULT 'queued', brief jsonb NOT NULL, brief_version text NOT NULL,
 steps jsonb NOT NULL, step integer NOT NULL DEFAULT 0, phase text NOT NULL DEFAULT 'discover',
 max_cost_gbp numeric NOT NULL DEFAULT 0, per_batch_gbp numeric NOT NULL DEFAULT 0, conversion numeric NOT NULL DEFAULT .8,
 reserved_gbp numeric NOT NULL DEFAULT 0, found integer NOT NULL DEFAULT 0, verified integer NOT NULL DEFAULT 0,
 error text, created_at timestamptz NOT NULL DEFAULT now(), available_at timestamptz NOT NULL DEFAULT now(),
 lease_owner text, lease_until timestamptz, dispatch_started boolean NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX IF NOT EXISTS creator_discovery_active ON creator_discovery_runs(workspace_id) WHERE status IN ('queued','running');
CREATE INDEX IF NOT EXISTS creator_discovery_queue ON creator_discovery_runs(status,available_at);
CREATE TABLE IF NOT EXISTS creator_discovery_results (
 workspace_id text NOT NULL, handle text NOT NULL, profile jsonb NOT NULL, evaluation jsonb NOT NULL,
 brief_version text NOT NULL, saved boolean NOT NULL DEFAULT false, needs_enrichment boolean NOT NULL DEFAULT true,
 verification_due boolean NOT NULL DEFAULT true, next_refresh_at timestamptz NOT NULL DEFAULT now(),
 used_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(workspace_id,handle)
);
CREATE INDEX IF NOT EXISTS creator_discovery_refresh ON creator_discovery_results(next_refresh_at) WHERE saved;
CREATE TABLE IF NOT EXISTS creator_discovery_segments (
 id text PRIMARY KEY, workspace_id text NOT NULL, name text NOT NULL, filters jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS creator_discovery_suppression (
 workspace_id text NOT NULL, handle_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(workspace_id,handle_hash)
);
CREATE TABLE IF NOT EXISTS creator_discovery_previews (
 workspace_id text NOT NULL, handle text NOT NULL, post_id text NOT NULL, image bytea NOT NULL CHECK(octet_length(image)<=200000),
 PRIMARY KEY(workspace_id,handle,post_id), FOREIGN KEY(workspace_id,handle) REFERENCES creator_discovery_results ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS creator_discovery_validation (
 workspace_id text PRIMARY KEY, brief_version text NOT NULL, input_hash text NOT NULL, results jsonb NOT NULL, checked_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS creator_discovery_ad_handles (
 workspace_id text NOT NULL, handle text NOT NULL, ad_ids jsonb NOT NULL, PRIMARY KEY(workspace_id,handle)
);

ALTER TABLE creator_discovery_runs ADD COLUMN IF NOT EXISTS handles jsonb NOT NULL DEFAULT '[]';
