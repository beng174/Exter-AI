import test from 'node:test';
import assert from 'node:assert/strict';
import {memoryHealth} from '../shared/process-memory.js';
import {startHeapLogging} from '../server/infrastructure/process-memory.js';
test('heap health uses the runtime limit and warns at 80 percent',()=>{
 assert.equal(memoryHealth(79,100,150,'fixture').warning,false);assert.equal(memoryHealth(80,100,150,'fixture').warning,true);assert.equal(memoryHealth(90,100,150,'fixture').heapPercent,90);
});
test('heap logging emits once each minute, contains only controlled metrics and stops cleanly',t=>{
 t.mock.timers.enable({apis:['setInterval']});const records:string[]=[],stop=startHeapLogging(line=>records.push(line));
 t.mock.timers.tick(59999);assert.equal(records.length,0);t.mock.timers.tick(1);assert.equal(records.length,1);const row=JSON.parse(records[0]);assert.equal(row.event,'web_memory');assert(row.heapUsedBytes>0);assert(row.heapLimitBytes>row.heapUsedBytes);assert(!records[0].includes('http'));t.mock.timers.tick(60000);assert.equal(records.length,2);stop();t.mock.timers.tick(60000);assert.equal(records.length,2);
});
