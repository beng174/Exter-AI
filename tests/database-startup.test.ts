import test from "node:test";
import assert from "node:assert/strict";
import type pg from "pg";
import { migrate, initialiseInfrastructure, MigrationError, migrationDiagnostic } from "../server/infrastructure/database.js";

const scripts = () => Promise.resolve([
  { phase: "public_schema" as const, sql: "FIXTURE_PUBLIC_SCHEMA" },
  { phase: "kernel_schema" as const, sql: "FIXTURE_KERNEL_SCHEMA" },
  { phase: "owned_schema" as const, sql: "FIXTURE_OWNED_SCHEMA" },
]);
function fixture(onQuery?: (sql: string) => Promise<void> | void) {
  const state = { exists: false, hashes: new Set<string>(), queries: [] as string[], releases: [] as boolean[] };
  const pool = { connect: async () => {
    let exists = state.exists, hashes = new Set(state.hashes);
    return {
      query: async (config: {text:string;values?:string[];query_timeout?:number}) => {
        const {text,values}=config;state.queries.push(text);assert.ok(config.query_timeout!>0);await onQuery?.(text);
        if(text==="COMMIT"){state.exists=exists;state.hashes=hashes;}
        if(text.startsWith("SELECT to_regclass"))return {rows:[{receipt_table:exists?"exter_schema_migrations":null}],rowCount:1};
        if(text.startsWith("SELECT checksum")){const matched=hashes.has(values![0]);return {rows:matched?[{checksum:values![0]}]:[],rowCount:matched?1:0};}
        if(text.startsWith("CREATE TABLE IF NOT EXISTS exter_schema_migrations"))exists=true;
        if(text.startsWith("INSERT INTO exter_schema_migrations"))hashes.add(values![0]);
        return {rows:[],rowCount:0};
      },
      release: (destroy:boolean) => state.releases.push(destroy),
    };
  }} as unknown as pg.Pool;
  return {pool,state};
}
test("startup records an atomic schema receipt, then avoids advisory and DDL locks on unchanged code",async()=>{
 const f=fixture(),options={skipApplied:true,readScripts:scripts};
 const first=await migrate(f.pool,options);assert.equal(first.status,"applied");assert.equal(f.state.hashes.size,1);
 f.state.queries.length=0;const second=await migrate(f.pool,options);assert.equal(second.status,"current");assert.equal(first.checksum,second.checksum);
 assert.ok(!f.state.queries.some(q=>q.includes("pg_advisory")||q.includes("FIXTURE_")||q.startsWith("CREATE")));assert.deepEqual(f.state.releases,[false,false]);
});
test("changed schema content runs once; explicit migration still replays safe repairs",async()=>{
 const f=fixture();await migrate(f.pool,{skipApplied:true,readScripts:scripts});
 const changed=async()=>{const values=await scripts();values[0].sql+="_NEW_COLUMN";return values;};
 assert.equal((await migrate(f.pool,{skipApplied:true,readScripts:changed})).status,"applied");assert.equal(f.state.hashes.size,2);
 f.state.queries.length=0;await migrate(f.pool,{readScripts:changed});assert.ok(f.state.queries.includes("FIXTURE_PUBLIC_SCHEMA_NEW_COLUMN"));
});
test("schema failures close only the migration connection and never commit a receipt or leak raw diagnostics",async()=>{
 const raw="private transport message https://database.example/private?credential=fixture";
 const f=fixture(sql=>{if(sql==="FIXTURE_PUBLIC_SCHEMA")throw Object.assign(new Error(raw),{code:"55P03"});});
 await assert.rejects(migrate(f.pool,{readScripts:scripts}),error=>{
   assert.ok(error instanceof MigrationError);assert.equal(error.code,"migration_lock_timeout");assert.equal(error.phase,"public_schema");assert.equal(error.sqlstate,"55P03");assert.doesNotMatch(migrationDiagnostic(error),/https:|credential|private transport/);return true;
 });assert.deepEqual(f.state.releases,[true]);assert.equal(f.state.hashes.size,0);assert.ok(!f.state.queries.includes("COMMIT"));
 assert.equal(migrationDiagnostic(new Error(raw)),"Database initialisation failed [migration_failed].");
});
test("a stuck query reaches the total deadline and destroys its transaction instead of queuing rollback",{timeout:5000},async()=>{
 const f=fixture(sql=>sql==="FIXTURE_PUBLIC_SCHEMA"?new Promise<void>(()=>{}):undefined),start=Date.now();
 await assert.rejects(migrate(f.pool,{readScripts:scripts,timeoutMs:500}),error=>error instanceof MigrationError&&error.code==="migration_deadline");
 assert.ok(Date.now()-start<3000);assert.deepEqual(f.state.releases,[true]);assert.ok(!f.state.queries.includes("ROLLBACK"));
});
test("a connection acquired after the deadline is discarded, not leaked into an idle transaction",{timeout:5000},async()=>{
 let resolve!:(client:pg.PoolClient)=>void;const releases:boolean[]=[];
 const pool={connect:()=>new Promise<pg.PoolClient>(r=>{resolve=r;})} as unknown as pg.Pool;
 await assert.rejects(migrate(pool,{timeoutMs:500,readScripts:scripts}),error=>error instanceof MigrationError&&error.phase==="connect");
 resolve({release:(destroy:boolean)=>releases.push(destroy)} as unknown as pg.PoolClient);await new Promise(r=>setImmediate(r));assert.deepEqual(releases,[true]);
});
test("startup retries transient contention and rechecks the receipt, but never retries permission failures",async()=>{
 let remaining=1,retries=0;const f=fixture(sql=>{if(sql.includes("pg_advisory")&&remaining-->0)throw Object.assign(new Error("withheld"),{code:"55P03"});});
 assert.equal((await initialiseInfrastructure(f.pool,{readScripts:scripts,timeoutMs:5000,onRetry:()=>retries++})).status,"applied");assert.equal(retries,1);assert.deepEqual(f.state.releases,[true,false]);
 const denied=fixture(sql=>{if(sql==="FIXTURE_PUBLIC_SCHEMA")throw Object.assign(new Error("withheld"),{code:"42501"});});
 await assert.rejects(initialiseInfrastructure(denied.pool,{readScripts:scripts,onRetry:()=>{throw new Error("Must not retry permission failures.");}}),error=>error instanceof MigrationError&&error.code==="migration_permission_denied");assert.deepEqual(denied.state.releases,[true]);
});
test("startup retries share one total deadline rather than resetting it on each attempt",{timeout:5000},async()=>{
 const f=fixture(sql=>{if(sql.includes("pg_advisory"))throw Object.assign(new Error("withheld"),{code:"55P03"});}),start=Date.now();
 await assert.rejects(initialiseInfrastructure(f.pool,{readScripts:scripts,timeoutMs:600}),error=>error instanceof MigrationError);
 assert.ok(Date.now()-start<3000);assert.equal(f.state.hashes.size,0);assert.ok(f.state.releases.every(Boolean));
});
