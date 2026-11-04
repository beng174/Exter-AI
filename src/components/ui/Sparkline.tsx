import { Unavailable } from "./Unavailable";
import "./Sparkline.css";
export function Sparkline({values,summary}:{values:readonly (number|null)[];summary:string}) {
  if(values.length<2||values.some(value=>value===null||!Number.isFinite(value)))return <Unavailable reason="A complete trend is not recorded." unlock="It needs at least two dated observations."/>;
  const points=values as readonly number[],min=Math.min(...points),max=Math.max(...points);
  const path=points.map((value,index)=>`${index?"L":"M"}${index/(points.length-1)*100},${max===min?15:28-(value-min)/(max-min)*26}`).join(" ");
  return <figure className="ui-sparkline"><svg viewBox="0 0 100 30" role="img" aria-label={summary}><path d={path}/></svg><figcaption>{summary}</figcaption></figure>;
}
