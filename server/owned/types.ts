import type { OwnedPlatform } from "../../shared/owned-metrics.js";
export interface OwnedAccount {
  id:string; workspace_id:string; platform:OwnedPlatform; account_id:string;
  currency:string; attribution:string; conversion_event:string; enabled:boolean;
  status:"not_connected"|"pending"|"syncing"|"connected"|"error";
  last_successful_sync:string|null; latest_data_date:string|null; last_error:string|null;
}
export class OwnedSyncError extends Error {
  constructor(public reason:"not_connected"|"permission"|"schema"|"temporary"|"budget", message:string) { super(message); }
}
export const ownedFailure = (reason:OwnedSyncError["reason"]) => ({
  not_connected:"Account not connected. Configure the existing provider token in Render secrets.",
  permission:"Account reporting permission denied or token revoked. Stored history is retained; reconnect explicitly.",
  schema:"Account reporting configuration or response is unsupported. Stored history is retained.",
  budget:"Owned sync paused: data-provider budget is unset or its threshold is reached. Stored history is retained.",
  temporary:"Account reporting is temporarily unavailable. Stored history is retained.",
}[reason]);
