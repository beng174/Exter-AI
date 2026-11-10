import { CreatorsReadModel } from "./ActionReadModels";
import { Disabled, type ActionProps } from "./ActionWorkspace";
import { CreatorDiscoveryPage } from "./CreatorDiscoveryPage";
export function CreatorsPage(props: ActionProps) {
  const { data, header } = props;
  if (data.base.library.presentation) return <>{header(<><Disabled reason="Sample workspace is read-only.">Compare 2</Disabled><Disabled primary reason="Sample workspace is read-only.">Export shortlist</Disabled></>)}<CreatorsReadModel library={data.base.library} model={data.base.library.presentation} /></>;
  return <CreatorDiscoveryPage key={data.base.library.brand.id} {...props} />;
}
