import test from 'node:test';
import assert from 'node:assert/strict';
import {browserCreative} from './fixtures/creative-browser.js';
import {publicVersions} from '../shared/public-signals.js';
import {comparableBriefs} from '../shared/public-comparisons.js';
test('a bounded detail page uses the full SQL version count without exposing private versions',()=>{
 const row=browserCreative({publicVersionCount:123});assert.equal(publicVersions(row,[row]),123);assert.equal(publicVersions({...row,publicVersionCount:null},[row]),null);assert.equal(publicVersions({...row,owned:true},[row]),null);
});
test('saved brief references use complete cohort counts, while missing or mismatched proof stays excluded',()=>{
 const row=browserCreative({adFormat:'video',productCategories:['candles']}),brief={evidence:[{adId:row.adId}]};
 assert.equal(comparableBriefs([brief],[row],['candles']).length,0);
 const counts=[{format:'video' as const,yours:10,competitors:20,hidden:false}];assert.equal(comparableBriefs([brief],[row],['candles'],{},counts).length,1);assert.equal(comparableBriefs([{evidence:[{adId:'absent'}]}],[row],['candles'],{},counts).length,0);assert.equal(comparableBriefs([brief],[{...row,adFormat:'catalogue'}],['candles'],{},counts).length,0);
});
