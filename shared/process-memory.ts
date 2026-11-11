export interface ProcessMemoryHealth {heapUsedBytes:number;heapLimitBytes:number;heapPercent:number;rssBytes:number;measuredAt:string;warning:boolean}
export function memoryHealth(used:number,limit:number,rss:number,at:string):ProcessMemoryHealth{
 const heapPercent=limit>0?100*used/limit:0;
 return {heapUsedBytes:used,heapLimitBytes:limit,heapPercent,rssBytes:rss,measuredAt:at,warning:heapPercent>=80};
}
