import {useEffect,useRef,useState,type FormEvent} from "react";
import type {ResearchData} from "./useResearchData";
import {MetaPageSuggestions,useMetaPageSuggestions} from "./MetaPageSuggestions";
import type {PageCandidate} from "../../../shared/meta-page-candidates";
import {BrandName} from "../ui/BrandIdentity";
import {MetaRunDetails,MetaRetryButton} from "./MetaRunStatus";
import "./MetaWatchlistEditor.css";
export function MetaWatchlistDialog({data,onSaved,onClose}:{data:ResearchData;onSaved:()=>void;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);useEffect(()=>{dialog.current?.showModal();},[]);
 return <dialog ref={dialog} className="meta-watchlist-dialog" aria-label="Edit watchlist" onClose={onClose}><header><h2>Edit watchlist</h2><button className="button secondary" onClick={()=>dialog.current?.close()}>Close</button></header><MetaWatchlistEditor data={data} onSaved={onSaved}/></dialog>;
}
export function MetaWatchlistEditor({data,onSaved}:{data:ResearchData;onSaved:()=>void}){
 const lookup=useMetaPageSuggestions(data),baseTargets=[{key:data.library.brand.id,name:data.library.brand.name},...data.library.competitors.map(b=>({key:b.brandId||b.key,name:b.name}))];
 const [extra,setExtra]=useState<{key:string;name:string;slot:string}[]>([]),[pages,setPages]=useState<Record<string,string>>({}),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 type Target={key:string;name:string;slot:string;watchlist:ResearchData["watchlists"] extends (infer W)[]|null?W|undefined:never};
 const targets=baseTargets.flatMap<Target>(target=>{const lists=data.watchlists?.filter(w=>w.purpose==='brand'&&w.brand_key===target.key)||[];return lists.length?lists.map(w=>({...target,slot:w.id,watchlist:w})):[{...target,slot:target.key,watchlist:undefined}];}).concat(extra.map(target=>({...target,watchlist:undefined})));
 const discovery=data.watchlists?.find(w=>w.purpose==='discovery'),[terms,setTerms]=useState(discovery?.search_terms.join('\n')||data.brand?.discoveryKeywords?.join('\n')||'');
 const value=(target:typeof targets[number])=>pages[target.slot]??target.watchlist?.page_ids[0]??'';
 if(data.library.presentation)return <p className="reference-muted">Sample workspace is read-only.</p>;
 if(data.watchlists===null)return <p className="reference-muted">Watchlist settings could not be read. <button className="button secondary" onClick={onSaved}>Retry</button></p>;
 async function put(id:string,body:unknown){const response=await fetch(`/api/public/meta/watchlists/${encodeURIComponent(id)}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(!response.ok)throw new Error();}
 async function confirm(key:string,page:PageCandidate){setBusy(true);setMessage('');try{const old=data.watchlists?.find(w=>w.brand_key===key&&!w.page_ids.length);await put(old?.id||crypto.randomUUID(),{workspaceId:data.library.brand.id,brandKey:key,purpose:'brand',pageIds:[page.pageId],countries:['GB']});window.dispatchEvent(new Event('exter:brand-identities'));setMessage(`${page.pageName} confirmed. Collection follows your live switch.`);onSaved();}catch{setMessage('The Page could not be confirmed. Check its saved assignment.');}finally{setBusy(false);}}
 async function save(event:FormEvent){event.preventDefault();setBusy(true);setMessage('');try{
  for(const target of targets){const old=target.watchlist,page=value(target).trim();if(page===(old?.page_ids[0]||''))continue;await put(old?.id||crypto.randomUUID(),{workspaceId:data.library.brand.id,brandKey:target.key,purpose:'brand',pageIds:page?[page]:[],countries:old?.countries||['GB']});}
  const searchTerms=terms.split('\n').map(t=>t.trim()).filter(Boolean);if(JSON.stringify(searchTerms)!==JSON.stringify(discovery?.search_terms||[]))await put(discovery?.id||crypto.randomUUID(),{workspaceId:data.library.brand.id,purpose:'discovery',searchTerms,countries:discovery?.countries||['GB']});
  setExtra([]);setPages({});window.dispatchEvent(new Event('exter:brand-identities'));setMessage('Page IDs saved. Manual choices override automatic setup.');onSaved();
 }catch{setMessage('Some settings could not be saved. Check Page IDs and retry.');}finally{setBusy(false);}}
 return <form className="meta-watchlist-editor" onSubmit={save}>
 {data.watchlistPollFailed&&<p role="status">Progress could not refresh. Earlier details are still shown.</p>}
 <p className="reference-muted">Automatic setup confirms Pages with strong website matches. You can override any Page here.</p>
 {targets.map(target=><div className="meta-watchlist-target" key={target.slot}><label><BrandName name={target.name}/><span>Meta Page ID</span><input aria-label={`${target.name} Meta Page ID${targets.filter(t=>t.key===target.key).length>1?` (${target.watchlist?.page_ids[0]||'new'})`:''}`} inputMode="numeric" pattern="[0-9]{1,30}" maxLength={30} value={value(target)} onChange={e=>setPages(p=>({...p,[target.slot]:e.target.value}))} placeholder="Not configured"/></label><MetaRunDetails run={target.watchlist?.latestRun}/><MetaRetryButton data={data} watchlist={target.watchlist} onSaved={onSaved} disabledReason={value(target).trim()!==(target.watchlist?.page_ids[0]||'')?'Save Page IDs before collecting a different Page.':null}/>{!data.watchlists?.some(w=>w.brand_key===target.key&&w.page_ids.length)&&lookup.configured&&<MetaPageSuggestions workspaceId={data.library.brand.id} name={target.name} suggestion={lookup.suggestions[target.key]} disabled={busy} onConfirm={page=>void confirm(target.key,page)} onMore={()=>lookup.again(target.key,lookup.suggestions[target.key]?.result?.limited)}/>}</div>)}
 <div className="ui-actions">{baseTargets.map(target=><button type="button" className="button secondary" key={target.key} disabled={busy} onClick={()=>setExtra(rows=>[...rows,{...target,slot:crypto.randomUUID()}])}>Add another Page for {target.name}</button>)}</div>
 <details><summary>Find a Page ID manually</summary><p className="reference-muted">Open the advertiser in the Meta Ad Library. Copy the number after view_all_page_id.</p></details>
 <details><summary>Category discovery keywords</summary><p className="reference-muted">Keywords find category ads. They never assign ads to a brand.</p><label>Keywords, one per line<textarea value={terms} onChange={e=>setTerms(e.target.value)}/></label></details>
 <div className="ui-actions"><button className="button primary" disabled={busy}>{busy?'Saving…':'Save Page IDs'}</button>{message&&<span role="status">{message}</span>}</div>
 </form>;
}
