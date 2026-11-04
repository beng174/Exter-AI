/** Disposable Postgres only. Provider transport is entirely synthetic, never live. */
import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { migrate } from "../server/infrastructure/database.js";
import { schedule } from "../server/infrastructure/jobs.js";
import { enqueueOwnedSync, workOwnedOnce } from "../server/owned/jobs.js";
import { attachOwnedAccounts } from "../server/owned/api.js";
import { basicAuth } from "../server/auth.js";
import { pullOwnedDays } from "../server/owned/providers.js";
import { fixtureAccount, fixtureEnv, fixtureFetch } from "./fixtures/owned-fixtures.js";
import meta from "./fixtures/owned/meta-report.json";

const stamp=new Date("2026-11-04T00:00:00Z");
test("CA-01 CA-02 Postgres scheduling, restatement, isolation, revoked tokens and lease recovery",async()=>{
  const connectionString=process.env.TEST_DATABASE_URL;
  assert.ok(connectionString,"Use a dedicated disposable TEST_DATABASE_URL.");
  assert.match(new URL(connectionString).pathname,/fixture|test/,"Refuse an unlabelled database.");
  const pool=new pg.Pool({connectionString});
  try {
    await migrate(pool);await migrate(pool);
    await pool.query("TRUNCATE owned_schedule_slots,owned_ad_days,owned_sync_jobs,owned_accounts CASCADE");
    await pool.query("UPDATE budget_settings SET monthly_budget_gbp=10 WHERE cost_type='data_providers'");
    for(const a of [fixtureAccount(),fixtureAccount({id:"second",account_id:"22",currency:"USD"})])await pool.query("INSERT INTO owned_accounts(id,workspace_id,platform,account_id,currency,attribution,conversion_event,status) VALUES($1,$2,$3,$4,$5,$6,$7,'pending')",[a.id,a.workspace_id,a.platform,a.account_id,a.currency,a.attribution,a.conversion_event]);
    await schedule(pool,stamp);await schedule(pool,stamp);
    assert.equal((await pool.query("SELECT * FROM owned_sync_jobs")).rowCount,2);
    assert.equal((await pool.query("SELECT * FROM owned_schedule_slots")).rowCount,2);
    let calls=0;
    assert.equal(await workOwnedOnce(pool,{env:fixtureEnv}),false,"missing feature flag never dispatches with real fetch");
    const transport=fixtureFetch(()=>calls++);
    const fetcher:typeof fetch=async(target,init)=>{
      const response=await transport(target,init),body=await response.json();
      if(String(target).includes('act_22/insights'))body.data[0].account_currency="USD";
      return Response.json(body);
    };
    for(let i=0;i<2;i++)assert.equal(await workOwnedOnce(pool,{fetch:fetcher,env:fixtureEnv,now:stamp}),true);
    assert.equal(calls,4);
    const days=await pool.query("SELECT * FROM owned_ad_days ORDER BY owned_account_id");
    assert.equal(days.rowCount,2);assert.deepEqual(days.rows.map(row=>row.currency),["GBP","USD"]);
    assert.ok((await pool.query("SELECT * FROM owned_accounts")).rows.every(row=>row.status==="connected"&&row.last_successful_sync&&row.latest_data_date));
    const restated=await enqueueOwnedSync(pool,"first",undefined,new Date("2026-11-05T00:00:00Z"));
    assert.equal((await pool.query("SELECT since_day::text FROM owned_sync_jobs WHERE id=$1",[restated])).rows[0].since_day,"2026-10-30");
    await workOwnedOnce(pool,{env:fixtureEnv,now:new Date("2026-11-05T00:00:00Z"),fetch:async(target,init)=>{
      const response=await fetcher(target,init),body=await response.json();if(String(target).includes('/insights'))body.data[0].spend="120";return Response.json(body);
    }});
    assert.equal((await pool.query("SELECT data FROM owned_ad_days WHERE owned_account_id='first'")).rows[0].data.spend,120);
    assert.equal((await pool.query("SELECT * FROM owned_ad_days")).rowCount,2,"latest pull replaces rather than appends the ad-day");
    await enqueueOwnedSync(pool,"first",undefined,new Date("2026-11-06T00:00:00Z"));
    await workOwnedOnce(pool,{env:fixtureEnv,fetch:async()=>Response.json({error:{code:190,message:fixtureEnv.EXTER_META_ACCESS_TOKEN}})});
    const account=(await pool.query("SELECT * FROM owned_accounts WHERE id='first'")).rows[0];
    assert.equal(account.status,"error");assert.match(account.last_error,/revoked/);assert.equal(account.last_successful_sync.toISOString(),"2026-11-05T00:00:00.000Z");
    assert.equal((await pool.query("SELECT data FROM owned_ad_days WHERE owned_account_id='first'")).rows[0].data.spend,120);
    await schedule(pool,new Date("2026-11-07T00:00:00Z"));
    assert.equal((await pool.query("SELECT * FROM owned_sync_jobs WHERE account_id='first' AND status IN ('queued','running')")).rowCount,0,"scheduler cannot silently resume a revoked account");
    // The other account continues independently on the next day.
    await workOwnedOnce(pool,{fetch:fetcher,env:fixtureEnv,now:new Date("2026-11-07T00:00:00Z")});
    assert.equal((await pool.query("SELECT status FROM owned_accounts WHERE id='second'")).rows[0].status,"connected");
    // A malformed later page must not commit the successful first page.
    await enqueueOwnedSync(pool,"first",undefined,new Date("2026-11-08T00:00:00Z"));
    await workOwnedOnce(pool,{env:fixtureEnv,fetch:async(target,init)=>{
      const url=new URL(String(target));
      if(url.searchParams.has('after'))return Response.json({data:"invalid"});
      if(url.pathname.endsWith('/insights'))return Response.json({data:[{...meta.data[0],spend:"999"}],paging:{next:"ignored",cursors:{after:"next"}}});
      return fetcher(target,init);
    }});
    assert.equal((await pool.query("SELECT data FROM owned_ad_days WHERE owned_account_id='first'")).rows[0].data.spend,120);
    // Lost leases fence results, then a new worker can safely replay the read-only pull.
    const leaseJob=await enqueueOwnedSync(pool,"first",undefined,new Date("2026-11-08T00:00:00Z"));
    await workOwnedOnce(pool,{env:fixtureEnv,fetch:async(target,init)=>{
      const response=await fetcher(target,init);
      if(String(target).includes('/insights'))await pool.query("UPDATE owned_sync_jobs SET lease_until=now()-interval '1 second' WHERE id=$1",[leaseJob]);
      return response;
    }});
    assert.equal((await pool.query("SELECT data FROM owned_ad_days WHERE owned_account_id='first'")).rows[0].data.spend,120);
    await workOwnedOnce(pool,{env:fixtureEnv,fetch:fetcher,now:new Date("2026-11-09T00:00:00Z")});
    assert.equal((await pool.query("SELECT status FROM owned_sync_jobs WHERE id=$1",[leaseJob])).rows[0].status,"complete");
    const wire=JSON.stringify((await pool.query("SELECT row_to_json(a) AS value FROM owned_accounts a UNION ALL SELECT row_to_json(j) FROM owned_sync_jobs j UNION ALL SELECT row_to_json(d) FROM owned_ad_days d")).rows);
    assert.ok(!wire.includes(fixtureEnv.EXTER_META_ACCESS_TOKEN),"no request marker or raw provider error persists");
    const columns=(await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name IN ('owned_accounts','owned_ad_days','owned_sync_jobs')")).rows;
    assert.ok(columns.every(row=>!/token|secret/i.test(row.column_name)));
  }finally{await pool.end();}
});

test("CA-01 authenticated metadata API isolates workspaces and rejects token fields/cross-site writes",async()=>{
  const connectionString=process.env.TEST_DATABASE_URL;
  assert.ok(connectionString,"Use a dedicated disposable TEST_DATABASE_URL.");
  assert.match(new URL(connectionString).pathname,/fixture|test/,"Refuse an unlabelled database.");
  const pool=new pg.Pool({connectionString});
  const app=express();app.use(express.json());app.use(basicAuth({EXTER_ADMIN_USER:"fixture-admin",EXTER_ADMIN_PASSWORD:"fixture-password"}));
  attachOwnedAccounts(app,id=>id==="workspace"||id==="other",()=>pool);
  const server=createServer(app);await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`,headers={Authorization:`Basic ${Buffer.from('fixture-admin:fixture-password').toString('base64')}`,"Content-Type":"application/json"};
  try {
    assert.equal((await fetch(base+'/api/owned/accounts?workspaceId=workspace')).status,401);
    const body={workspaceId:"workspace",platform:"TikTok",accountId:"33",currency:"GBP",attribution:"account_configured",conversionEvent:"purchase"};
    assert.equal((await fetch(base+'/api/owned/accounts',{method:"POST",headers:{...headers,Origin:"https://unrelated.example"},body:JSON.stringify(body)})).status,403);
    assert.equal((await fetch(base+'/api/owned/accounts',{method:"POST",headers,body:JSON.stringify({...body,accessToken:"must-not-store"})})).status,400);
    const saved=await fetch(base+'/api/owned/accounts',{method:"POST",headers,body:JSON.stringify(body)});assert.equal(saved.status,201);const account=await saved.json();
    const listing=await (await fetch(base+'/api/owned/accounts?workspaceId=workspace',{headers})).json();assert.ok(listing.accounts.some((a:any)=>a.id===account.id));assert.equal(listing.liveDispatchEnabled,false);
    assert.equal((await fetch(base+`/api/owned/accounts/${account.id}/sync`,{method:"POST",headers,body:JSON.stringify({workspaceId:"other"})})).status,404);
    const day=(await pullOwnedDays(fixtureAccount({platform:"TikTok",account_id:"33",attribution:"account_configured"}),"2026-11-01","2026-11-04",{fetch:fixtureFetch(),env:fixtureEnv}))[0];
    for(const currency of ["GBP","USD"])await pool.query(`INSERT INTO owned_ad_days VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(owned_account_id,platform,ad_id,day,attribution,currency,conversion_event) DO UPDATE SET data=excluded.data`,[account.id,day.platform,day.adId,day.day,day.attribution,currency,day.conversionEvent,day.pulledAt,JSON.stringify({...day,currency})]);
    const metrics=await (await fetch(base+`/api/owned/accounts/${account.id}/metrics?workspaceId=workspace&from=2026-11-01&to=2026-11-10`,{headers})).json();assert.equal(metrics.cohorts.length,2);assert.ok(metrics.cohorts.every((c:any)=>c.metrics.Spend.value===100));
    const queued=await fetch(base+`/api/owned/accounts/${account.id}/sync`,{method:"POST",headers,body:JSON.stringify({workspaceId:"workspace"})});assert.equal(queued.status,202);
    let missingCalls=0;
    await workOwnedOnce(pool,{env:{},fetch:async()=>{missingCalls++;throw new Error("must not call");}});
    assert.equal(missingCalls,0);assert.equal((await pool.query("SELECT status FROM owned_accounts WHERE id=$1",[account.id])).rows[0].status,"not_connected");
    assert.equal((await pool.query("SELECT * FROM owned_ad_days WHERE owned_account_id=$1",[account.id])).rowCount,2);
    await pool.query("UPDATE budget_settings SET monthly_budget_gbp=0 WHERE cost_type='data_providers'");
    await enqueueOwnedSync(pool,account.id);
    await workOwnedOnce(pool,{env:fixtureEnv,fetch:async()=>{missingCalls++;throw new Error("must not call");}});
    assert.equal(missingCalls,0);assert.match((await pool.query("SELECT last_error FROM owned_accounts WHERE id=$1",[account.id])).rows[0].last_error,/budget/);
    await pool.query("UPDATE budget_settings SET monthly_budget_gbp=10 WHERE cost_type='data_providers'");
    // A new attribution cohort needs a new backfill without deleting old data.
    const update=await fetch(base+'/api/owned/accounts',{method:"POST",headers,body:JSON.stringify({...body,currency:"EUR"})});assert.equal(update.status,201);assert.equal((await update.json()).last_successful_sync,null);
    assert.equal((await pool.query("SELECT * FROM owned_ad_days WHERE owned_account_id=$1",[account.id])).rowCount,2);
    const other=await (await fetch(base+'/api/owned/accounts?workspaceId=other',{headers})).json();assert.deepEqual(other.accounts,[]);
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));await pool.end();}
});
