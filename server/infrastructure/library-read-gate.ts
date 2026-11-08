export class LibraryReadGate {
  private active=false;
  private waiting:{grant:()=>void;cancel:()=>void}[]=[];
  constructor(private maxWaiting=8,private waitMs=30000){}
  acquire(signal:AbortSignal):Promise<(()=>void)|null>{
    if(signal.aborted)return Promise.resolve(null);
    if(!this.active){this.active=true;return Promise.resolve(this.releaseOnce());}
    if(this.waiting.length>=this.maxWaiting)return Promise.resolve(null);
    return new Promise(resolve=>{
      let timer:ReturnType<typeof setTimeout>;
      const cleanup=()=>{clearTimeout(timer);signal.removeEventListener("abort",entry.cancel);const index=this.waiting.indexOf(entry);if(index>=0)this.waiting.splice(index,1);};
      const entry={grant:()=>{cleanup();resolve(this.releaseOnce());},cancel:()=>{cleanup();resolve(null);}};
      this.waiting.push(entry);signal.addEventListener("abort",entry.cancel,{once:true});timer=setTimeout(entry.cancel,this.waitMs);timer.unref();
    });
  }
  private releaseOnce(){let released=false;return()=>{if(released)return;released=true;const next=this.waiting[0];if(next)next.grant();else this.active=false;};}
}
