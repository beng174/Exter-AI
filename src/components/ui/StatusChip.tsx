import { Unavailable } from "./Unavailable";
import "./StatusChip.css";
export const STATUS_TONES = {
  "Proven winner":"green", Rising:"blue", Steady:"grey", "Switched off fast":"red",
  "Test now":"teal", Scale:"green", Fix:"amber", Reduce:"red", Watch:"blue", "In line":"grey",
  "Saved sample":"amber", "Saved research":"teal", "Saved quotes":"teal", Configured:"blue", "Not collected":"grey", Syncing:"blue", Live:"green", Beta:"teal", Preview:"grey", Connected:"green", Waiting:"amber", Error:"red", "Not connected":"grey",
} as const;
export function StatusChip({status}:{status:string|null}) {if(!status)return <Unavailable reason="This status has not been recorded." unlock="It needs a successful source check."/>;return <span data-status={status} className={`ui-status-chip ui-status-chip-${(STATUS_TONES as Record<string,string>)[status]||({Yes:"green",No:"amber",Draft:"grey","Not validated yet":"grey"} as Record<string,string>)[status]||"grey"}`}>{status}</span>;}
