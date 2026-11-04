import { Unavailable } from "./Unavailable";
import "./Confidence.css";
export function Confidence({level}:{level:"High"|"Medium"|"Low"|null}) {
  return level?<span className={`ui-confidence ui-confidence-${level.toLowerCase()}`}>{level} confidence<span className="ui-confidence-bar" aria-hidden="true"><i/></span></span>:<Unavailable reason="Confidence has not been established." unlock="It needs the validated calculation and sufficient source history."/>;
}
