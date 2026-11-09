import {createHash} from 'node:crypto';
const [base,expected,n]=process.argv.slice(2);
const url=new URL(base);if(url.hostname!=='127.0.0.1'||url.protocol!=='http:')throw new Error('Only local fixture traffic is allowed.');
const responses=await Promise.all(Array.from({length:Number(n)},async()=>{
 const response=await fetch(`${base}/api/brands/memory-fixture/creatives`,{signal:AbortSignal.timeout(30000)});const text=await response.text();const result=JSON.parse(text);if(response.status!==200||result.creatives.length!==Number(expected))throw new Error('Incomplete fixture response');if(result.creatives[0].publicReach.locations.value[0].reach!==1234||!result.creatives.at(-1).copy.includes('quiet evening'))throw new Error('Changed fixture evidence');return {status:response.status,count:result.creatives.length,bytes:text.length,hash:createHash('sha256').update(text).digest('hex')};
}));
console.log(JSON.stringify({responses}));
