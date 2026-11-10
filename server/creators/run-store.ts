import type pg from "pg";
export const actorIdValid=(v:unknown):v is string=>typeof v==="string" && /^[A-Za-z0-9_-]{1,100}$/.test(v);
export const finalActorStatus=(s:string)=>["SUCCEEDED","FAILED","ABORTED","TIMED-OUT"].includes(s);
export interface CreatorRunScope {workspaceId?:string;searchId?:string;phase?:string;step?:number}
export interface CreatorActorRun {reservationId:string;reservedGbp:number;conversion:number;runId:string|null;datasetId:string|null;status:string;found:number|null;startedAt:string;usageUsd:number|null;readComplete?:boolean}
export async function storedCreatorRun(pool:pg.Pool,scope:CreatorRunScope):Promise<CreatorActorRun|null>{
 if(!scope.searchId)return null;
 const row=(await pool.query("SELECT r.*,l.initial_reserved_gbp FROM creator_provider_runs r JOIN cost_ledger l ON l.id=r.reservation_id WHERE search_id=$1 AND phase=$2 AND step=$3",[scope.searchId,scope.phase,scope.step])).rows[0];
 return row?{reservationId:row.reservation_id,reservedGbp:Number(row.initial_reserved_gbp),conversion:Number(row.gbp_per_usd),runId:row.actor_run_id,datasetId:row.dataset_id,status:row.status,found:row.found,startedAt:new Date(row.started_at).toISOString(),usageUsd:row.usage_usd===null?null:Number(row.usage_usd),readComplete:row.read_complete}:null;
}
export async function trackCreatorReservation(pool:pg.Pool,scope:CreatorRunScope,row:CreatorActorRun,actor:string){
 await pool.query(`INSERT INTO creator_provider_runs(reservation_id,workspace_id,search_id,phase,step,actor_id,gbp_per_usd,started_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[row.reservationId,scope.workspaceId??null,scope.searchId??null,scope.phase??null,scope.step??null,actor,row.conversion,row.startedAt]);
}
export async function trackCreatorProgress(pool:pg.Pool,row:CreatorActorRun){
 await pool.query(`UPDATE creator_provider_runs SET actor_run_id=$2,dataset_id=$3,status=$4,found=COALESCE($5,found),usage_usd=COALESCE($6,usage_usd),checked_at=now() WHERE reservation_id=$1 AND (actor_run_id IS NULL OR actor_run_id=$2)`,[row.reservationId,row.runId,row.datasetId,row.status,row.found,row.usageUsd]);
}
/** A final authenticated run total is billing evidence; missing totals keep their hold. */
export async function settleCreatorRun(pool:pg.Pool,row:CreatorActorRun){
 if(!row.runId || !finalActorStatus(row.status) || row.usageUsd===null || !Number.isFinite(row.usageUsd) || row.usageUsd<0 || !(row.conversion>0))return false;
 const amount=Math.round(row.usageUsd*row.conversion*1e6)/1e6,client=await pool.connect();
 try{await client.query("BEGIN");await client.query("SELECT monthly_budget_gbp FROM budget_settings WHERE cost_type='data_providers' FOR UPDATE");
 const target=(await client.query(`SELECT r.actor_run_id,l.status,l.provider,l.cost_type FROM creator_provider_runs r JOIN cost_ledger l ON l.id=r.reservation_id WHERE r.reservation_id=$1 FOR UPDATE OF r,l`,[row.reservationId])).rows[0];
 if(!target || target.actor_run_id!==row.runId || target.provider!=="apify" || target.cost_type!=="data_providers")throw new Error("Creator billing identity could not be verified.");
 if(["reserved","settled"].includes(target.status))await client.query("UPDATE cost_ledger SET cost_gbp=$2,cost_basis='observed',status='settled' WHERE id=$1",[row.reservationId,amount]);
 else if(target.status!=="settled")throw new Error("Creator hold cannot be settled.");
 await client.query("UPDATE creator_provider_runs SET usage_usd=$2,settled_at=COALESCE(settled_at,now()) WHERE reservation_id=$1",[row.reservationId,row.usageUsd]);
 await client.query("COMMIT");return true;
 }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
}
export async function creatorRunViews(pool:pg.Pool,ids:string[]){
 if(!ids.length)return [];
 return (await pool.query(`SELECT r.*,l.cost_gbp::float8,l.initial_reserved_gbp::float8,l.status AS cost_status FROM creator_provider_runs r JOIN cost_ledger l ON l.id=r.reservation_id WHERE search_id=ANY($1::text[]) ORDER BY started_at LIMIT 2000`,[ids])).rows.map(r=>({reservationId:r.reservation_id,searchId:r.search_id,runId:r.actor_run_id,status:r.status,found:r.found,usageUsd:r.usage_usd===null?null:Number(r.usage_usd),costGbp:r.cost_status==="settled"?r.cost_gbp:null,heldGbp:r.cost_status==="reserved"?r.cost_gbp:0,startedAt:new Date(r.started_at).toISOString(),checkedAt:r.checked_at?new Date(r.checked_at).toISOString():null}));
}

export async function legacyCreatorHolds(pool:pg.Pool,job:Record<string,any>){
 return (await pool.query(`SELECT l.id,l.cost_gbp::float8 AS held_gbp,l.created_at FROM cost_ledger l LEFT JOIN creator_provider_runs r ON r.reservation_id=l.id WHERE l.provider='apify' AND l.cost_type='data_providers' AND l.status='reserved' AND r.actor_run_id IS NULL AND (r.search_id=$1 OR r.search_id IS NULL AND l.created_at BETWEEN $2 AND $3) ORDER BY l.created_at LIMIT 100`,[job.id,job.created_at,job.reconcile_window_end??job.available_at])).rows.map(r=>({reservationId:r.id,heldGbp:r.held_gbp,createdAt:new Date(r.created_at).toISOString()}));
}
