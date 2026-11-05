"""Alignment review at three widths in both workspaces; all requests stay local."""
from pathlib import Path
import json,shutil,sys,base64
from PIL import Image,ImageDraw
from playwright.sync_api import sync_playwright
BASE='http://127.0.0.1:3118'
OUT=Path('output/playwright/alignment');OUT.mkdir(parents=True,exist_ok=True)
SCREENS={
 'Main':('overview',['What to work on','You against the market','Your account','Top working ads','What changed','Needs attention']),
 'Brands':('brands',['Northwick Candle Co.','What the public sources say','Positioning signals','Competitor set','Profiles, creators and limits']),
 'Competitors':('competitors',['Scorecard','Creative mix by brand','What each competitor leans on']),
 'Creatives':('creatives',[]),
 'CreativeDetail':('creative&id=sample-ad-001',['Scenes · jump to a moment','Source and running history','Performance','Creative score','Viewer retention','What is said and shown','How Exter reads it','In the market']),
 'Formats':('formats',['Format league table','How winning ads are built']),
 'Patterns':('patterns',['You against the category','What each action means']),
 'Audience':('audience',['Customer voice','Words customers use','Who the ads reach','How each brand talks']),
 'Winners':('winners',['Working Score','Your account winners']),
 'Briefs':('briefs',['7 opportunities this week','Gift-ready unboxing','The brief']),
 'Creators':('creators',['Ama','Hana','Cleo','Priya','Megan','Sofia']),
 'Scores':('scores',['Score a draft','Gift box, version 2','Recent scores','Predictive score']),
 'Ask':('ask',['Answer','Sources for this answer','Earlier questions']),
 'Reports':('reports',['Weekly packs','Client link','Northwick Candle Co. · 27 Oct to 2 Nov']),
 'DataSources':('data',['Source health','Your ad accounts','Ad naming convention','Budgets and schedule','Users and client access'])
}
phase=sys.argv[1] if len(sys.argv)>1 else 'after'
checks=[]
AUDIT_JS=r"""() => {
 const main=document.querySelector('main.reference-ui'),m=main.getBoundingClientRect(),style=getComputedStyle(main),padding=parseFloat(style.paddingLeft);
 const width=innerWidth,sidebar=width>=960?260:0,problems=[];
 if(Math.abs(m.x+m.width/2-(sidebar+(width-sidebar)/2))>1)problems.push('Page is not centred');
 if(m.width-padding*2>1281)problems.push('Content exceeds 1280px');
 const header=main.querySelector('.ui-page-header');if(header&&Math.abs(header.getBoundingClientRect().x-(m.x+padding))>1)problems.push('Header left edge');
 for(const cell of main.querySelectorAll('.ui-table-number'))if(getComputedStyle(cell).textAlign!=='right')problems.push('Numeric alignment: '+cell.textContent);
 for(const cell of main.querySelectorAll('.ui-table-text'))if(getComputedStyle(cell).textAlign!=='left')problems.push('Text alignment: '+cell.textContent);
 for(const table of main.querySelectorAll('.ui-data-table table')){
  const headers=[...table.querySelectorAll('thead th')];
  headers.forEach((header,index)=>{
   if(!header.classList.contains('ui-table-number')&&!header.classList.contains('ui-table-text'))return;
   const expected=getComputedStyle(header).textAlign;
   for(const row of table.querySelectorAll('tbody tr'))if(row.cells[index]&&getComputedStyle(row.cells[index]).textAlign!==expected)problems.push('Column alignment: '+header.textContent+' / '+row.cells[index].textContent);
  });
 }
 for(const cell of main.querySelectorAll('td:is(.ui-table-basis,.ui-table-chip)')){
  const chip=cell.querySelector('.ui-data-label,.ui-status-chip');if(!chip)continue;
  const c=cell.getBoundingClientRect(),b=chip.getBoundingClientRect(),cs=getComputedStyle(cell);
  const contentCentre=(c.x+parseFloat(cs.paddingLeft)+c.right-parseFloat(cs.paddingRight))/2;
  if(Math.abs(b.x+b.width/2-contentCentre)>2||b.width>c.width||b.height>28)problems.push('Chip alignment: '+cell.textContent);
 }
 const aligned=(container,cardSelector,parts)=>{
  for(const grid of main.querySelectorAll(container)){
   const groups=new Map();for(const card of grid.querySelectorAll(':scope>'+cardSelector)){const y=Math.round(card.getBoundingClientRect().top),group=groups.get(y)||[];group.push(card);groups.set(y,group);}
   for(const group of groups.values())if(group.length>1){
    const rects=group.map(c=>c.getBoundingClientRect());if(Math.max(...rects.map(r=>r.bottom))-Math.min(...rects.map(r=>r.bottom))>1)problems.push(container+' card height');
    for(const part of parts){const found=group.map(c=>c.querySelector(part)).filter(Boolean);if(found.length!==group.length)continue;const ys=found.map(e=>e.getBoundingClientRect().top);if(Math.max(...ys)-Math.min(...ys)>1)problems.push(container+' '+part);}
   }
  }
 };
 aligned('.read-model-priorities','article',['header','h3','p','dl>div:nth-child(1)','dl>div:nth-child(2)','dl>div:nth-child(3)','.read-model-proof-thumbs','footer']);
 aligned('.read-model-competitor-cards','article',['header','p','.read-model-proof-thumbs','a']);
 aligned('.creator-card-grid','article',['header','.creator-metrics','.creator-card-actions']);
 aligned('.read-model-tiles','div',['span','strong','small']);
 aligned('.creative-browser-grid','.ui-creative-card',['h3','.ui-creative-tags','dl']);
 aligned('.research-metric-grid','.ui-metric-tile',['h3','.ui-metric-value']);
 for(const title of main.querySelectorAll('.ui-creative-card h3,.reference-creative-row strong'))if(getComputedStyle(title).webkitLineClamp!=='none')problems.push('Truncated title');
 for(const img of document.querySelectorAll('.brand-name .brand-mark img'))if(img.alt!=='')problems.push('Decorative logo alt');
 for(const mark of document.querySelectorAll('.brand-mark')){const b=mark.getBoundingClientRect(),size=Number(mark.dataset.size);if(Math.abs(b.width-size)>1||Math.abs(b.height-size)>1)problems.push('Logo size');}
 return {problems,contentWidth:m.width-padding*2,centred:true};
}"""

