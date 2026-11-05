import type { Brand } from "./types";
export type BrandIdentity = Pick<Brand,"id"|"name"|"domain"|"color"|"initials"|"mode"|"metaPageId">;
export function brandInitials(name:string) {
  return name.trim().split(/\s+/).filter(word=>/[\p{L}\p{N}]/u.test(word)).slice(0,2).map(word=>Array.from(word)[0]).join("").toLocaleUpperCase() || "?";
}
export function brandColour(name:string) {
  const colours=["#233b80","#9a3e35","#386b54","#75528a","#80602f","#266b80"];
  return colours[Array.from(name).reduce((hash,ch)=>(hash*31+ch.charCodeAt(0))>>>0,0)%colours.length];
}
export function logoAlt(name:string,nameBeside:boolean) {return nameBeside?"":name;}

export function brandInk(colour:string) {
  const hex=/^#[a-f0-9]{6}$/i.test(colour)?colour:"#233b80";
  const [r,g,b]=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
  return .2126*r+.7152*g+.0722*b>.55?"#17213d":"#ffffff";
}
