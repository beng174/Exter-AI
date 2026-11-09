import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {openDatabase,readBrand} from '../server/db.js';
import {attachPrimaryCategories} from '../server/public-categories/api.js';
import {sampleBrands} from '../shared/sample/workspace.js';
test('primary categories preserve brand settings, validate choices, reject foreign origins and keep samples read-only',async()=>{
 const db=openDatabase(':memory:',false),brand={...sampleBrands[0],id:'real-fixture',mode:'imported' as const};
 for(const row of [brand,sampleBrands[0]])db.prepare('INSERT INTO brands VALUES(?,?)').run(row.id,JSON.stringify(row));
 const app=express();app.use(express.json());attachPrimaryCategories(app,db);const server=createServer(app);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
 const save=(id:string,categories:unknown,extra:Record<string,string>={})=>fetch(`${origin}/api/brands/${id}/primary-categories`,{method:'POST',headers:{'content-type':'application/json',origin,...extra},body:JSON.stringify({categories})});
 try{
  assert.equal((await save(brand.id,['fashion'],{origin:'https://elsewhere.example'})).status,403);assert.equal((await save(sampleBrands[0].id,['fashion'])).status,404);assert.equal((await save(brand.id,['made up'])).status,400);
  assert.equal((await save(brand.id,['candles','candles','gifting'])).status,200);assert.deepEqual(readBrand(db,brand.id),{...brand,primaryCategories:['candles','gifting']});
  assert.equal((await save(brand.id,[])).status,200);assert.deepEqual(readBrand(db,brand.id)?.primaryCategories,[]);assert.deepEqual(readBrand(db,sampleBrands[0].id),sampleBrands[0]);
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));db.close();}
});
