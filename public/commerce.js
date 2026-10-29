'use strict';
(()=>{
 const config=window.FAVROE_COMMERCE,core=window.FavroeCart;if(!config||!core)return;
 const root=new URL('.',document.currentScript.src),route=(path)=>new URL(path,root).href;
 const money=cents=>new Intl.NumberFormat('en-US',{style:'currency',currency:config.currency}).format(cents/100);
 const key='favroe-shopping-bag-v1';let cart=[];
 try{cart=core.normalize(config,JSON.parse(localStorage.getItem(key)||'[]'));}catch{}
 if(location.protocol==='file:'){try{const carried=new URLSearchParams(location.search).get('bag');if(carried)cart=core.normalize(config,JSON.parse(carried));}catch{}document.addEventListener('click',e=>{const a=e.target.closest('a[href]');if(!a)return;const u=new URL(a.href);if(u.protocol==='file:'&&u.pathname.endsWith('.html')){u.searchParams.set('bag',JSON.stringify(cart));a.href=u.href;}});}
 function save(){try{localStorage.setItem(key,JSON.stringify(cart));}catch{const el=document.querySelector('#cart-status');if(el)el.textContent='Browser storage is unavailable. Your bag will last only while this page stays open.';}document.querySelectorAll('[data-cart-count]').forEach(el=>el.textContent=core.totals(config,cart).packs);}
 function add(key,quantity){cart=core.normalize(config,[...cart,{key,quantity}]);save();}
 save();
 const finishInputs=[...document.querySelectorAll('input[name="shop-finish"]')],pack=document.querySelector('#shop-pack');
 if(pack){
  const params=new URLSearchParams(location.search);const initial=params.get('finish');
  if(initial&&config.finishes[initial]?.selectable)finishInputs.find(i=>i.value===initial).checked=true;
  if(config.packs.some(p=>String(p.sets)===params.get('quantity')))pack.value=params.get('quantity');
  const count=document.querySelector('#shop-packs'),message=document.querySelector('#shop-status');
  function selected(){return finishInputs.find(i=>i.checked)?.value||'pink';}
  function render(){
   const finish=selected(),f=config.finishes[finish],p=config.packs.find(p=>p.sets===Number(pack.value));
   document.querySelector('#shop-image').src=route(f.image);document.querySelector('#shop-image').alt=`${f.label} container set with fitted lid and individually wrapped pink shovel spoon.`;
   finishInputs.forEach(i=>{i.disabled=false;i.closest('label').classList.toggle('selected',i.checked);});
   const qty=Number(count.value),valid=Number.isSafeInteger(qty)&&qty>=1&&qty<=20;
   document.querySelector('#shop-total').textContent=valid?`${p.sets*qty} ${f.label.toLowerCase()} sets · ${money(p.cents*qty)} USD`:'Choose between 1 and 20 packs.';
   document.querySelector('#shop-add').disabled=!valid||!f.selectable;document.querySelector('#shop-add').textContent=f.selectable?'Add to bag +':'Aluminum · Coming soon';
   message.textContent='';
  }
  finishInputs.forEach(i=>i.addEventListener('change',render));pack.addEventListener('change',render);count.addEventListener('input',render);
  document.querySelector('#shop-add').addEventListener('click',()=>{const qty=Number(count.value),finish=selected();if(!Number.isInteger(qty)||qty<1||qty>20||!config.finishes[finish].selectable)return;add(`${finish}-${pack.value}`,qty);message.textContent=`${config.finishes[finish].label} · ${pack.value}-set pack added to your bag. Review your bag to continue.`;});
  render();
 }
 const paymentStatus=document.querySelector('#payment-status');
 if(paymentStatus){
  const id=new URLSearchParams(location.search).get('session_id');
  if(!id||location.protocol==='file:')paymentStatus.textContent='No payment has been verified on this preview.';
  else fetch(route('api/payment-status?session_id='+encodeURIComponent(id))).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error||'Unable to verify payment.');if(d.paid){cart=[];save();}paymentStatus.textContent=d.paid?'Payment confirmed by Stripe. Keep your Stripe receipt; fulfillment is handled separately.':'Payment is not confirmed yet. Please check your Stripe receipt or contact the seller before paying again.';}).catch(()=>paymentStatus.textContent='We could not verify your payment here. Check your Stripe receipt before trying again.');
 }
 const rows=document.querySelector('#cart-items');
 if(rows){
  const status=document.querySelector('#cart-status'),checkout=document.querySelector('#cart-checkout'),stateEl=document.querySelector('#cart-state');
  function render(){
   rows.replaceChildren();
   for(const line of cart){
    const p=core.item(config,line.key),article=document.createElement('article');article.className='bag-item';
    const img=document.createElement('img');img.src=route(p.finish.image);img.alt=`${p.finish.label} container set`;img.width=240;img.height=160;
    const body=document.createElement('div'),title=document.createElement('h2'),detail=document.createElement('p'),label=document.createElement('label'),input=document.createElement('input'),remove=document.createElement('button');
    title.textContent=`${p.finish.label} · ${p.pack.name}${p.finish.selectable?'':' · Unavailable — remove to continue'}`;detail.textContent=`${p.pack.sets} sets per pack · ${money(p.pack.cents)} per pack`;
    label.textContent='Packs';input.type='number';input.min=1;input.max=20;input.step=1;input.value=line.quantity;input.setAttribute('aria-label',`Packs of ${p.finish.label} ${p.pack.name}`);
    input.addEventListener('change',()=>{const q=Number(input.value);if(!Number.isSafeInteger(q)||q<1||q>20){input.value=line.quantity;status.textContent='Choose a whole number from 1 to 20 packs.';return;}line.quantity=q;save();render();});label.append(input);
    remove.type='button';remove.className='text-button';remove.textContent='Remove';remove.setAttribute('aria-label',`Remove ${p.finish.label} ${p.pack.name}`);remove.addEventListener('click',()=>{cart=cart.filter(i=>i.key!==line.key);save();render();});
    body.append(title,detail,label,remove);const price=document.createElement('strong');price.textContent=money(p.pack.cents*line.quantity);article.append(img,body,price);rows.append(article);
   }
   const total=core.totals(config,cart);document.querySelector('#bag-empty').hidden=cart.length>0;document.querySelector('#bag-summary').hidden=!cart.length;
   document.querySelector('#bag-subtotal').textContent=money(total.cents);document.querySelector('#bag-count').textContent=`${total.sets} complete sets · ${total.packs} ${total.packs===1?'pack':'packs'}`;
   const result=core.checkout(config,cart);const noState=stateEl&&!stateEl.value;checkout.disabled=!!result.error||noState;checkout.textContent=config.checkout.enabled?'Continue to secure checkout':'Checkout connection pending';status.textContent=result.error||(noState?'Choose your shipping state to continue. We ship within the continental United States.':'Shipping, applicable tax and final payment totals are shown on Stripe’s checkout page.');
  }
  stateEl?.addEventListener('change',render);
  checkout.addEventListener('click',async()=>{const result=core.checkout(config,cart);if(result.error){status.textContent=result.error;return;}if(stateEl&&!stateEl.value){status.textContent='Choose your shipping state to continue.';return;}if(location.protocol==='file:'){status.textContent='Stripe checkout requires the hosted website. No payment was started.';return;}
   checkout.disabled=true;status.textContent='Opening secure Stripe checkout…';
   try{const response=await fetch(route(config.checkout.endpoint),{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({lines:result.lines,state:stateEl?stateEl.value:''})});const data=await response.json();if(!response.ok)throw new Error(data.error||'Checkout could not be opened.');const target=new URL(data.url);if(target.protocol!=='https:'||target.hostname!=='checkout.stripe.com')throw new Error('The payment destination could not be verified.');location.assign(target.href);}catch(e){status.textContent=e.message;checkout.disabled=false;}
  });render();
 }
})();
