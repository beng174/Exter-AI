import type {RequestHandler} from 'express';
import {workerDiagnostic} from './worker-diagnostics.js';
export function apiErrorReason(error:unknown){
 const diagnostic=workerDiagnostic(error);
 // Provider bodies are not public diagnostics. Database SQLSTATEs and local
 // controlled errors retain their precise, sanitised reason.
 return !diagnostic.code&&/provider.*(?:detail|response|body)|raw payload/i.test(diagnostic.message)?'The data provider step failed. Review worker details in Data sources.':diagnostic.message;
}
/** Log safe route patterns, never query strings, credentials or provider bodies. */
export function apiFailureLogging(log:(line:string)=>void=console.error):RequestHandler{
 return(req,res,next)=>{
  if(!req.path.startsWith('/api/')){next();return;}
  let reason:string|null=null,logged=false;
  const json=res.json;
  res.json=function(body){if(body&&typeof body.error==='string')reason=apiErrorReason(new Error(body.error));return json.call(this,body);};
  const report=(status:number)=>{if(logged||status<400)return;logged=true;log(JSON.stringify({event:'api_request_failed',method:req.method,path:typeof req.route?.path==='string'?req.route.path:'/api/[unmatched]',status,reason:reason??(res.locals.apiFailureReason?apiErrorReason(new Error(String(res.locals.apiFailureReason))):null)??(status===401?'Authentication required.':status===499?'Request disconnected.':'The API request failed.')}));};
  res.once('finish',()=>report(res.statusCode));res.once('close',()=>{if(!res.writableFinished)report(499);});next();
 };
}
