import "./EmptyState.css";
export function EmptyState({title,description,action}:{title:string;description:string;action?:{label:string;onClick:()=>void}}) {
  return <div className="ui-empty-state"><h3>{title}</h3><p>{description}</p>{action&&<button onClick={action.onClick}>{action.label}</button>}</div>;
}
