import {useEffect,useRef} from 'react';
import {expireLibraryReads} from '../lib/read-cache';
/** Schedule from completion, never interrupt a slow request with an interval. */
export function useIndexRefresh(active:boolean,loading:boolean,revision:number,refresh:()=>void,delayMs=5000){
 const callback=useRef(refresh);callback.current=refresh;
 useEffect(()=>{
  if(!active||loading)return;
  const timer=window.setTimeout(()=>{expireLibraryReads();callback.current();},delayMs);
  return()=>window.clearTimeout(timer);
 },[active,loading,revision,delayMs]);
}
