import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createServer} from 'node:http';
import {apiFailureLogging,apiErrorReason} from '../server/infrastructure/api-errors.js';
test('API failures record route, status and safe cause without query strings or credentials',async()=>{
 const lines:string[]=[],app=express();app.use(apiFailureLogging(line=>lines.push(line)));
 app.get('/api/fixture/:id',(_req,res)=>res.status(503).json({error:apiErrorReason(Object.assign(new Error('driver detail'),{code:'57014'}))}));
 app.get('/api/private',(_req,res)=>res.status(400).json({error:'Request to https://private.example/?access_token=fixture-secret failed; token=fixture-secret'}));
 const server=createServer(app);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${(server.address() as any).port}`;
 try{const response=await fetch(base+'/api/fixture/record?token=fixture-secret');assert.equal(response.status,503);assert.match((await response.json()).error,/timed out/);await fetch(base+'/api/private');assert.equal(lines.length,2);assert.deepEqual(JSON.parse(lines[0]),{event:'api_request_failed',method:'GET',path:'/api/fixture/:id',status:503,reason:'Database statement timed out or was cancelled.'});assert(!lines.join('').includes('fixture-secret'));assert(!lines.join('').includes('https://'));}finally{await new Promise<void>(r=>server.close(()=>r()));}
});
