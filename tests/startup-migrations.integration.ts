// Disposable local PostgreSQL only. No provider requests or production data.
import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate, initialiseInfrastructure, MigrationError } from "../server/infrastructure/database.js";

async function bootWithCurrentSchema(connectionString:string) {
 const root=mkdtempSync(join(tmpdir(),"exter-current-schema-")),socket=createServer();
 await new Promise<void>(r=>socket.listen(0,"127.0.0.1",r));const port=(socket.address() as {port:number}).port;await new Promise<void>(r=>socket.close(()=>r()));
 const outbound=join(root,"outbound"),guard=join(root,"guard.mjs");writeFileSync(guard,`import {appendFileSync} from 'node:fs';globalThis.fetch=async()=>{appendFileSync(${JSON.stringify(outbound)},'attempt');throw new Error('Fixture blocks source calls.');};`);
 const env={...process.env};for(const key of ["GEMINI_API_KEY","META_ACCESS_TOKEN","APIFY_TOKEN","EXTER_META_ACCESS_TOKEN","EXTER_TIKTOK_ACCESS_TOKEN"])delete env[key];
 Object.assign(env,{NODE_ENV:"production",EXTER_ADMIN_USER:"fixture",EXTER_ADMIN_PASSWORD:"fixture-only",PORT:String(port),DATABASE_URL:connectionString,EXTER_DB_PATH:join(root,"app.db"),MEDIA_STORAGE_TYPE:"disk",MEDIA_STORAGE_PATH:join(root,"media"),EXTER_BACKUPS_ENABLED:"false",EXTER_META_LIBRARY_ENABLED:"false",EXTER_AD_MEDIA_ENABLED:"false",EXTER_OWNED_SYNC_ENABLED:"false"});
 const child=spawn(process.execPath,["--import",guard,"--import","tsx","server/index.ts"],{env,stdio:["ignore","pipe","pipe"]});let output="",code:number|null=null;
 child.stdout.on("data",c=>output+=String(c));child.stderr.on("data",c=>output+=String(c));child.once("exit",value=>{code=value;});
 try{
  const deadline=Date.now()+12000;while(!output.includes("Exter AI available on port")){assert.equal(code,null);assert.ok(Date.now()<deadline,"Cached production startup must not wait for table/advisory locks.");await new Promise(r=>setTimeout(r,25));}
  assert.match(output,/Database initialisation complete/);assert.doesNotMatch(output,/Database initialisation: (?:advisory_lock|public_schema)/);
  const url=`http://127.0.0.1:${port}/api/health`;assert.equal((await fetch(url)).status,401);
  const health=await fetch(url,{headers:{authorization:`Basic ${Buffer.from("fixture:fixture-only").toString("base64")}`}});assert.equal(health.status,200);assert.equal((await health.json()).status,"ok");
  assert.equal(existsSync(outbound),false);assert.ok(!output.includes(connectionString));
 }finally{const stopped=new Promise<void>(r=>child.once("exit",()=>r()));if(child.exitCode===null){child.kill("SIGTERM");await Promise.race([stopped,new Promise(r=>setTimeout(r,2000))]);if(child.exitCode===null){child.kill("SIGKILL");await stopped;}}rmSync(root,{recursive:true,force:true});}
}

test("startup avoids held DDL/advisory locks when current and rolls back bounded failed migrations",{timeout:30000},async()=>{
 const connectionString=process.env.TEST_DATABASE_URL;assert.ok(connectionString,"A dedicated disposable TEST_DATABASE_URL is required.");
 const schema=`startup_${randomUUID().replaceAll("-","")}`,admin=new pg.Pool({connectionString,connectionTimeoutMillis:2000});
 await admin.query("CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public");await admin.query(`CREATE SCHEMA ${schema}`);
 const pool=new pg.Pool({connectionString,options:`-c search_path=${schema},public`,max:5,connectionTimeoutMillis:2000});
 const locker=await pool.connect();
 try{
  assert.equal((await initialiseInfrastructure(pool)).status,"applied");
  await pool.query("INSERT INTO public_ads(platform,native_id,advertiser_id) VALUES('Meta','123456789','98765')");
  await pool.query("UPDATE budget_settings SET monthly_budget_gbp=17 WHERE cost_type='inference'");
  await locker.query("BEGIN");await locker.query("LOCK TABLE ad_observations IN ACCESS SHARE MODE");await locker.query("SELECT pg_advisory_xact_lock(1742026)");
  const phases:string[]=[],start=Date.now();assert.equal((await initialiseInfrastructure(pool,{timeoutMs:2000,onProgress:p=>phases.push(p)})).status,"current");
  assert.ok(Date.now()-start<2000);assert.ok(!phases.includes("advisory_lock"));assert.ok(!phases.includes("public_schema"));
  const childUrl=new URL(connectionString);childUrl.searchParams.set("options",`-c search_path=${schema},public`);await bootWithCurrentSchema(childUrl.href);
  await locker.query("ROLLBACK");
  await locker.query("BEGIN");await locker.query("LOCK TABLE ad_observations IN ACCESS SHARE MODE");
  await assert.rejects(migrate(pool,{lockTimeoutMs:100,timeoutMs:3000}),e=>e instanceof MigrationError&&e.code==="migration_lock_timeout"&&e.phase==="public_schema");
  await locker.query("ROLLBACK");
  assert.equal((await pool.query("SELECT count(*) AS n FROM public_ads")).rows[0].n,"1");
  assert.equal(Number((await pool.query("SELECT monthly_budget_gbp FROM budget_settings WHERE cost_type='inference'")).rows[0].monthly_budget_gbp),17);
  assert.equal((await pool.query("SELECT count(*) AS n FROM exter_schema_migrations")).rows[0].n,"1");
  const probe=await pool.connect();try{assert.equal((await probe.query("SELECT pg_try_advisory_lock(1742026) AS acquired")).rows[0].acquired,true);await probe.query("SELECT pg_advisory_unlock(1742026)");}finally{probe.release();}
  assert.equal((await pool.query("SHOW lock_timeout")).rows[0].lock_timeout,"0");assert.equal((await pool.query("SHOW statement_timeout")).rows[0].statement_timeout,"0");
  // Simulate a newly versioned schema while another service temporarily holds the lock.
  await locker.query("BEGIN");await locker.query("SELECT pg_advisory_xact_lock(1742026)");
  const scripts=async()=>[{phase:"public_schema" as const,sql:"CREATE TABLE next_startup_fixture(id integer PRIMARY KEY)"},{phase:"kernel_schema" as const,sql:"SELECT 1"},{phase:"owned_schema" as const,sql:"SELECT 1"}];
  const delayed=initialiseInfrastructure(pool,{lockTimeoutMs:50,timeoutMs:3000,readScripts:scripts});
  await new Promise(r=>setTimeout(r,200));await locker.query("ROLLBACK");assert.equal((await delayed).status,"applied");
  assert.equal((await pool.query("SELECT count(*) AS n FROM exter_schema_migrations")).rows[0].n,"2");
  // Manual migration retains its intentional historical-reserve backfill.
  await pool.query("INSERT INTO cost_ledger(id,cost_type,provider,cost_gbp,cost_basis,status) VALUES('fixture-hold','inference','fixture',1,'estimated','reserved')");
  await migrate(pool);assert.equal(Number((await pool.query("SELECT initial_reserved_gbp FROM cost_ledger WHERE id='fixture-hold'")).rows[0].initial_reserved_gbp),1);
 }finally{await locker.query("ROLLBACK").catch(()=>{});locker.release();await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});
