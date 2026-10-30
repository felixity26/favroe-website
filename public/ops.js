'use strict';
const $=s=>document.querySelector(s);
let token=sessionStorage.getItem('favroe_ops_token')||'';
const money=n=>n==null?'Not recorded':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n/100);
const node=(tag,text)=>{const e=document.createElement(tag);if(text!=null)e.textContent=String(text);return e;};
const LABEL={pending:'Awaiting fulfillment',inquiry:'Inquiry',quote:'Quote',awaiting_payment:'Awaiting payment',paid:'Paid',fulfillment:'Being fulfilled',completed:'Completed',refunded:'Refunded',partially_refunded:'Partially refunded',cancelled:'Cancelled',test_hold:'Test hold',address_hold:'Address hold'};
async function api(method,body){
 const r=await fetch('/api/ops',{method,cache:'no-store',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});
 const data=await r.json();if(!r.ok){const e=new Error(data.error||'The operations view is unavailable.');e.auth=r.status===401;throw e;}return data;
}
function details(values){const dl=node('dl');for(const [label,value] of values){const div=node('div');div.append(node('dt',label),node('dd',value||'Not supplied'));dl.append(div);}return dl;}
function statusSelect(values,current,label){const wrap=node('label',label),select=node('select');for(const value of [...new Set([current,...values])]){const option=node('option',LABEL[value]||value);option.value=value;option.selected=value===current;select.append(option);}wrap.append(select);return {wrap,select};}
function field(label,value){const wrap=node('label',label),input=node('input');input.value=value||'';wrap.append(input);return {wrap,input};}
function row(rec,type){
 const article=node('article');article.append(node('h3',rec.id||rec.key));
 if(rec.livemode===false)article.append(node('p','TEST — DO NOT FULFILL'));
 article.append(node('p',rec.createdAt?new Date(rec.createdAt).toLocaleString():''));
 const error=node('p');error.setAttribute('role','status');
 if(type==='order'){
  const address=rec.shipping?.address||{};const shipping=[rec.shipping?.name,address.line1,address.line2,address.city,address.state,address.postal_code,address.country].filter(Boolean).join(', ');
  article.append(details([['Customer',rec.shipping?.name],['Email',rec.email],['Payment',LABEL[rec.status]||rec.status],['Fulfillment',LABEL[rec.fulfillment]||rec.fulfillment],['Physical sets',rec.totalSets],['Product subtotal',money(rec.amountSubtotal)],['Shipping',money(rec.shippingCents)],['Tax',money(rec.taxCents)],['Total paid',money(rec.amountTotal)],['Shipping address',shipping],['Shipping method',rec.shippingMethod||'Standard shipping (online order)'],['Stripe session',rec.sessionId],['Stripe payment',rec.paymentIntent]]));
  const items=node('ul');for(const item of rec.items||[])items.append(node('li',`${item.sku} · ${item.key} · ${item.packs} pack(s) · ${item.sets} physical sets · ${money(item.unitCents)} per pack`));article.append(items);
  if(rec.holdReason)article.append(node('p',rec.holdReason));
  const flow=statusSelect(['pending','fulfillment','completed'],rec.fulfillment||'pending','Fulfillment status');
  const carrier=field('Carrier',rec.tracking?.carrier),number=field('Tracking number',rec.tracking?.number),url=field('Tracking URL',rec.tracking?.url);url.input.type='url';
  const save=node('button','Save fulfillment details');save.type='button';
  const locked=rec.livemode!==true||!!rec.holdReason||!['paid','fulfillment','completed'].includes(rec.status);
  for(const e of [flow.select,carrier.input,number.input,url.input,save])e.disabled=locked;
  save.addEventListener('click',async()=>{save.disabled=true;error.textContent='Saving…';try{await api('PATCH',{type,id:rec.key||rec.sessionId,status:flow.select.value,tracking:{carrier:carrier.input.value,number:number.input.value,url:url.input.value}});await load();}catch(e){error.textContent=e.message;save.disabled=false;}});
  article.append(flow.wrap,carrier.wrap,number.wrap,url.wrap,save);
  if(rec.livemode===false&&rec.status==='paid'){
   article.append(node('p','Sandbox rehearsal: '+(rec.testWorkflow?.stage||'not started')+' — DO NOT DISPATCH'));
   const rehearsal=node('button',rec.testWorkflow?.stage==='packing'?'Rehearse shipping':'Rehearse packing');rehearsal.type='button';
   rehearsal.addEventListener('click',async()=>{rehearsal.disabled=true;try{await api('PATCH',{type,id:rec.key||rec.sessionId,action:'test_rehearsal',stage:rec.testWorkflow?.stage==='packing'?'shipped':'packing'});await load();}catch(e){error.textContent=e.message;rehearsal.disabled=false;}});article.append(rehearsal);
  }
 }else{
  article.append(details([['Business',rec.business],['Contact',rec.name],['Email',rec.email],['Phone',rec.phone],['Location',rec.location],['Delivery ZIP',rec.zip],['Finish',rec.finish],['Complete sets requested',rec.quantity],['Requested date',rec.date],['Requirements',rec.requirements]]));
  const flow=statusSelect(['inquiry','quote','awaiting_payment','cancelled'],rec.status||'inquiry','Inquiry status');
  flow.select.addEventListener('change',async()=>{flow.select.disabled=true;try{await api('PATCH',{type,id:rec.key||rec.id,status:flow.select.value});rec.status=flow.select.value;error.textContent='Status saved.';}catch(e){flow.select.value=rec.status;error.textContent=e.message;}finally{flow.select.disabled=false;}});article.append(flow.wrap);
  if(['operations','customer'].some(role=>rec.notifications?.[role]?.status!=='accepted')){
   const retry=node('button','Retry inquiry notifications');retry.type='button';retry.addEventListener('click',async()=>{retry.disabled=true;error.textContent='Retrying…';try{await api('PATCH',{type,id:rec.key||rec.id,action:'retry_notifications'});await load();}catch(e){error.textContent=e.message;retry.disabled=false;}});article.append(retry);
  }
 }
 const messages=node('ul');for(const role of ['operations','customer']){const n=rec.notifications?.[role];messages.append(node('li',`${role==='operations'?'Operations':'Customer'} email: ${n?.providerId?'accepted by provider; inbox delivery not verified':n?.status==='failed'?'failed — retry required':'not verified'}${n?.acceptedAt?' · '+new Date(n.acceptedAt).toLocaleString():''}`));}article.append(messages,error);return article;
}
async function load(){
 try{
  const d=await api('GET');$('#ops-auth').hidden=true;$('#ops-app').hidden=false;$('#ops-error').textContent='';
  const inv=$('#ops-inventory');inv.replaceChildren();for(const [k,v] of Object.entries(d.inventory||{})){const div=node('div');div.append(node('dt',k),node('dd',v));inv.append(div);}
  $('#ops-orders').replaceChildren(...(d.orders||[]).map(r=>row(r,'order')));$('#ops-inquiries').replaceChildren(...(d.inquiries||[]).map(r=>row(r,'inquiry')));
  $('#ops-reservations').replaceChildren(...(d.reservations||[]).map(r=>node('li',`${r.key} · ${r.sets} sets · ${r.livemode?'live':'test'} · ${r.expiresAt?'expires '+new Date(r.expiresAt).toLocaleString():'legacy reservation; expiry not recorded'}`)));
 }catch(e){if(e.auth){token='';sessionStorage.removeItem('favroe_ops_token');$('#ops-auth').hidden=false;$('#ops-app').hidden=true;}$('#ops-error').textContent=e.message;$('#ops-auth-error').textContent=e.message;}
}
$('#ops-token-form').addEventListener('submit',e=>{e.preventDefault();token=$('#ops-token').value.trim();sessionStorage.setItem('favroe_ops_token',token);$('#ops-token').value='';load();});
$('#ops-refresh').addEventListener('click',load);
$('#ops-logout').addEventListener('click',()=>{token='';sessionStorage.removeItem('favroe_ops_token');$('#ops-app').hidden=true;$('#ops-auth').hidden=false;$('#ops-orders').replaceChildren();$('#ops-inquiries').replaceChildren();$('#ops-reservations').replaceChildren();$('#ops-inventory').replaceChildren();});
if(token)load();
