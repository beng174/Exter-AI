import {useEffect,useState} from "react";
import {PRODUCT_CATEGORIES} from "../../../shared/public-comparisons";
import type {CreativeBrowserResponse} from "../../../shared/creative-browser";
import {api} from "../../lib/api";
export function PrimaryCategories({library,sample,onSaved}:{library:CreativeBrowserResponse;sample:boolean;onSaved:()=>void}){
 const initial=library.brand.primaryCategories||[],[selected,setSelected]=useState(initial),[editing,setEditing]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[custom,setCustom]=useState("");
 useEffect(()=>setSelected(library.brand.primaryCategories||[]),[library.brand.id,JSON.stringify(initial)]);
 const save=async()=>{setBusy(true);setError("");try{await api(`/api/brands/${encodeURIComponent(library.brand.id)}/primary-categories`,{categories:selected});setEditing(false);onSaved();}catch{setError("Categories could not be saved. Please retry.");}finally{setBusy(false);}};
 return <div className="research-primary-categories"><h3>Primary categories</h3><p>{initial.length?initial.join(", "):"Choose categories for comparisons."}</p><button className="button secondary" disabled={sample||busy} title={sample?"Sample workspace is read-only.":undefined} onClick={()=>setEditing(v=>!v)}>{editing?"Cancel":"Edit categories"}</button>
 {editing&&<fieldset disabled={busy}><legend>Compare ads in these product categories</legend>{[...new Set([...initial,...PRODUCT_CATEGORIES])].map(category=><label key={category}><input type="checkbox" checked={selected.includes(category)} onChange={e=>setSelected(values=>e.target.checked?[...values,category]:values.filter(v=>v!==category))}/>{category}</label>)}<label>Specific product category<input value={custom} maxLength={80} onChange={e=>setCustom(e.target.value)}/></label><button className="button secondary" disabled={custom.trim().length<3||selected.length>=16} onClick={()=>{setSelected(values=>[...new Set([...values,custom.trim().toLowerCase()])]);setCustom("");}}>Add category</button><p>{selected.join(", ")}</p><button className="button primary" onClick={()=>void save()}>Save categories</button></fieldset>}{error&&<p role="alert">{error}</p>}</div>;
}
