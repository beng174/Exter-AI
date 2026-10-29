import { build } from 'esbuild';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const output=resolve(process.argv[2]||'.preview/Exter-AI-Test-Drive.html');
const bundled=await build({
  entryPoints:['src/preview.ts'],bundle:true,write:false,outfile:'preview.js',
  format:'iife',platform:'browser',target:['es2022'],minify:true,
  define:{'process.env.NODE_ENV':'"production"'},legalComments:'none',
});
const js=bundled.outputFiles.find(file=>file.path.endsWith('.js'))!.text;
const css=bundled.outputFiles.find(file=>file.path.endsWith('.css'))!.text
  .replace(/@import\s*(?:url\([^)]*\)|"[^"]*"|'[^']*')\s*;/gi,'');
const images:Record<string,string>={};
for(const file of await readdir('public/images')){
  if(!file.endsWith('.jpg'))continue;
  images[`/images/${file}`]=`data:image/jpeg;base64,${(await readFile(`public/images/${file}`)).toString('base64')}`;
}
const bannerCss=`
.preview-notice{position:fixed;z-index:1000;inset:0 0 auto;height:40px;display:flex;align-items:center;justify-content:center;gap:20px;background:#244d3b;color:#eef5e5;padding:0 18px;font:11px/1.5 system-ui,sans-serif;box-shadow:0 1px 5px #18392130}.preview-notice-title{font-size:9px;font-weight:700;letter-spacing:1.5px;color:#d2e7b7;white-space:nowrap}.preview-notice-copy{opacity:.8}.preview-notice button{font:inherit;color:#eff9e6;background:#ffffff12;border:1px solid #ffffff30;border-radius:4px;padding:3px 9px;white-space:nowrap}.preview-notice button:hover{background:#ffffff25}.offline-test-drive #root{padding-top:40px}.offline-test-drive .sidebar{top:40px}.offline-test-drive .ask-panel{top:40px}.offline-test-drive .modal-backdrop{padding-top:55px}@media(max-width:760px){.preview-notice{gap:12px;justify-content:space-between;font-size:9px}.preview-notice-title{font-size:8px}.preview-notice-copy{font-size:8px;line-height:1.4;max-width:180px}.preview-notice button{font-size:8px;padding:4px 6px}}`;
const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Exter AI — Offline test drive</title><link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' rx='10' fill='%23244d3b'/%3E%3Ctext x='11' y='29' fill='%23e9f5d8' font-family='sans-serif' font-size='27'%3EE%3C/text%3E%3C/svg%3E"><style>${css.replace(/<\/style/gi,'<\\/style')}${bannerCss}</style></head><body><div id="root"></div><script>window.__EXTER_PREVIEW_IMAGES__=${JSON.stringify(images)};</script><script>${js.replace(/<\/script/gi,'<\\/script')}</script></body></html>`;
await mkdir(dirname(output),{recursive:true});
await writeFile(output,html);
console.log(`Created ${output} (${(Buffer.byteLength(html)/1024/1024).toFixed(1)} MB). Open it directly in a desktop browser; no server is needed.`);
