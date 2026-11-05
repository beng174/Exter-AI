import {createHash,randomUUID} from "node:crypto";
import {mkdir,readFile,writeFile,rename,mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {load} from "cheerio";
import type {Ad,Brand} from "../shared/types.js";
import type {Express} from "express";
import type {DatabaseSync} from "node:sqlite";
import {fetchWebsiteResource,fetchMetaPagePicture,type DemoWebsiteOptions} from "./demo/website.js";
import {canonicalWorkspaceBrands,workspaceBrandIds} from "./demo/reconcile.js";
import {configuredCreativeCompetitors} from "./demo/creative-competitors.js";
import type {DemoCollectionService} from "./demo/collection.js";
import {readBrandResearch} from "./brand-research.js";
import {brandColour,brandInitials,type BrandIdentity} from "../shared/brand-identity.js";

export const LOGO_MAX_BYTES=200_000;
const run=promisify(execFile),hash=(value:string|Buffer)=>createHash("sha256").update(value).digest("hex");
export function logoMime(bytes:Buffer) {
  if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return "image/png";
  if(bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return "image/jpeg";
  if(bytes.length>=16&&bytes.toString("ascii",0,4)==="RIFF"&&bytes.toString("ascii",8,12)==="WEBP")return "image/webp";
  if(bytes.length>=6&&bytes.readUInt32LE(0)===65536&&bytes.readUInt16LE(4)>0)return "image/x-icon";
  return null;
}
export function validateLogo(bytes:Buffer,declared:string) {
  if(!bytes.length||bytes.length>=LOGO_MAX_BYTES)throw new Error("Choose a logo smaller than 200 KB.");
  const mime=logoMime(bytes),type=declared.toLowerCase().split(";")[0];
  if(!mime||!(type===mime||mime==="image/x-icon"&&type==="image/vnd.microsoft.icon"))throw new Error("Choose a PNG, JPEG, WebP or ICO image. SVG is not supported.");
}
export function iconCandidates(html:string,pageUrl:string) {
  const $=load(html),rows:{url:string;apple:boolean;size:number}[]=[];
  $("link[href]").each((_,el)=>{const rel=($(el).attr("rel")||"").toLowerCase().split(/\s+/);if(!rel.includes("icon")&&!rel.includes("apple-touch-icon")&&!rel.includes("apple-touch-icon-precomposed"))return;
    try{const url=new URL($(el).attr("href")!,pageUrl);if(/\.svg(?:$|\?)/i.test(url.href)||$(el).attr("type")==="image/svg+xml")return;
    rows.push({url:url.href,apple:rel.some(r=>r.startsWith("apple-touch-icon")),size:Math.max(0,...(($(el).attr("sizes")||"").match(/\d+(?=x)/g)||[]).map(Number))});}catch{}
  });
  return [...new Set([...rows.sort((a,b)=>Number(b.apple)-Number(a.apple)||b.size-a.size).map(row=>row.url),new URL("/favicon.ico",pageUrl).href])].slice(0,8);
}
interface Manifest {uploaded?:string;automatic?:string;checkedAt?:string;domain?:string;metaPageId?:string}
export interface LogoOptions extends DemoWebsiteOptions {root?:string;convert?:(bytes:Buffer)=>Promise<Buffer>}
async function squareLogo(bytes:Buffer) {
  const dir=await mkdtemp(resolve(tmpdir(),"exter-logo-"));
  try {const input=resolve(dir,"input"),output=resolve(dir,"square.png");await writeFile(input,bytes,{mode:0o600});
    const {stdout}=await run("ffprobe",["-v","error","-protocol_whitelist","file,pipe","-show_entries","stream=width,height","-of","json",input],{timeout:10000,maxBuffer:32000});
    const streams=JSON.parse(stdout).streams;if(!streams?.length||streams.some((s:{width:number;height:number})=>!s.width||!s.height||s.width*s.height>16_000_000))throw new Error("Logo dimensions are unsupported.");
    await run("ffmpeg",["-v","error","-protocol_whitelist","file,pipe","-i",input,"-frames:v","1","-vf","scale=64:64:force_original_aspect_ratio=decrease,pad=64:64:(ow-iw)/2:(oh-ih)/2:color=white,format=rgba","-threads","1",output],{timeout:10000,maxBuffer:32000});
    const png=await readFile(output);validateLogo(png,"image/png");return png;
  }finally{await rm(dir,{recursive:true,force:true});}
}
export class BrandLogoStore {
  readonly root:string;private pending=new Map<string,Promise<string|null>>();private updates=new Map<string,Promise<Manifest>>();
  constructor(private options:LogoOptions={}){this.root=resolve(options.root||process.env.MEDIA_STORAGE_PATH||process.env.EXTER_MEDIA_ROOT||".data/media","brand-logos");}
  private path(id:string){return resolve(this.root,hash(id)+".json");}
  private async manifest(id:string):Promise<Manifest>{try{return JSON.parse(await readFile(this.path(id),"utf8"));}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return {};throw error;}}
  private async save(id:string,value:Manifest){await mkdir(this.root,{recursive:true,mode:0o700});const temp=this.path(id)+"."+randomUUID();try{await writeFile(temp,JSON.stringify(value),{mode:0o600,flag:"wx"});await rename(temp,this.path(id));}finally{await rm(temp,{force:true});}}
  private async update(id:string,change:(old:Manifest)=>Manifest){
    const before=this.updates.get(id)||Promise.resolve({});
    const job=before.catch(()=>({})).then(async()=>{const next=change(await this.manifest(id));await this.save(id,next);return next;});
    this.updates.set(id,job);try{return await job;}finally{if(this.updates.get(id)===job)this.updates.delete(id);}
  }
  private async retain(bytes:Buffer){const png=await (this.options.convert||squareLogo)(bytes);validateLogo(png,"image/png");await mkdir(this.root,{recursive:true,mode:0o700});const id=hash(png);await writeFile(resolve(this.root,id+".png"),png,{mode:0o600,flag:"wx"}).catch(error=>{if(error.code!=="EEXIST")throw error;});return id;}
  async upload(brand:BrandIdentity,bytes:Buffer,type:string){if(brand.mode==="demo")throw new Error("Sample logos are read-only.");validateLogo(bytes,type);const id=await this.retain(bytes);await this.update(brand.id,old=>({...old,uploaded:id}));return id;}
  async reset(brand:BrandIdentity){if(brand.mode==="demo")throw new Error("Sample logos are read-only.");await this.update(brand.id,old=>{const next={...old};delete next.uploaded;return next;});}
  async image(brand:BrandIdentity):Promise<Buffer|null>{if(brand.mode==="demo")return null;let job=this.pending.get(brand.id);if(!job){job=this.choose(brand);this.pending.set(brand.id,job);}let id:string|null;try{id=await job;}finally{if(this.pending.get(brand.id)===job)this.pending.delete(brand.id);}if(!id||!/^[a-f0-9]{64}$/.test(id))return null;const bytes=await readFile(resolve(this.root,id+".png")).catch(()=>null);return bytes&&hash(bytes)===id&&logoMime(bytes)==="image/png"?bytes:null;}
  private async choose(brand:BrandIdentity){const old=await this.manifest(brand.id);if(old.uploaded)return old.uploaded;
    const now=this.options.now?.()||new Date(),checked=new Date(old.checkedAt||0),expires=new Date(checked);expires.setUTCMonth(expires.getUTCMonth()+1);
    const metaPageId=typeof brand.metaPageId==="string"&&/^\d{1,30}$/.test(brand.metaPageId)?brand.metaPageId:undefined;
    const sameIdentity=old.domain===brand.domain&&old.metaPageId===metaPageId;
    if(sameIdentity&&now<expires)return old.automatic||null;
    let automatic:string|undefined;
    if(metaPageId)try{const asset=await fetchMetaPagePicture(metaPageId,LOGO_MAX_BYTES,this.options);validateLogo(asset.bytes,asset.type);automatic=await this.retain(asset.bytes);}catch{}
    if(!automatic&&brand.domain)try{const page=await fetchWebsiteResource(brand.domain,`https://${brand.domain}/`,1024*1024,this.options);if(!["text/html","application/xhtml+xml"].includes(page.type))throw new Error();
      for(const candidate of iconCandidates(page.bytes.toString("utf8"),page.url))try{const asset=await fetchWebsiteResource(brand.domain,candidate,LOGO_MAX_BYTES,this.options);validateLogo(asset.bytes,asset.type);automatic=await this.retain(asset.bytes);break;}catch{}
    }catch{}
    // Re-read after retrieval so a concurrent uploaded logo always wins.
    const latest=await this.update(brand.id,value=>({...value,automatic:automatic||(sameIdentity?old.automatic:undefined),domain:brand.domain,metaPageId,checkedAt:now.toISOString()}));return latest.uploaded||automatic||(sameIdentity?old.automatic:undefined)||null;
  }
}
/** Prefer an explicit identity, then one unambiguous saved advertiser Page, never a creator Page. */
export function savedMetaPageId(db:DatabaseSync,brand:Brand):string|undefined {
  if(brand.mode==="demo")return undefined;
  const valid=(value:unknown):value is string=>typeof value==="string"&&/^\d{1,30}$/.test(value);
  if(valid(brand.metaPageId))return brand.metaPageId;
  const ids=workspaceBrandIds(db,brand.id),pages=new Set<string>();
  if(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ads'").get()){
    const rows=db.prepare(`SELECT data FROM ads WHERE brand_id IN (${ids.map(()=>"?").join(",")}) AND source<>'sample' AND platform IN ('Meta','Facebook','Instagram')`).all(...ids) as {data:string}[];
    for(const row of rows)try{const ad=JSON.parse(row.data) as Ad;if(ad.source!=="sample"&&valid(ad.advertiserPageId))pages.add(ad.advertiserPageId);}catch{}
  }
  for(const id of ids){const page=readBrandResearch(db,id)?.adLibraryEvidence?.advertiserPageId;if(valid(page))pages.add(page);}
  return pages.size===1?[...pages][0]:undefined;
}
export function brandIdentities(db:DatabaseSync,workspaceId?:string,collection?:Pick<DemoCollectionService,"snapshot">):BrandIdentity[]{
  const brands=canonicalWorkspaceBrands(db).filter(b=>b.mode!=="demo"),workspace=brands.find(b=>b.id===workspaceId),result:BrandIdentity[]=brands.map(brand=>({...brand,metaPageId:savedMetaPageId(db,brand)}));
  const owners=workspace?[workspace]:brands;
  for(const owner of owners){
    const domains=new Map<string,string>();
    for(const c of readBrandResearch(db,owner.id)?.competitorCandidates||[])if(c.domain)domains.set(c.name.toLowerCase(),c.domain);
    if(collection)try{for(const c of collection.snapshot(owner.id).competitors)if(c.domain)domains.set(c.name.toLowerCase(),c.domain);}catch{}
    for(const c of configuredCreativeCompetitors(db,owner,collection))if(!result.some(b=>b.id===c.brandId||b.name.toLowerCase()===c.name.toLowerCase()))result.push({id:`competitor-${hash(c.name.trim().toLowerCase()).slice(0,24)}`,name:c.name,domain:domains.get(c.name.toLowerCase())||"",color:brandColour(c.name),initials:brandInitials(c.name),mode:"imported"});
  }
  return result;
}
export function attachBrandLogos(app:Express,db:DatabaseSync){
  const store=new BrandLogoStore();app.locals.brandLogos=store;
  app.get("/api/brand-identities",(req,res)=>res.json(brandIdentities(db,String(req.query.brandId||""),app.locals.demoCollection)));
  app.get("/api/brand-logos/:id",async(req,res)=>{res.setHeader("Cache-Control","private, no-store");const brand=brandIdentities(db,undefined,app.locals.demoCollection).find(b=>b.id===req.params.id);if(!brand){res.sendStatus(404);return;}try{const image=await (app.locals.brandLogos as BrandLogoStore).image(brand);if(!image){res.status(204).end();return;}res.type("png").send(image);}catch{res.status(204).end();}});
  app.post("/api/brand-logos/:id",async(req,res)=>{const brand=brandIdentities(db,undefined,app.locals.demoCollection).find(b=>b.id===req.params.id);if(!brand){res.sendStatus(404);return;}try{if(req.body?.reset===true)await (app.locals.brandLogos as BrandLogoStore).reset(brand);else{if(typeof req.body?.data!=="string"||req.body.data.length>Math.ceil(LOGO_MAX_BYTES*4/3)||!/^[A-Za-z0-9+/]*={0,2}$/.test(req.body.data))throw new Error("Choose a logo smaller than 200 KB.");await (app.locals.brandLogos as BrandLogoStore).upload(brand,Buffer.from(req.body.data,"base64"),String(req.body.type||""));}res.json({ok:true});}catch(error){res.status(400).json({error:error instanceof Error&&/^(Choose|Sample)/.test(error.message)?error.message:"The logo could not be saved. Earlier media is preserved."});}});
}
