import type {WorkerDiagnostic} from "../../shared/worker-health.js";

export interface WorkerClaim {id:string; owner:string; workspaceId?:string; status?:string}
export interface WorkerObserver {onClaim?:(claim:WorkerClaim|null)=>void; onFailure?:(error:unknown)=>void}
const DATABASE_CODES: Record<string,string> = {
 "57014":"Database statement timed out or was cancelled.","55P03":"Database lock wait timed out.","40P01":"Database transaction deadlocked.",
 "53300":"Database connection limit reached.","53100":"Database disk is full.","53200":"Database memory limit reached.",
 "42P01":"Database table is missing.","42703":"Database column is missing.","42601":"Database query has a syntax error.",
 "42501":"Database permission denied.","23505":"Database unique constraint was violated.","23503":"Database reference is missing.",
 "23514":"Database check constraint was violated.","25P02":"Database transaction needs rollback.",
};
function safeText(text:string,env:Record<string,string|undefined>){
 if(text.length>4096)return "The error message exceeded its safe size limit.";
 for(const [key,value] of Object.entries(env))if(/TOKEN|SECRET|PASSWORD|KEY|DATABASE_URL|BROKER_ORIGIN/i.test(key)&&value&&value.length>=3){
  for(const form of new Set([value,encodeURIComponent(value)]))text=text.split(form).join("[redacted]");
 }
 return text.replace(/(?:https?|postgres(?:ql)?):\/\/[^\s<>"']+/gi,"[URL removed]")
  .replace(/(?:bearer|basic)\s+[A-Za-z0-9+/=._-]+/gi,"[credential removed]")
  .replace(/\b(?:access_token|token|password|secret|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi,"[credential removed]")
  .replace(/\b[A-Za-z0-9_+/=-]{32,}\b/g,"[value removed]")
  .replace(/\b(?:response body|provider body|raw payload)\s*[:=].*/gi,"[body removed]")
  .replace(/[\r\n\t\x00-\x1f]+/g," ").slice(0,300);
}
/** Never inspect driver detail/query/parameters, provider bodies or error causes. */
export function workerDiagnostic(error:unknown,env:Record<string,string|undefined>=process.env):WorkerDiagnostic{
 if(error instanceof BrokerStepError)return error.diagnostic;
 const e=error as {name?:unknown;message?:unknown;code?:unknown;stack?:unknown;status?:unknown;httpStatus?:unknown;constructor?:{name?:string}}|null;
 const code=typeof e?.code==="string"&&/^(?:[0-9A-Z]{5}|E[A-Z_]{2,30})$/.test(e.code)?e.code:null;
 const location=typeof e?.stack==="string"?e.stack.slice(0,8192).match(/(?:server|shared)\/[A-Za-z0-9_./-]{1,180}\.(?:ts|js):\d+:\d+/)?.[0]??null:null;
 const candidate=e?.name&&e.name!=="Error"?e.name:e?.constructor?.name;
 const name=typeof candidate==="string"&&["Error","TypeError","RangeError","SyntaxError","ReferenceError","AbortError","TimeoutError","FetchError","DatabaseError","AdMediaError","CreatorProviderError","CategoryError","KernelArtifactError","MetaCollectionError","OwnedSyncError"].includes(candidate)?candidate:"Error";
 const message=code&&DATABASE_CODES[code]||safeText(typeof e?.message==="string"?e.message:"The step raised an unknown error.",env);
 const status=e?.status??e?.httpStatus;
 return {name,message,code,location:location?safeText(location,env):null,httpStatus:typeof status==="number"&&Number.isInteger(status)&&status>=100&&status<=599?status:null};
}
export function databaseConnectionError(error:unknown){
 const e=error as {code?:unknown;message?:unknown}|null;
 return typeof e?.code==="string"&&(/^(08|57P0[123])/.test(e.code)||["ECONNRESET","ECONNREFUSED","EPIPE","ENOTFOUND","ETIMEDOUT"].includes(e.code))
  ||typeof e?.message==="string"&&/^(?:Connection terminated|Connection ended unexpectedly|The pool is draining|Cannot use a pool after calling end)/.test(e.message);
}
export class BrokerStepError extends Error{
 constructor(public diagnostic:WorkerDiagnostic){super(diagnostic.message);this.name="BrokerStepError";}
}
/** Read only our bounded acknowledgement, including safe diagnostics from a failed web step. */
export async function brokerAcknowledgement(response:Response):Promise<boolean>{
 let body:any;
 if(response.body){const reader=response.body.getReader(),chunks:Uint8Array[]=[];let bytes=0;
  try{for(;;){const item=await reader.read();if(item.done)break;bytes+=item.value.byteLength;if(bytes>2048)throw new Error("The web step acknowledgement exceeded its size limit.");chunks.push(item.value);}try{body=JSON.parse(Buffer.concat(chunks).toString("utf8"));}catch{throw new Error("The web step acknowledgement was invalid.");}}
  finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 }
 if(!response.ok||body?.diagnostic){
  const raw=body?.diagnostic;
  const diagnostic=raw&&typeof raw.message==="string"?workerDiagnostic(Object.assign(new Error(raw.message),{name:raw.name,code:raw.code,status:raw.httpStatus??(!response.ok?response.status:null),stack:typeof raw.location==="string"?raw.location:undefined})):workerDiagnostic(Object.assign(new Error("The web step returned an unsuccessful response."),{status:response.status}));
  throw new BrokerStepError(diagnostic);
 }
 if(!body||typeof body.worked!=="boolean")throw new Error("The web step acknowledgement was invalid.");
 return body.worked;
}
