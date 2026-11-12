import test from "node:test";
import assert from "node:assert/strict";
import {brokerAcknowledgement,databaseConnectionError,workerDiagnostic} from "../server/infrastructure/worker-diagnostics.js";
import {workCreatorDiscoveryOnce} from "../server/creators/discovery-jobs.js";
import type pg from "pg";

test("worker diagnostics keep SQLSTATE and application location without raw driver data",()=>{
 const error=Object.assign(new Error("canceling statement due to statement timeout"),{code:"57014",detail:"private query values",query:"private SQL text",parameters:["private parameter"],stack:"Error\n at enqueueAdMedia (/app/server/ad-media/jobs.ts:31:17)"});
 const result=workerDiagnostic(error);assert.equal(result.code,"57014");assert.equal(result.location,"server/ad-media/jobs.ts:31:17");assert.match(result.message,/timed out/);
 for(const secret of ["private query values","private SQL text","private parameter"])assert(!JSON.stringify(result).includes(secret));
 assert(!databaseConnectionError(error));
});
test("worker diagnostics redact credentials, URLs and multiline provider bodies",()=>{
 const env={META_ACCESS_TOKEN:"fixture-token-for-redaction",DATABASE_URL:"postgres://fixture:fixture-pass@db.invalid/private",EXTER_AD_MEDIA_BROKER_TOKEN:"fixture-broker-for-redaction"};
 const result=workerDiagnostic(new TypeError(`Failure ${env.META_ACCESS_TOKEN} ${encodeURIComponent(env.DATABASE_URL)} ${env.EXTER_AD_MEDIA_BROKER_TOKEN} https://fixture.invalid/private?token=private Bearer other-private-value`),env);
 for(const value of Object.values(env))assert(!result.message.includes(value));assert(!result.message.includes("https://"));assert(!result.message.includes("other-private-value"));assert(result.message.length<=300);
 assert.equal(result.name,"TypeError");
});
test("broker diagnostics carry the safe underlying SQL cause and never echo the response body",async()=>{
 const source=workerDiagnostic(Object.assign(new Error("private message"),{code:"57014",stack:"server/ad-media/jobs.ts:18:4"}));
 await assert.rejects(brokerAcknowledgement(Response.json({error:"private body text",diagnostic:source},{status:503})),error=>{
  const result=workerDiagnostic(error);assert.equal(result.code,"57014");assert.equal(result.httpStatus,503);assert.equal(result.location,"server/ad-media/jobs.ts:18:4");assert(!JSON.stringify(result).includes("private body text"));return true;
 });
 await assert.rejects(brokerAcknowledgement(Response.json({error:"private body text"},{status:500})),error=>{assert(!String(error).includes("private body text"));return true;});
 await assert.rejects(brokerAcknowledgement(Response.json({worked:true,diagnostic:{name:"AdMediaError",message:"provider",code:null,location:null,httpStatus:500}})),error=>{assert.equal(workerDiagnostic(error).httpStatus,500);return true;});
});
test("broker acknowledgements are bounded and distinguish busy work from a failed response",async()=>{
 assert.equal(await brokerAcknowledgement(Response.json({worked:true})),true);
 assert.equal(await brokerAcknowledgement(Response.json({worked:false})),false);
 await assert.rejects(brokerAcknowledgement(Response.json({worked:true,extra:"x".repeat(2100)})),/size limit/);
 await assert.rejects(brokerAcknowledgement(Response.json({})),/invalid/);
 await assert.rejects(brokerAcknowledgement(new Response("private malformed response",{status:502})),error=>{assert(!String(error).includes("private malformed response"));return true;});
 assert(databaseConnectionError(Object.assign(new Error("Database connection lost"),{code:"08006"})));
 assert(databaseConnectionError(new Error("Connection terminated unexpectedly")));
 assert(!databaseConnectionError(Object.assign(new Error("deadlock detected"),{code:"40P01"})));
});

test("creator heartbeat is released even when reconciliation and its failure write throw",async context=>{
 const handle={unref(){}};
 const start=context.mock.method(globalThis,"setInterval",()=>handle as any);
 const stop=context.mock.method(globalThis,"clearInterval",()=>{});
 const failure=Object.assign(new Error("fixture status write failed"),{code:"57014"});let claims=0;
 const pool={query:async(sql:string)=>{
  if(sql.startsWith("UPDATE creator_discovery_runs SET status=CASE")&&claims++===0)return {rows:[{id:"fixture-search",workspace_id:"workspace",reconcile_requested:true}]};
  throw failure;
 }} as unknown as pg.Pool;
 await assert.rejects(workCreatorDiscoveryOnce(pool,{env:{}}),failure);
 assert.equal(start.mock.callCount(),1);
 assert(stop.mock.calls.some(call=>call.arguments[0]===handle));
});
