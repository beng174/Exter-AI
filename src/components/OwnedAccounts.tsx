import "./owned-accounts.css";
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import type { OwnedAccount } from "../../server/owned/types";

export function OwnedAccounts({workspaceId}:{workspaceId:string}) {
  const [accounts,setAccounts]=useState<OwnedAccount[]>([]),[error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false);
  const [platform,setPlatform]=useState("Meta"),[accountId,setAccountId]=useState(""),[currency,setCurrency]=useState("GBP"),[event,setEvent]=useState("purchase");
  const [enabled,setEnabled]=useState(false);
  const currentWorkspace=useRef(workspaceId);currentWorkspace.current=workspaceId;
  const date=(value:string|null)=>value?new Date(value).toLocaleString("en-GB",{timeZone:"Europe/London"}):"Unavailable";
  async function load() {try{const data=await api<{accounts:OwnedAccount[];liveDispatchEnabled:boolean}>(`/api/owned/accounts?${new URLSearchParams({workspaceId})}`);if(currentWorkspace.current!==workspaceId)return;setAccounts(data.accounts);setEnabled(data.liveDispatchEnabled);setError("");}catch(e){if(currentWorkspace.current===workspaceId)setError((e as Error).message);}}
  useEffect(()=>{setAccounts([]);setNotice("");void load();},[workspaceId]);
  async function save(e:React.FormEvent){e.preventDefault();setBusy(true);try{await api("/api/owned/accounts",{workspaceId,platform,accountId,currency,attribution:platform==="Meta"?"7d_click,1d_view":"account_configured",conversionEvent:event});setAccountId("");await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function queue(id:string){setBusy(true);try{await api(`/api/owned/accounts/${encodeURIComponent(id)}/sync`,{workspaceId});setNotice("Sync queued. Fixture tests are not live verification.");await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <section className="panel owned-accounts" aria-label="Owned account connections"><h2>Owned account connections</h2><p>Link multiple read-only reporting accounts to this workspace. Tokens stay in Render secrets and are never entered here.</p><p>{enabled?"Live dispatch is enabled by configuration.":"Live dispatch is disabled. Phase 0 and Phase 1 live gates remain open."} Fixtures are not live verification.</p>
    {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    <form onSubmit={save}><div className="form-row"><label>Platform<select value={platform} onChange={e=>{setPlatform(e.target.value);if(e.target.value==="Meta")setEvent("purchase");}}><option>Meta</option><option>TikTok</option></select></label><label>Account ID<input required pattern="[0-9]{1,40}" value={accountId} onChange={e=>setAccountId(e.target.value)} /></label><label>Currency<input required pattern="[A-Z]{3}" maxLength={3} value={currency} onChange={e=>setCurrency(e.target.value.toUpperCase())} /></label><label>Conversion event<input required value={event} onChange={e=>setEvent(e.target.value)} readOnly={platform==="Meta"} /></label></div><p>Meta attribution: 7-day click and 1-day view. TikTok attribution and conversion event follow the account configuration. Currency must match the account.</p><button className="button secondary" disabled={busy}>Save account metadata</button></form>
    {!accounts.length&&!error&&<p>No accounts linked. Add account metadata; missing credentials stay not connected.</p>}
    {accounts.map(account=><article key={account.id}><h3>{account.platform} account {account.account_id}</h3><dl><dt>Status</dt><dd>{account.status.replaceAll("_"," ")}</dd><dt>Last successful sync</dt><dd>{date(account.last_successful_sync)}</dd><dt>Latest data date</dt><dd>{account.latest_data_date?.slice(0,10)||"Unavailable"}</dd><dt>Last error</dt><dd>{account.last_error||"None recorded"}</dd></dl><button className="button secondary" disabled={busy} onClick={()=>void queue(account.id)}>Queue sync</button></article>)}
    <button className="button secondary" disabled={busy} onClick={()=>void load()}>Refresh account status</button>
  </section>;
}
