import { Unavailable } from "./Unavailable";
import "./StatusChip.css";
export const STATUS_TONES = {
  "Proven winner":"green", Rising:"blue", Steady:"grey", "Switched off fast":"red",
  "Test now":"teal", Scale:"green", Fix:"amber", Reduce:"red", Watch:"blue", "In line":"grey",
  Live:"green", Beta:"teal", Preview:"grey", Connected:"green", Waiting:"amber", Error:"red", "Not connected":"grey",
} as const;
export function StatusChip({status}:{status:keyof typeof STATUS_TONES|null}) {if(!status)return <Unavailable reason="This status has not been recorded." unlock="It needs a successful source check."/>;return <span className={`ui-status-chip ui-status-chip-${STATUS_TONES[status]}`}>{status}</span>;}
