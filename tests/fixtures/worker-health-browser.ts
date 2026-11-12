// Manual browser fixture. Use a disposable local TEST_DATABASE_URL and npm run build.
import express from "express";
import {createServer} from "node:http";
import {randomUUID} from "node:crypto";
import {creativeFixture} from "./creative-sql.js";
import {recordWorkerFailure} from "../../server/infrastructure/worker-recovery.js";
import {workerDiagnostic} from "../../server/infrastructure/worker-diagnostics.js";

const testUrl=new URL(process.env.TEST_DATABASE_URL!);
if(!["127.0.0.1","localhost"].includes(testUrl.hostname))throw new Error("Use a local disposable fixture database.");
await creativeFixture(async(pool,db)=>{
 const parsed=new URL(process.env.TEST_DATABASE_URL!);parsed.searchParams.set("options",pool.options.options!);process.env.DATABASE_URL=parsed.toString();
 Object.assign(process.env,{EXTER_ADMIN_USER:"fixture",EXTER_ADMIN_PASSWORD:"fixture-only",EXTER_META_LIBRARY_ENABLED:"false",EXTER_AD_MEDIA_ENABLED:"false",EXTER_OWNED_SYNC_ENABLED:"false",EXTER_KERNEL_WORKER_ENABLED:"false"});
 globalThis.fetch=async()=>{throw new Error("External calls are blocked in this fixture.");};
 const id=randomUUID(),setup=randomUUID();
 await pool.query("INSERT INTO ad_media_runs(id,watchlist_id,workspace_id,brand_key,revision,page_id,window_from,window_to,phase,cap,status,actor_run_id) VALUES($1,'own','workspace','workspace',1,'12','2025-11-01','2026-11-11','missing',12,'running','fixtureRun10000001')",[id]);
 await pool.query("INSERT INTO brand_onboarding_runs(id,workspace_id,kind) VALUES($1,'workspace','initial')",[setup]);
 for(let n=0;n<3;n++){
  await recordWorkerFailure(pool,"media",{id,owner:"fixture-owner",workspaceId:"workspace",status:"running"},workerDiagnostic(Object.assign(new Error("canceling statement due to statement timeout"),{code:"57014",stack:"server/ad-media/jobs.ts:31:17"})));
  await recordWorkerFailure(pool,"onboarding",{id:setup,owner:"fixture-owner",workspaceId:"workspace",status:"queued"},workerDiagnostic(Object.assign(new TypeError("Cannot read properties of undefined (reading 'phase')"),{stack:"server/onboarding/worker.ts:10:12"})));
  await recordWorkerFailure(pool,"categories",null,workerDiagnostic(Object.assign(new Error("column is missing"),{code:"42703",stack:"server/public-categories/jobs.ts:55:18"})));
 }
 const {createApp}=await import("../../server/app.js"),{infrastructureDatabase}=await import("../../server/infrastructure/database.js");
 const app=createApp(db);app.use(express.static("dist"));const server=createServer(app);await new Promise<void>(resolve=>server.listen(5188,"127.0.0.1",resolve));console.log("Worker browser fixture ready on localhost:5188.");
 await new Promise<void>(resolve=>process.once("SIGTERM",()=>resolve()));await new Promise<void>(resolve=>server.close(()=>resolve()));await infrastructureDatabase().end();
},12);
