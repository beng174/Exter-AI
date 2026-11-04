-- CA-01/CA-02: credentials and raw provider payloads never enter these tables.
CREATE TABLE IF NOT EXISTS owned_accounts (
 id text PRIMARY KEY, workspace_id text NOT NULL,
 platform text NOT NULL CHECK(platform IN ('Meta','TikTok')), account_id text NOT NULL,
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 attribution text NOT NULL, conversion_event text NOT NULL,
 status text NOT NULL DEFAULT 'not_connected' CHECK(status IN ('not_connected','pending','syncing','connected','error')),
 enabled boolean NOT NULL DEFAULT true,
 last_successful_sync timestamptz, latest_data_date date, last_error text,
 UNIQUE(workspace_id,platform,account_id)
);
CREATE TABLE IF NOT EXISTS owned_ad_days (
 owned_account_id text NOT NULL REFERENCES owned_accounts(id),
 platform text NOT NULL CHECK(platform IN ('Meta','TikTok')), ad_id text NOT NULL, day date NOT NULL,
 attribution text NOT NULL, currency text NOT NULL, conversion_event text NOT NULL,
 pulled_at timestamptz NOT NULL, data jsonb NOT NULL,
 PRIMARY KEY(owned_account_id,platform,ad_id,day,attribution,currency,conversion_event)
);
CREATE TABLE IF NOT EXISTS owned_sync_jobs (
 id text PRIMARY KEY, account_id text NOT NULL REFERENCES owned_accounts(id),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','complete','failed','not_connected')),
 since_day date NOT NULL, until_day date NOT NULL,
 available_at timestamptz NOT NULL DEFAULT now(), lease_until timestamptz, lease_owner text,
 attempts integer NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS owned_one_active_job ON owned_sync_jobs(account_id) WHERE status IN ('queued','running');
CREATE TABLE IF NOT EXISTS owned_schedule_slots (
 account_id text NOT NULL REFERENCES owned_accounts(id), day date NOT NULL,
 job_id text NOT NULL REFERENCES owned_sync_jobs(id), PRIMARY KEY(account_id,day)
);
