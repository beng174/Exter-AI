import { installPreviewApi } from './lib/preview-api';

document.documentElement.classList.add('offline-test-drive');
const notice=document.createElement('aside');
notice.className='preview-notice';
notice.setAttribute('aria-label','Offline test drive');
notice.innerHTML='<span class="preview-notice-title">EXTER TEST DRIVE</span><span class="preview-notice-copy">Sample data · No live connections · Changes stay in this browser</span><button type="button" id="preview-reset">Reset demo</button>';
document.body.prepend(notice);
notice.querySelector('#preview-reset')!.addEventListener('click',()=>{
  if(confirm('Reset this test drive? This removes only the test workspaces, imports, reports and shortlists saved by this preview in your browser.')){
    (window as unknown as {__EXTER_RESET_PREVIEW__?:()=>void}).__EXTER_RESET_PREVIEW__?.();
  }
});
window.addEventListener('exter-preview-storage',(event)=>{
  const detail=(event as CustomEvent<{message:string}>).detail;
  const copy=notice.querySelector('.preview-notice-copy');
  if(copy)copy.textContent=detail.message;
});

// Loading App only after the local API is installed keeps every request offline.
installPreviewApi();
void import('./main');
