'use strict';
const $=(s)=>document.querySelector(s);
const menu=$('.menu-toggle'),nav=$('#navigation');
menu?.addEventListener('click',()=>{const open=menu.getAttribute('aria-expanded')!=='true';menu.setAttribute('aria-expanded',String(open));nav.classList.toggle('open',open);});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&nav?.classList.contains('open')){menu.setAttribute('aria-expanded','false');nav.classList.remove('open');menu.focus();}});
const picker=$('#pack-picker');
picker?.addEventListener('change',()=>{const option=picker.selectedOptions[0];$('#pack-summary').textContent=`${picker.value} pink tin sets · $${Number(option.dataset.price).toFixed(2)} USD`;$('#pack-inquiry').href='/bulk?quantity='+picker.value;});
const labels={finish:'Tin finish',business:'Business',name:'Contact',email:'Email',phone:'Phone',location:'Business location',quantity:'Complete sets',zip:'Delivery ZIP',date:'Requested date',requirements:'Requirements'};
function addRows(dl,data){dl.replaceChildren();for(const [key,label] of Object.entries(labels)){if(!data[key])continue;const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=String(data[key]);row.append(dt,dd);dl.append(row);}}
const form=$('#inquiry-form');
if(form){
 let draft=null,key=null;
 const qty=new URLSearchParams(location.search).get('quantity');if(qty&&/^\d+$/.test(qty)&&Number(qty)<=1000000&&Number(qty)>0)form.elements.quantity.value=qty;
 const params=new URLSearchParams(location.search);if(['pink','aluminum'].includes(params.get('finish')))form.elements.finish.value=params.get('finish');if(params.get('customization')==='1')form.elements.requirements.value='I am interested in a custom sleeve and presentation package. Please confirm design scope, printed quantity, production costs and timing.';
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());form.elements.date.min=today;
 form.addEventListener('submit',e=>{e.preventDefault();if(!form.reportValidity())return;$('#form-error').textContent='';draft=Object.fromEntries(new FormData(form));draft.quantity=Number(draft.quantity);key=crypto.randomUUID();addRows($('#inquiry-summary'),draft);const price={50:19.99,100:34.99,200:64.99,400:119.99}[draft.quantity];$('#quote-summary').textContent=price?`Listed product subtotal: $${price.toFixed(2)} USD. Shipping/delivery and applicable tax are separate. Availability requires confirmation.`:'Custom quantity: a written quotation and availability confirmation would be required.';$('#form-fields').hidden=true;$('#confirmation').hidden=false;$('#confirmation').setAttribute('tabindex','-1');$('#confirmation').focus();});
 $('#edit-inquiry').addEventListener('click',()=>{$('#confirmation').hidden=true;$('#form-fields').hidden=false;form.elements.business.focus();});
 $('#save-inquiry').addEventListener('click',async()=>{const button=$('#save-inquiry');button.disabled=true;$('#form-error').textContent='';try{const response=await fetch('/api/inquiries',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(draft)});const result=await response.json();if(!response.ok)throw new Error(result.error||'The inquiry could not be sent. Please try again.');form.hidden=true;$('#success').hidden=false;$('#success-reference').textContent=`Reference ${result.id}.`;$('#success').focus();form.reset();draft=null;key=null;}catch(error){$('#form-error').textContent=error.message;}finally{button.disabled=false;}});
}
// One intentional interaction: explore each piece without losing the buying path.
const detailButtons=[...document.querySelectorAll('[data-detail]')];
detailButtons.forEach(button=>button.addEventListener('click',()=>{
 detailButtons.forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
 document.querySelectorAll('[data-detail-panel]').forEach(panel=>{panel.hidden=panel.dataset.detailPanel!==button.dataset.detail;});
}));
