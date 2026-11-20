import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {creatorProfile,creatorBrief} from './fixtures/creator-discovery.js';
import {creatorSalesSignal,emptyAdStats} from '../shared/creator-performance.js';
import {evaluateCreator} from '../shared/creator-discovery.js';
await mkdir(resolve('work'),{recursive:true});const dir=await mkdtemp(resolve('work/creator-performance-render-'));
const compiled=await build({entryPoints:['src/components/workspace/CreatorPerformance.tsx'],bundle:true,format:'esm',platform:'node',write:false,external:['react','react-dom'],loader:{'.css':'empty'}});await writeFile(join(dir,'view.mjs'),compiled.outputFiles[0].contents);const view=await import(pathToFileURL(join(dir,'view.mjs')).href);after(()=>rm(dir,{recursive:true,force:true}));
test('CP-02 cards label Sales Signal Estimated, disclose incomplete coverage and never call it ROAS',()=>{
 const p=creatorProfile(),signal=creatorSalesSignal(p,evaluateCreator(p,creatorBrief),['candles'],{...emptyAdStats(),ads:3,competitorAds:3,longest:74,versions:9},'2026-11-20');
 const html=renderToStaticMarkup(createElement(view.CreatorSalesBreakdown,{signal}));assert.match(html,/Sales Signal/);assert.match(html,/Estimated/);assert.match(html,/Provisional/);assert.match(html,/confidence/);assert.match(html,/3 competitor ads, longest 74 days, 9 versions/);assert(!html.includes('ROAS'));assert(!html.includes('CP-0'));
 const absent=renderToStaticMarkup(createElement(view.CreatorSalesBreakdown,{}));assert.match(absent,/appears after/);assert(!/Sales Signal\s*0/.test(absent));
});
test('CP-05 incomplete forecast checks show measurements, never an unvalidated forecast range',()=>{
 const html=renderToStaticMarkup(createElement(view.CreatorForecastMeasurements,{data:{accounts:[],cohorts:[],models:[]}}));assert.match(html,/No creator forecast has been trained or validated/);assert(!html.includes('Predicted ROAS'));
});
