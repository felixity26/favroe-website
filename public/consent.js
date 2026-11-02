// Analytics consent banner. No Google script or ping before an affirmative choice.
// Works with /analytics.js: setConsent(true) boots measurement; setConsent(false) disables it for the page.
if(typeof window!=='undefined'&&typeof document!=='undefined'){
 const KEY='favroe-analytics-consent-v1';
 const read=()=>{try{const v=localStorage.getItem(KEY);return v==='granted'||v==='denied'?v:null;}catch{return 'denied';}};
 const write=v=>{try{localStorage.setItem(KEY,v);}catch{}};
 const apply=v=>{if(window.FavroeAnalytics)window.FavroeAnalytics.setConsent(v==='granted');};
 function show(){
  if(document.getElementById('favroe-consent-banner'))return;
  const style=document.createElement('style');
  style.textContent=`
#favroe-consent-banner{position:fixed;left:0;right:0;bottom:0;z-index:100;background:var(--chalk,#f3eee7);color:var(--au,#493848);border-top:1px solid var(--line,rgba(73,56,72,.23));font:400 15px/1.6 Manrope,Arial,sans-serif}
#favroe-consent-banner .fcb-inner{width:min(1320px,calc(100% - 40px));margin:auto;display:flex;align-items:center;justify-content:space-between;gap:28px;padding:22px 0;flex-wrap:wrap}
#favroe-consent-banner p{margin:0;font-size:14px;max-width:640px}
#favroe-consent-banner a{color:inherit;text-underline-offset:5px}
#favroe-consent-banner .fcb-actions{display:flex;align-items:center;gap:22px;flex-shrink:0}
#favroe-consent-banner .fcb-accept{display:inline-flex;align-items:center;background:var(--au,#493848);color:var(--chalk,#f3eee7);border:1px solid var(--au,#493848);padding:13px 22px;font:inherit;font-size:13px;min-height:46px;cursor:pointer;transition:background .2s,color .2s}
#favroe-consent-banner .fcb-accept:hover{background:var(--ap,#d8ad96);color:var(--au,#493848)}
#favroe-consent-banner .fcb-decline{border:none;border-bottom:1px solid var(--au,#493848);padding:7px 0;background:none;font:inherit;font-size:13px;cursor:pointer;color:inherit}
#favroe-consent-banner button:focus-visible,#favroe-consent-banner a:focus-visible{outline:3px solid var(--au,#493848);outline-offset:5px}
@media(max-width:800px){#favroe-consent-banner .fcb-inner{display:block;padding:18px 0}#favroe-consent-banner .fcb-actions{margin-top:16px}}`;
  const bar=document.createElement('div');
  bar.id='favroe-consent-banner';
  bar.setAttribute('role','region');
  bar.setAttribute('aria-label','Analytics consent');
  bar.innerHTML='<div class="fcb-inner"><p>We would like to use privacy-respecting analytics (Google Analytics 4) to understand how the site is used. Nothing is measured unless you accept, and the site works the same either way. See our <a href="/policies/privacy/">Privacy Policy</a>.</p><div class="fcb-actions"><button type="button" class="fcb-decline">Decline</button><button type="button" class="fcb-accept">Accept analytics</button></div></div>';
  document.head.append(style);
  document.body.append(bar);
  const done=v=>{write(v);apply(v);bar.remove();style.remove();};
  bar.querySelector('.fcb-accept').addEventListener('click',()=>done('granted'));
  bar.querySelector('.fcb-decline').addEventListener('click',()=>done('denied'));
 }
 void import('/analytics.js?v=seo-preparation-20261030').catch(()=>{}).finally(()=>{
  const stored=read();
  if(stored)apply(stored);else if(document.body)show();else document.addEventListener('DOMContentLoaded',show,{once:true});
 });
}
