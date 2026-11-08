import type {Response} from "express";
import {finished} from "node:stream/promises";
/** Encode the large array a row at a time, respecting socket backpressure. */
export async function writeJsonRows(res:Response,value:Record<string,unknown>,rowKey:string):Promise<void>{
  res.setHeader("Content-Type","application/json; charset=utf-8");
  const sent=finished(res,{cleanup:true}).catch(()=>{});
  const write=async(chunk:string)=>{
    if(res.destroyed)throw new Error("Response closed.");
    if(!res.write(chunk))await new Promise<void>((resolve,reject)=>{
      const cleanup=()=>{res.off("drain",drained);res.off("close",closed);res.off("error",closed);};
      const drained=()=>{cleanup();resolve();},closed=()=>{cleanup();reject(new Error("Response closed."));};
      res.once("drain",drained);res.once("close",closed);res.once("error",closed);
    });
  };
  try{
    await write("{");let first=true;
    for(const [key,item] of Object.entries(value)){
      if(key===rowKey&&Array.isArray(item)){
        await write(`${first?"":","}${JSON.stringify(key)}:[`);first=false;
        for(let i=0;i<item.length;i++)await write(`${i?",":""}${JSON.stringify(item[i])??"null"}`);
        await write("]");
      }else{
        const json=JSON.stringify(item);if(json!==undefined){await write(`${first?"":","}${JSON.stringify(key)}:${json}`);first=false;}
      }
    }
    res.end("}");await sent;
  }catch(error){res.destroy();await sent;throw error;}
}
