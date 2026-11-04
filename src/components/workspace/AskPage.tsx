import { safeEvidenceHref } from "../../../shared/workspace-screens";
import { useState } from "react";
import { SectionCard, DataLabel } from "../ui";
import { api } from "../../lib/api";
import { evidenceUrl } from "../../../shared/creative-research";
import { ukDate } from "../../../shared/creative-presentation";
import { CreativeRow } from "../ui/CreativeRow";
import { Disabled,type ActionProps } from "./ActionWorkspace";
interface Answer {question:string;answer:string;sources:string[]}
export function AskPage({data,header}:ActionProps) {
  const [question,setQuestion]=useState(""),[history,setHistory]=useState<Answer[]>([]),[selected,setSelected]=useState(-1),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const current=history[selected]||history.at(-1),id=data.base.library.brand.id;
  async function ask(text:string){if(!text.trim()||busy)return;setBusy(true);setError("");try{const answer=await api<{answer:string;sources:string[]}>("/api/ask",{brandId:id,question:text,platform:"all",range:30});setHistory(items=>[...items,{question:text,...answer}]);setSelected(history.length);setQuestion("");}catch{setError("The question could not be answered. Earlier answers are preserved.");}finally{setBusy(false);}}
  const sources=current?.sources.map(source=>({source,row:data.base.library.creatives.find(row=>row.adId===source||row.nativeId===source||row.sourceUrl===source)}))||[];
  const sourceHref=safeEvidenceHref;
  return <>{header()}<div className="ask-page-layout"><div className="reference-stack">
    {current&&<div className="ask-page-question">{current.question}</div>}
    <SectionCard title="Answer">{busy?<p role="status">Reading saved evidence…</p>:current?<><div className="ask-page-answer">{current.answer}</div><div className="ask-citation-links">{sources.map((item,index)=><a key={index} href={`#ask-source-${index+1}`}>[{index+1}]</a>)}</div><DataLabel basis="Observed"/><p className="ask-not-checked">Not checked: competitors' sales or ROAS, unpublished audience traits and sources without saved evidence.</p><div className="reference-actions"><Disabled reason="Saving answers to weekly reports is not available yet.">Save to weekly report</Disabled><Disabled reason="Turning an answer into a saved brief is not available yet.">Turn into a brief</Disabled><button className="button secondary" onClick={()=>void navigator.clipboard.writeText(current.answer).catch(()=>setError("Copy was unavailable. Select the answer text to copy it."))}>Copy</button></div></>:<p className="reference-muted">Ask a question to see an answer from your saved evidence.</p>}</SectionCard>
    <div className="ask-page-suggestions">{["What changed for competitors this week?","Which of our ads are tiring?","What do customers complain about most?","Which creators fit the brief?"].map(text=><button key={text} onClick={()=>setQuestion(text)}>{text}</button>)}</div>
    <form className="ask-page-form" onSubmit={event=>{event.preventDefault();void ask(question);}}><label>Ask a question<textarea rows={2} maxLength={2000} value={question} onChange={event=>setQuestion(event.target.value)} placeholder="For example: which offers did competitors stop this month?"/></label><button className="button primary" disabled={busy||!question.trim()}>Ask</button></form>{error&&<p role="alert">{error}</p>}
  </div><aside className="reference-stack"><SectionCard title="Sources for this answer">{sources.length?<ol className="ask-page-sources">{sources.map((item,index)=><li id={`ask-source-${index+1}`} key={index}><strong>[{index+1}]</strong>{item.row?<a href={evidenceUrl(id,{ad:item.row.adId})}><CreativeRow row={item.row}/></a>:sourceHref(item.source)?<a href={sourceHref(item.source)!} target="_blank" rel="noopener noreferrer">{new URL(item.source).hostname}</a>:<span>Saved evidence source</span>}</li>)}</ol>:<p className="reference-muted">Sources appear with a saved-evidence answer.</p>}</SectionCard><SectionCard title="Earlier questions">{history.length?history.map((answer,index)=><button className="earlier-question" key={index} onClick={()=>setSelected(index)}>{answer.question}</button>):<p className="reference-muted">No earlier questions in this session.</p>}</SectionCard></aside></div></>;
}
