// Basic, opt-in collection preparation. No Google script or ping before all gates pass.
export function createAnalytics({config,consent=false,internal=false,send,storage}) {
 let granted=consent===true;
 const allowed=()=>/^G-[A-Z0-9]{6,20}$/.test(config.measurementId||'')&&config.activationApproved===true&&config.consentApproved===true&&granted&&!internal&&!config.internalTraffic;
 function track(name,data={}) {
  if(!allowed())return false;
  if(!['page_view','view_item','add_to_cart','begin_checkout','purchase','wholesale_view','quote_submit'].includes(name))return false;
  if(['view_item','add_to_cart','begin_checkout','purchase'].includes(name)&&config.paymentMode!=='live')return false;
  let payload;
  if(name==='page_view'||name==='wholesale_view')payload={page_location:data.page_location,page_title:data.page_title};
  else if(name==='quote_submit')payload={form_id:'bulk-inquiry'};
  else {
   if(data.currency!=='USD'||!Number.isFinite(data.value)||data.value<0||!Array.isArray(data.items)||!data.items.length)return false;
   const items=data.items.map(i=>({item_id:i.item_id,item_name:i.item_name,price:i.price,quantity:i.quantity}));
   if(items.some(i=>!/^pink-(50|100|200|400)$/.test(i.item_id)||!Number.isSafeInteger(i.quantity)||i.quantity<1||!Number.isFinite(i.price)||i.price<0))return false;
   payload={currency:'USD',value:data.value,items};
   if(name==='purchase') {
    if(!/^cs_live_[A-Za-z0-9]{16,200}$/.test(data.transaction_id||''))return false;
    const key='favroe-ga4-purchase:'+data.transaction_id;
    // Fail closed without durable local deduplication; Google also receives transaction_id.
    try{if(!storage||storage.getItem(key))return false;storage.setItem(key,'sent');}catch{return false;}
    payload={...payload,transaction_id:data.transaction_id,tax:data.tax||0,shipping:data.shipping||0};
   }
  }
  send(name,payload);return true;
 }
 return {track,setConsent(value){granted=value===true;},allowed};
}

if(typeof window!=='undefined'&&typeof document!=='undefined') {
 const path=location.pathname.replace(/\/$/,'')||'/';
 const excluded=/^\/(ops|cart|payment-return|newsletter|journal-editor|journal-admin)(\/|$)/.test(path);
 // Payment return may emit verified purchase only; it must never emit page_view.
 const paymentReturn=path==='/payment-return';
 const internal=['localhost','127.0.0.1','::1'].includes(location.hostname)||location.hostname.endsWith('.pages.dev');
 let controller,config,loaded=false,granted=false,booted=false,denied=false;
 const gtag=(...args)=>{window.dataLayer=window.dataLayer||[];window.dataLayer.push(args);};
 function boot() {
  if(booted||!controller?.allowed())return;
  booted=true;
  if(!loaded){
   loaded=true;window.gtag=gtag;
   gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
   gtag('consent','update',{analytics_storage:'granted'});
   gtag('js',new Date());
   gtag('config',config.measurementId,{send_page_view:false,allow_google_signals:false,allow_ad_personalization_signals:false,page_location:location.origin+location.pathname,page_referrer:document.referrer?new URL(document.referrer).origin:''});
   const script=document.createElement('script');script.async=true;script.src='https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(config.measurementId);document.head.append(script);
  }
  const page={page_location:location.origin+location.pathname,page_title:document.title};
  if(paymentReturn){const id=new URLSearchParams(location.search).get('session_id');if(/^cs_live_[A-Za-z0-9]{16,200}$/.test(id||''))fetch('/api/analytics-purchase?session_id='+encodeURIComponent(id),{credentials:'same-origin',cache:'no-store'}).then(r=>r.ok?r.json():null).then(d=>{if(d?.purchase)controller.track('purchase',d.purchase);}).catch(()=>{});}
  if(!excluded){controller.track('page_view',page);if(path==='/wholesale')controller.track('wholesale_view',page);}
  if(path==='/product'&&document.querySelector('input[name="shop-finish"]:checked')?.value!=='aluminum'&&window.FAVROE_COMMERCE){const c=window.FAVROE_COMMERCE,p=c.packs.find(p=>p.sets===Number(document.querySelector('#shop-pack')?.value));if(p)controller.track('view_item',{currency:'USD',value:p.cents/100,items:[{item_id:'pink-'+p.sets,item_name:p.name,price:p.cents/100,quantity:1}]});}
 }
 // An approved consent UI must call this for each page. No consent is inferred from browsing.
 window.FavroeAnalytics={setConsent(value){granted=value===true;controller?.setConsent(granted&&!denied);if(!granted){denied=true;if(config?.measurementId)window['ga-disable-'+config.measurementId]=true;}else if(!denied)boot();},track:(name,data)=>controller?.track(name,data)||false};
 document.addEventListener('favroe:commerce',event=>{if(!excluded||paymentReturn)controller?.track(event.detail?.name,event.detail?.data);});
 // Private/utility routes never load analytics. Payment-return is a purchase-only exception.
 if(!excluded||paymentReturn)fetch('/api/analytics-config',{credentials:'same-origin',cache:'no-store'}).then(r=>r.ok?r.json():null).then(c=>{
  if(!c)return;config=c;let optedOut=false,storage;try{storage=localStorage;optedOut=storage.getItem('favroe-analytics-internal')==='true';}catch{optedOut=true;}
  controller=createAnalytics({config:c,consent:granted,internal:internal||optedOut,storage,send:(name,data)=>gtag('event',name,data)});if(!denied)boot();
 }).catch(()=>{});
}