with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=shutil.which('chromium'),args=['--no-sandbox'])
 page=browser.new_page(locale='en-GB',timezone_id='Europe/London')
 errors=[];external=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 def local(r):
  if not r.request.url.startswith(BASE):external.append(r.request.url);r.abort()
  else:r.continue_()
 page.route('**/*',local)
 real_id=page.request.get(BASE+'/api/brands/valentte/creatives').json()['creatives'][0]['adId']
 for sample in (False,True):
  for width in (1280,1440,1920):
   page.set_viewport_size({'width':width,'height':1100})
   for name,(view,_) in SCREENS.items():
    view=view if sample else view.replace('sample-ad-001',real_id)
    url=BASE+'/?brandId='+('sample-northwick&demo=1' if sample else 'valentte')+'&view='+view
    page.goto(url,wait_until='networkidle')
    overflow=page.evaluate('document.documentElement.scrollWidth>innerWidth')
    audit=page.evaluate(AUDIT_JS) if phase=='after' else {}
    checks.append({'sample':sample,'width':width,'screen':name,'overflow':overflow,**audit})
    if phase=='after':
     assert not overflow,(name,sample,width)
     assert not audit['problems'],(name,sample,width,audit['problems'])
     assert page.locator('main h1').count()==1,(name,sample,width)
     if name=='CreativeDetail':assert page.locator('.creative-detail-columns').count()==1
     page.screenshot(path=str(Path('work')/f'alignment-{name}-{sample}-{width}.png'),full_page=True)
    if sample and width==1440 and name in ('Main','Winners','CreativeDetail','Competitors','Briefs'):
     page.screenshot(path=str(OUT/f'{phase}-{name}-1440.png'),full_page=True)
    if phase=='after' and sample and width==1440 and name=='Scores':page.screenshot(path=str(OUT/'score-Scores-sample-1440.png'),full_page=True)
    if phase=='after' and sample and width==1440 and name=='CreativeDetail':page.get_by_role('region',name='Creative score',exact=True).screenshot(path=str(OUT/'score-CreativeDetail-sample-1440.png'))
 if phase=='after':
  page.set_viewport_size({'width':1440,'height':1100})
  page.goto(BASE+'/?view=brands&brandId=valentte',wait_until='networkidle')
  known=page.request.get(BASE+'/api/brand-identities?brandId=valentte').json()
  rivals=page.request.get(BASE+'/api/brands/valentte/creative-competitors').json()['competitors']
  assert all(any(b['name']==r['name'] for b in known) for r in rivals),'All configured competitors have a logo identity'
  assert page.locator('.brand-logo-setting').count()==len(rivals)+1
  setting=page.locator('.brand-logo-setting').first
  setting.get_by_role('button',name='Change logo',exact=False).click()
  setting.locator('input[type=file]').set_input_files({'name':'fixture.png','mimeType':'image/png','buffer':base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=')})
  page.wait_for_function("document.querySelector('.workspace-switch .brand-mark img')?.complete && document.querySelector('.workspace-switch .brand-mark img')?.naturalWidth===64")
  setting.get_by_role('button',name='Change logo',exact=False).click();setting.get_by_role('button',name='Reset to automatic',exact=True).click()
  page.wait_for_function("document.querySelector('.workspace-switch .brand-mark img')?.naturalWidth===0")
  page.goto(BASE+'/?view=brands&brandId=sample-northwick&demo=1',wait_until='networkidle')
  assert page.locator('.brand-mark img').count()==0
  assert all(not b.is_enabled() for b in page.get_by_role('button',name='Change logo',exact=False).all())
 assert not errors,errors
 assert not external,external
 browser.close()
Path('work/alignment-'+phase+'.json').write_text(json.dumps(checks,indent=2))
print('Checked',len(checks),'screen/mode/width combinations;',sum(c['overflow'] for c in checks),'with overflow')

if phase=='after':
 for name in ('Main','Winners','CreativeDetail','Competitors','Briefs'):
  before=Image.open(OUT/f'before-{name}-1440.png').convert('RGB');after=Image.open(OUT/f'after-{name}-1440.png').convert('RGB')
  pair=Image.new('RGB',(before.width+after.width,max(before.height,after.height)+36),'#e5e7eb');draw=ImageDraw.Draw(pair)
  draw.text((16,10),'BEFORE: sample workspace at 1440px',fill='#17213d');draw.text((before.width+16,10),'AFTER: alignment and local brand identity',fill='#17213d')
  pair.paste(before,(0,36));pair.paste(after,(before.width,36));pair.save(OUT/f'{name}-comparison.png',optimize=True)
