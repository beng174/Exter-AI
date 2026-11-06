/** Graph's calendar day follows Pacific time, independently of the UK schedule. */
export function pacificDay(now=new Date()):string {
 const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Los_Angeles",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(now);
 const part=(type:string)=>parts.find(p=>p.type===type)!.value;
 return `${part("year")}-${part("month")}-${part("day")}`;
}
export function providerEndDate(value:string,now=new Date()):string{return value<pacificDay(now)?value:pacificDay(now);}
