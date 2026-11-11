import {getHeapStatistics} from "node:v8";
import {memoryHealth} from "../../shared/process-memory.js";
export function processMemoryHealth(){const m=process.memoryUsage();return memoryHealth(m.heapUsed,getHeapStatistics().heap_size_limit,m.rss,new Date().toISOString());}
export function startHeapLogging(log:(record:string)=>void=console.log){
 const timer=setInterval(()=>log(JSON.stringify({event:"web_memory",...processMemoryHealth()})),60000);timer.unref();
 return ()=>clearInterval(timer);
}
