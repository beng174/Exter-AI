import {randomUUID} from 'node:crypto';
import type pg from 'pg';
/** A cancelled page relinquishes its socket and cancels only its tagged SQL read. */
export async function readConnection(pool:pg.Pool,signal?:AbortSignal){
 signal?.throwIfAborted();
 const client=await pool.connect(),tag=`creative-read:${randomUUID()}`;
 let released=false;
 const release=(destroy=false)=>{if(released)return;released=true;signal?.removeEventListener('abort',abort);client.release(destroy);};
 const abort=()=>{
  const pid=(client as pg.PoolClient&{processID?:number}).processID;
  release(true);
  if(Number.isInteger(pid)){const cancellation:pg.QueryConfig&{query_timeout:number}={text:'SELECT pg_cancel_backend(pid) FROM pg_stat_activity WHERE pid=$1 AND application_name=$2',values:[pid,tag],query_timeout:1500};void pool.query(cancellation).catch(()=>{});}
 };
 if(signal?.aborted){release(true);signal.throwIfAborted();}
 signal?.addEventListener('abort',abort,{once:true});
 return {client,tag,release,get abandoned(){return released;}};
}
