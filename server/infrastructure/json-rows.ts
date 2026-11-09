import type {Response} from "express";
import {finished, pipeline} from "node:stream/promises";
import {createGzip, constants} from "node:zlib";
/** Encode the large array a row at a time, respecting socket backpressure. */
export async function writeJsonRows(res:Response,value:Record<string,unknown>,rowKey:string,options:{gzip?:boolean}={}):Promise<void>{
  res.setHeader("Content-Type","application/json; charset=utf-8");
  if(options.gzip)res.setHeader("Content-Encoding","gzip");
  const compressor=options.gzip?createGzip({level:constants.Z_BEST_SPEED}):null;
  const output=compressor||res;
  const sent=compressor?pipeline(compressor,res):finished(res,{cleanup:true});
  void sent.catch(()=>{});
  const write=async(chunk:string)=>{
    if(res.destroyed||output.destroyed)throw new Error("Response closed.");
    if(!output.write(chunk))await new Promise<void>((resolve,reject)=>{
      const cleanup=()=>{output.off("drain",drained);output.off("close",closed);output.off("error",closed);};
      const drained=()=>{cleanup();resolve();},closed=()=>{cleanup();reject(new Error("Response closed."));};
      output.once("drain",drained);output.once("close",closed);output.once("error",closed);
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
    output.end("}");await sent;
  }catch(error){output.destroy();res.destroy();await sent.catch(()=>{});throw error;}
}
