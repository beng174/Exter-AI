import {createReadStream} from "node:fs";
import {mkdtemp,mkdir,rm,statfs,stat} from "node:fs/promises";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {LocalImageMediaStore,probeImageFile,type ImageMediaOptions} from "../image/media.js";
import {LocalVideoMediaStore,MediaStorageError,type VideoMediaOptions} from "../video/media.js";
import {DiskKernelArtifactStore,type KernelArtifactRef} from "../kernel/artifacts.js";
import type {MediaDiskHealth} from "../../shared/ad-media.js";
import type {ActorMedia} from "./apify.js";
const run=promisify(execFile),MAX_VIDEO=128*1024*1024;
const missingReason=(error:unknown)=>error instanceof MediaStorageError&&["media_expired","media_not_found","media_forbidden"].includes(error.code)?"expired":error instanceof MediaStorageError&&["media_not_image","media_not_video","media_too_large","media_too_long","media_image_probe_failed"].includes(error.code)?"unsupported":error instanceof Error&&error.message==="disk"?"disk":"provider";
export const mediaRoot=()=>resolve(process.env.MEDIA_STORAGE_PATH||process.env.EXTER_MEDIA_ROOT||".data/media");
export function mediaDiskMeasurement(total:number,available:number,now=new Date()):MediaDiskHealth{
  if(!Number.isSafeInteger(total)||!Number.isSafeInteger(available)||total<=0||available<0||available>total)throw new Error("Invalid disk measurement.");
  return {status:"available",totalBytes:total,remainingBytes:available,usedBytes:total-available,videoDownloadsPaused:(total-available)/total>=0.8,measuredAt:now.toISOString()};
}
export const missingMediaDisk=():MediaDiskHealth=>({status:"unavailable",totalBytes:null,remainingBytes:null,usedBytes:null,videoDownloadsPaused:true,measuredAt:null});
export async function mediaDiskHealth(root=mediaRoot()):Promise<MediaDiskHealth>{try{await mkdir(root,{recursive:true,mode:0o700});const fs=await statfs(root);return mediaDiskMeasurement(fs.blocks*fs.bsize,fs.bavail*fs.bsize);}catch{return missingMediaDisk();}}
export function videoFitsDisk(disk:MediaDiskHealth,reserve=MAX_VIDEO){return disk.status==="available"&&disk.usedBytes!==null&&disk.totalBytes!==null&&!disk.videoDownloadsPaused&&disk.usedBytes+reserve<=disk.totalBytes*0.8;}
export interface MediaAsset{role:"image"|"poster"|"video";index:number;ref:KernelArtifactRef;durationSeconds?:number;sourceSha256?:string}
export interface RetainedMedia{assets:MediaAsset[];error:string|null}
export class AdMediaStorage{
  readonly store:DiskKernelArtifactStore;
  constructor(private options:{root?:string;images?:ImageMediaOptions;videos?:VideoMediaOptions;disk?:()=>Promise<MediaDiskHealth>}={}){this.store=new DiskKernelArtifactStore({root:resolve(options.root||mediaRoot(),"public-ad-files"),maxBytes:MAX_VIDEO});}
  disk(){return this.options.disk?.()||mediaDiskHealth(this.options.root||mediaRoot());}
  async retain(workspace:string,input:ActorMedia,priority:boolean):Promise<RetainedMedia>{
    const temporary=await mkdtemp(resolve(tmpdir(),"exter-ad-media-")),assets:MediaAsset[]=[];let error:string|null=null;
    const signal=AbortSignal.timeout(180000);
    const put=async(path:string,mimeType:string,role:MediaAsset["role"],index:number,durationSeconds?:number)=>{
      const size=(await stat(path)).size,disk=await this.disk();
      if(disk.status!=="available"||disk.remainingBytes===null||disk.remainingBytes<size+8*1024*1024||role==="video"&&!videoFitsDisk(disk,size))throw new Error("disk");
      const saved=await this.store.put(workspace,mimeType,createReadStream(path),{signal});assets.push({role,index,ref:saved.ref,...(durationSeconds?{durationSeconds}:{})});
    };
    try{
      const images=new LocalImageMediaStore({...this.options.images,root:resolve(temporary,"images"),timeoutMs:20000});
      for(const [role,links]of [["image",input.images],["poster",input.posters]]as const){for(const [index,url]of links.entries()){
        try{const saved=await images.store({brandId:workspace,adId:`${input.adId}:${role}:${index}`,kind:"image",sourceUrls:[url],signal});const image=saved.images[0];await put(image.absolutePath,image.mimeType,role,index);}
        catch(failure){error=missingReason(failure);}
      }}
      for(const [index,url]of input.videos.entries()){
        const full=priority&&videoFitsDisk(await this.disk()),needsPoster=!assets.some(a=>a.role==="poster"&&a.index===index);
        if(!full&&!needsPoster){if(priority)error="disk";continue;}
        try{
          const videos=new LocalVideoMediaStore({...this.options.videos,root:resolve(temporary,`video-${index}`),maxBytes:MAX_VIDEO,timeoutMs:30000});
          const original=await videos.store({brandId:workspace,adId:input.adId,sourceUrl:url,signal});
          if(needsPoster){
            const poster=resolve(temporary,`source-poster-${index}.jpg`);
            await run("ffmpeg",["-v","error","-nostdin","-protocol_whitelist","file,pipe","-i",original.absolutePath,"-map","0:v:0","-frames:v","1","-vf","scale=720:720:force_original_aspect_ratio=decrease","-c:v","mjpeg","-threads","1","-q:v","3","-map_metadata","-1","-y",poster],{timeout:15000,maxBuffer:256*1024,signal});
            await probeImageFile(poster);await put(poster,"image/jpeg","poster",index);
          }
          if(!full){if(priority)error="disk";continue;}
          const output=resolve(temporary,`720p-${index}.mp4`);
          // Local verified input only. The short edge is at most 720px, with no upscaling.
          await run("ffmpeg",["-v","error","-nostdin","-protocol_whitelist","file,pipe","-i",original.absolutePath,"-map","0:v:0","-map","0:a:0?","-sn","-dn","-map_metadata","-1","-vf","scale=w='if(gte(iw,ih),min(iw,1280),min(iw,720))':h='if(gte(iw,ih),min(ih,720),min(ih,1280))':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1","-c:v","libx264","-threads","2","-preset","veryfast","-crf","25","-pix_fmt","yuv420p","-c:a","aac","-b:a","96k","-movflags","+faststart","-fs",String(MAX_VIDEO),"-y",output],{timeout:90000,maxBuffer:256*1024,signal});
          // Reject truncation, stream injection or an incompatible derivative before retention.
          const {stdout}=await run("ffprobe",["-v","error","-protocol_whitelist","file,pipe","-show_streams","-show_format","-of","json",output],{timeout:15000,maxBuffer:1024*1024,signal});
          const info=JSON.parse(stdout),streams=info.streams||[],video=streams.find((s:any)=>s.codec_type==="video"),duration=Number(info.format?.duration);
          if(!video||!Number.isFinite(duration)||duration<=0||video.pix_fmt!=="yuv420p"||video.codec_name!=="h264"||video.width>1280||video.height>1280||Math.min(video.width,video.height)>720||Math.abs(duration-original.durationSeconds)>0.5||streams.some((s:any)=>!["video","audio"].includes(s.codec_type)||s.codec_type==="audio"&&s.codec_name!=="aac"))throw new Error("Invalid derivative.");
          await put(output,"video/mp4","video",index,duration);
          assets[assets.length-1].sourceSha256=original.sha256;
          if(!assets.some(a=>a.role==="poster"&&a.index===index)){
            const poster=resolve(temporary,`poster-${index}.jpg`);
            await run("ffmpeg",["-v","error","-nostdin","-protocol_whitelist","file,pipe","-i",output,"-map","0:v:0","-frames:v","1","-c:v","mjpeg","-threads","1","-q:v","3","-map_metadata","-1","-y",poster],{timeout:15000,maxBuffer:256*1024,signal});
            const dimensions=await probeImageFile(poster);
            if((await stat(poster)).size>8*1024*1024||dimensions.width*dimensions.height>40_000_000)throw new Error("Invalid poster.");
            await put(poster,"image/jpeg","poster",index);
          }
        }catch(failure){error=error||missingReason(failure);}
      }
      const posters=Math.max(input.posters.length,input.videos.length,input.format==="video"?1:0);
      const complete=assets.length>0&&assets.filter(a=>a.role==="image").length>=input.images.length&&assets.filter(a=>a.role==="poster").length>=posters&&(!priority||assets.filter(a=>a.role==="video").length>=input.videos.length&&!(input.format==="video"&&!input.videos.length));
      error=complete?null:error||"unsupported";
      return {assets,error};
    }finally{await rm(temporary,{recursive:true,force:true});}
  }
}
