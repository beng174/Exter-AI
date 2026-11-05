import type pg from "pg";
/** Unit fixture only; integration coverage uses real disposable Postgres. */
export function lookupPool(){
  const state={waitMs:0,reservations:0,sql:[] as string[]};
  const query=async(sql:string,values:unknown[]=[])=>{
    state.sql.push(sql);
    if(sql.startsWith("UPDATE meta_request_gate SET next_request_at=now()"))return {rows:state.waitMs?[]:[{id:1}],rowCount:state.waitMs?0:1};
    if(sql.startsWith("SELECT ceil("))return {rows:[{wait_ms:state.waitMs}]};
    if(sql.startsWith("UPDATE meta_request_gate SET next_request_at=GREATEST")){state.waitMs=Math.max(state.waitMs,Number(values[0]));return {rows:[]};}
    if(sql.startsWith("SELECT monthly_budget_gbp"))return {rows:[{budget:10}]};
    if(sql.startsWith("SELECT COALESCE(sum(cost_gbp)"))return {rows:[{used:0}]};
    if(sql.startsWith("INSERT INTO cost_ledger")){state.reservations++;return {rows:[]};}
    if(sql.startsWith("SELECT page_ids FROM watchlists"))return {rows:[]};
    if(["BEGIN","COMMIT","ROLLBACK"].includes(sql))return {rows:[]};
    throw new Error("Unexpected database operation in lookup fixture.");
  };
  return {state,pool:{query,connect:async()=>({query,release(){}})} as unknown as pg.Pool};
}
