import {AD_FORMATS,PRODUCT_CATEGORIES,formatName,type ComparisonFilter,type AdFormat} from "../../../shared/public-comparisons";
import "./ComparisonFilters.css";
export function ComparisonFilters({filter,onChange,fixedFormat}:{filter:ComparisonFilter;onChange:(patch:Record<string,string>)=>void;fixedFormat?:AdFormat|null}){
 return <div className="ui-comparison-filters" role="group" aria-label="Comparison filters">
  <label>Category<select aria-label="Comparison category" value={filter.category||"mine"} onChange={e=>onChange({category:e.target.value})}><option value="mine">My categories</option><option value="all">All categories</option>{PRODUCT_CATEGORIES.map(c=><option key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1)}</option>)}</select></label>
  <label>Format<select aria-label="Comparison format" value={fixedFormat?"same":filter.adFormat||"same"} onChange={e=>onChange({adFormat:e.target.value})} disabled={fixedFormat!==undefined}><option value="same">Same format{fixedFormat?` (${formatName(fixedFormat)})`:""}</option>{fixedFormat===undefined&&AD_FORMATS.map(format=><option key={format} value={format}>{formatName(format)}</option>)}</select></label>
 </div>;
}
