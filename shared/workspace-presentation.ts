import type values from "./sample/values.json";
/** Optional section read models. Absence keeps the current unavailable states. */
export type WorkspacePresentation = typeof values;
export interface CreativePresentation {
  colour:string; status:string; tone:string; facts:string; tags:string[];
  metrics:{label:string;value:string;basis:"Observed"|"Estimated"|"Modelled"}[];
}
