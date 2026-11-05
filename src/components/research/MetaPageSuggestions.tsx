import {DataLabel} from "../ui";
import {useEffect,useState} from "react";
import type {ResearchData} from "./useResearchData";
import type {PageCandidate,PageCandidateResult} from "../../../shared/meta-page-candidates";
import {brandColour,brandInitials,brandInk} from "../../../shared/brand-identity";
import {adCount,ukDate} from "../../../shared/creative-presentation";

interface Suggestion {result?:PageCandidateResult;state:"waiting"|"ready"|"error";error?:string}
const wait=(ms:number,signal:AbortSignal)=>new Promise<void>(resolve=>{if(signal.aborted){resolve();return;}const stop=()=>{clearTimeout(timer);resolve();};const timer=setTimeout(()=>{signal.removeEventListener("abort",stop);resolve();},ms);signal.addEventListener("abort",stop,{once:true});});
export function useMetaPageSuggestions(data:ResearchData){
  const [suggestions,setSuggestions]=useState<Record<string,Suggestion>>({}),[request,setRequest]=useState<{key?:string;more?:boolean;version:number}>({version:0});
  const configured=["configured","connected"].includes(data.infrastructure?.meta?.status||"");
  const missing=[{key:data.library.brand.id,name:data.library.brand.name},...data.library.competitors.map(b=>({key:b.brandId||b.key,name:b.name}))].filter(t=>!data.watchlists?.some(w=>w.purpose==="brand"&&w.brand_key===t.key&&w.page_ids.length));
  const signature=JSON.stringify(missing),workspaceId=data.library.brand.id,sample=Boolean(data.library.presentation);
  useEffect(()=>{
    if(sample||!configured||data.watchlists===null)return;
    const controller=new AbortController(),signal=controller.signal;
    const queue=missing.map(t=>({key:t.key,more:request.key===t.key&&request.more,retries:0}));
    setSuggestions(old=>({...old,...Object.fromEntries(missing.map(t=>[t.key,{...old[t.key],state:"waiting" as const}]))}));
    async function run(){
      while(queue.length&&!signal.aborted){
        const item=queue.shift()!;
        try{
          const response=await fetch("/api/public/meta/page-candidates",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({workspaceId,brandKey:item.key,more:item.more}),signal});
          const value=await response.json();if(signal.aborted)return;
          if(value.id)setSuggestions(old=>({...old,[item.key]:{result:value,state:response.status===200?"ready":"waiting"}}));
          if(response.status===202||response.status===429&&(value.waiting||item.retries++<4)){
            item.more=false;queue.unshift(item);await wait(Math.max(1000,(value.retryAfterSeconds||Number(response.headers.get("retry-after"))||20)*1000),signal);continue;
          }
          if(!response.ok)throw new Error(value.error||"Page search is unavailable.");
          if(!value.complete&&!value.limited){item.more=false;item.retries=0;queue.push(item);}
        }catch(error){if(signal.aborted)return;setSuggestions(old=>({...old,[item.key]:{...old[item.key],state:"error",error:error instanceof Error?error.message:"Page search is unavailable."}}));}
      }
    }
    void run();return()=>controller.abort();
  },[signature,workspaceId,configured,sample,data.watchlists===null,request.version]);
  return {configured,suggestions,again:(key:string,more=false)=>setRequest(old=>({key,more,version:old.version+1}))};
}
function PagePicture({lookup,page,workspaceId}:{lookup:PageCandidateResult;page:PageCandidate;workspaceId:string}){
  const [src,setSrc]=useState<string|null>(null),[missing,setMissing]=useState(false);
  useEffect(()=>{
    setSrc(null);setMissing(false);
    const controller=new AbortController();let objectUrl:string|undefined;
    async function load(){
      while(!controller.signal.aborted){
        try{
          const response=await fetch(`/api/public/meta/page-candidates/${encodeURIComponent(lookup.id)}/picture`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({workspaceId,pageId:page.pageId}),signal:controller.signal});
          if(response.status===429){await wait(Math.max(1000,Number(response.headers.get("retry-after")||20)*1000),controller.signal);continue;}
          if(!response.ok||response.status===204){setMissing(true);return;}
          const blob=await response.blob();if(blob.type!=="image/png"){setMissing(true);return;}
          objectUrl=URL.createObjectURL(blob);if(!controller.signal.aborted)setSrc(objectUrl);return;
        }catch{if(!controller.signal.aborted)setMissing(true);return;}
      }
    }
    void load();return()=>{controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl);};
  },[lookup.id,page.pageId,workspaceId]);
  return <span className="meta-page-picture" style={{background:brandColour(page.pageName),color:brandInk(brandColour(page.pageName))}} aria-hidden="true" title={missing?"Profile picture unavailable.":!src?"Profile picture waiting for Meta.":undefined}>{brandInitials(page.pageName)}{src&&<img src={src} alt=""/>}</span>;
}
export function MetaPageSuggestions({workspaceId,name,suggestion,onConfirm,onMore,disabled}:{workspaceId:string;name:string;suggestion:Suggestion|undefined;onConfirm:(page:PageCandidate)=>void;onMore:()=>void;disabled:boolean}){
  const result=suggestion?.result;
  return <div className="meta-page-suggestions" aria-label={`${name} suggested Pages`}>
    {suggestion?.state==="error"&&<p role="status">{suggestion.error} <button type="button" className="button secondary" onClick={onMore}>Retry search</button></p>}
    {!result?.candidates.length?suggestion?.state==="error"?null:<p className="reference-muted" role="status">{(result?.complete||result?.limited)?"No matching Pages found. Enter the Page ID manually.":"Finding Pages…"}</p>:<>
      <p className="meta-page-coverage">{adCount(result.adsSearched)} searched{result.checkedAt?` · ${ukDate(result.checkedAt,true)}`:""}{suggestion?.state==="waiting"?" · Searching…":""} <DataLabel basis="Observed"/></p>
      {!result.websiteDomain&&<p className="reference-muted">No saved website is available to check these Pages. Matches use the name and ads found.</p>}
      <ol>{result.candidates.map(page=><li key={page.pageId}>
        <header><PagePicture lookup={result} page={page} workspaceId={workspaceId}/><strong>{page.pageName}</strong><small>{adCount(page.adCount)} found</small></header>
        <p className="meta-page-matches">{page.domainMatchedAds!==null?`${page.domainMatchedAds} link${page.domainMatchedAds===1?"":"s"} to ${result.websiteDomain}`:"Website match unavailable"} · {page.nameMatch===1?"Exact name":page.nameMatch>0?"Similar name":"Different name"}</p>
        <blockquote><small>Example excerpt</small><p>{page.example.copy}</p><a href={page.example.url} target="_blank" rel="noopener noreferrer">Open example ad in Ad Library</a></blockquote>
        <div className="ui-actions"><button type="button" className="button secondary" disabled={disabled} aria-label={`Confirm ${page.pageName} for ${name}`} onClick={()=>onConfirm(page)}>Confirm</button><small>Page ID {page.pageId}</small></div>
      </li>)}</ol>
    </>}
    {result?.limited&&<p className="reference-muted">{result.canSearchMore?<>More ads are available. <button type="button" className="button secondary" onClick={onMore}>Search more ads</button></>:"Search limit reached. Manual entry remains available."}</p>}
  </div>;
}
