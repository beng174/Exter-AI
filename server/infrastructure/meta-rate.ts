import type pg from "pg";
/** The same atomic dispatch slot is shared by collection, Page searches and previews. */
export async function claimMetaRequest(pool:pg.Pool,paceMs=20000):Promise<number>{
  const gate=await pool.query("UPDATE meta_request_gate SET next_request_at=now()+($1 * interval '1 millisecond') WHERE id=1 AND next_request_at<=now() RETURNING id",[paceMs]);
  if(gate.rowCount)return 0;
  const result=await pool.query("SELECT ceil(extract(epoch FROM (next_request_at-now()))*1000)::int AS wait_ms FROM meta_request_gate WHERE id=1");
  return Math.max(1000,result.rows[0]?.wait_ms||20000);
}
export async function delayMetaRequests(pool:pg.Pool,delayMs:number){
  if(delayMs>0)await pool.query("UPDATE meta_request_gate SET next_request_at=GREATEST(next_request_at,now()+($1 * interval '1 millisecond')) WHERE id=1",[delayMs]);
}
