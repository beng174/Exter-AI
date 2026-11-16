import type {CreativeReadModel} from '../../../shared/creative-read-model';
export function IndexingNotice({progress}:{progress?:CreativeReadModel['indexing']}){
 if(!progress||progress.status==='complete'&&progress.indexed>=progress.total)return null;
 return <p role="status" className="muted">Indexing ads: {progress.indexed.toLocaleString('en-GB')} of {progress.total.toLocaleString('en-GB')}{progress.fallback?' · Showing the latest ads.':null}{progress.status==='paused'?' · Paused. Review worker details in Data sources.':null}</p>;
}
