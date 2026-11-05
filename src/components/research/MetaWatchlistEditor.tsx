import {useEffect,useRef,useState,type FormEvent} from "react";
import type {ResearchData} from "./useResearchData";
import {MetaPageSuggestions,useMetaPageSuggestions} from "./MetaPageSuggestions";
import type {PageCandidate} from "../../../shared/meta-page-candidates";
import {BrandName} from "../ui/BrandIdentity";
import {MetaRunDetails,MetaRetryButton} from "./MetaRunStatus";
import "./MetaWatchlistEditor.css";
export function MetaWatchlistDialog({data,onSaved,onClose}:{data:ResearchData;onSaved:()=>void;onClose:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{dialog.current?.showModal();},[]);
  return <dialog ref={dialog} className="meta-watchlist-dialog" aria-label="Edit watchlist" onClose={onClose}><header><h2>Edit watchlist</h2><button className="button secondary" onClick={()=>dialog.current?.close()}>Close</button></header><MetaWatchlistEditor data={data} onSaved={onSaved}/></dialog>;
}

/** Stores public Page identities only. Collection and secret configuration remain separate. */
export function MetaWatchlistEditor({data,onSaved}:{data:ResearchData;onSaved:()=>void}){
  const lookup=useMetaPageSuggestions(data);
  const targets=[{key:data.library.brand.id,name:data.library.brand.name},...data.library.competitors.map(b=>({key:b.brandId||b.key,name:b.name}))];
  const saved=(key:string)=>data.watchlists?.find(w=>w.purpose==="brand"&&w.brand_key===key);
  const [pages,setPages]=useState<Record<string,string>>(()=>Object.fromEntries(targets.map(t=>[t.key,saved(t.key)?.page_ids[0]||""])));
  const discovery=data.watchlists?.find(w=>w.purpose==="discovery");
  const [terms,setTerms]=useState(discovery?.search_terms.join("\n")||""),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
  if(data.library.presentation)return <p className="reference-muted">Sample workspace is read-only.</p>;
  if(data.watchlists===null)return <p className="reference-muted">Watchlist settings could not be read. <button className="button secondary" onClick={onSaved}>Retry</button></p>;
  async function put(id:string,body:unknown){const response=await fetch(`/api/public/meta/watchlists/${encodeURIComponent(id)}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});if(!response.ok)throw new Error();}
  async function confirm(key:string,page:PageCandidate){setBusy(true);setMessage("");try{
    const old=saved(key);
    await put(old?.id||crypto.randomUUID(),{workspaceId:data.library.brand.id,brandKey:key,purpose:"brand",pageIds:[page.pageId],countries:old?.countries||["GB"]});
    setPages(values=>({...values,[key]:page.pageId}));window.dispatchEvent(new Event("exter:brand-identities"));setMessage(`${page.pageName} confirmed. Collection follows the live switch and schedule.`);onSaved();
  }catch{setMessage("The Page could not be confirmed. Check whether it is already assigned to another brand, then retry or enter the ID manually.");}finally{setBusy(false);}}
  async function save(event:FormEvent){event.preventDefault();setBusy(true);setMessage("");try{
    for(const target of targets){const old=saved(target.key),page=pages[target.key].trim();if(page===(old?.page_ids[0]||""))continue;
      await put(old?.id||crypto.randomUUID(),{workspaceId:data.library.brand.id,brandKey:target.key,purpose:"brand",pageIds:page?[page]:[],countries:old?.countries||["GB"]});
    }
    const searchTerms=terms.split("\n").map(t=>t.trim()).filter(Boolean);
    if(JSON.stringify(searchTerms)!==JSON.stringify(discovery?.search_terms||[]))await put(discovery?.id||crypto.randomUUID(),{workspaceId:data.library.brand.id,purpose:"discovery",searchTerms,countries:discovery?.countries||["GB"]});
    window.dispatchEvent(new Event("exter:brand-identities"));
    setMessage("Page IDs saved. Collection follows the live switch and schedule.");onSaved();
  }catch{setMessage("Some settings could not be saved. Check numeric Page IDs and the collection database, then retry.");}finally{setBusy(false);}}
  return <form className="meta-watchlist-editor" onSubmit={save}>
    {data.watchlistPollFailed&&<p className="reference-muted" role="status">Progress could not be refreshed. Saved details are still shown.</p>}
    <p className="reference-muted">{lookup.configured?"Suggested Pages are ranked by link captions matching the saved website, then name match and ads found. A Page ID is saved to your watchlist only after you confirm. Searches and pictures may wait for the shared Meta request limit.":"Add the Meta token in Render to find Pages automatically. Manual entry is available."}</p>
    {targets.map(target=><div className="meta-watchlist-target" key={target.key}><label><BrandName name={target.name}/><span>Meta Page ID</span><input aria-label={`${target.name} Meta Page ID`} inputMode="numeric" pattern="[0-9]{1,30}" maxLength={30} value={pages[target.key]} onChange={e=>setPages(p=>({...p,[target.key]:e.target.value}))} placeholder="Not configured"/></label>
      <MetaRunDetails run={saved(target.key)?.latestRun}/><MetaRetryButton data={data} watchlist={saved(target.key)} onSaved={onSaved} disabledReason={pages[target.key].trim()!==(saved(target.key)?.page_ids[0]||"")?"Save Page IDs before collecting a different Page.":null}/>
      {!saved(target.key)?.page_ids.length&&lookup.configured&&<MetaPageSuggestions workspaceId={data.library.brand.id} name={target.name} suggestion={lookup.suggestions[target.key]} disabled={busy} onConfirm={page=>void confirm(target.key,page)} onMore={()=>lookup.again(target.key,lookup.suggestions[target.key]?.result?.limited)}/>}
    </div>)}
    <details><summary>Find a Page ID manually</summary><p className="reference-muted">Search for the brand in the Meta Ad Library, open its advertiser page and copy the number after view_all_page_id in the page link. Use the Page ID, not an ad ID.</p></details>
    <details><summary>Category discovery keywords</summary><p className="reference-muted">Keywords discover category ads only. They never attribute an ad to a watchlist brand.</p><label>Keywords, one per line<textarea value={terms} onChange={e=>setTerms(e.target.value)}/></label></details>
    <div className="ui-actions"><button className="button primary" disabled={busy}>{busy?"Saving…":"Save Page IDs"}</button>{message&&<span role="status">{message}</span>}</div>
  </form>;
}
