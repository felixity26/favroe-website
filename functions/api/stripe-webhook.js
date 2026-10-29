// Stripe webhook: signature-verified, idempotent. One paid order per checkout session.
import {bind,orders,events,reservations} from '../_lib/store.js';
const SKU={50:'FAV-D50',100:'FAV-S100',200:'FAV-W200',400:'FAV-V400'};
async function stripe(path,env){
  const r=await fetch('https://api.stripe.com/v1/'+path,{headers:{Authorization:'Bearer '+env.STRIPE_SECRET_KEY}});
  const d=await r.json();
  if(!r.ok)throw new Error('stripe');
  return d;
}
async function verifySignature(rawBody,header,secret){
  if(!header)return false;
  const parts=Object.fromEntries(header.split(',').map(p=>{const i=p.indexOf('=');return [p.slice(0,i),p.slice(i+1)];}));
  const t=parts.t,sig=parts.v1;
  if(!t||!sig)return false;
  if(Math.abs(Date.now()/1000-Number(t))>300)return false;
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const mac=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(t+'.'+rawBody));
  const hex=[...new Uint8Array(mac)].map(b=>b.toString(16).padStart(2,'0')).join('');
  if(hex.length!==sig.length)return false;
  let diff=0;for(let i=0;i<hex.length;i++)diff|=hex.charCodeAt(i)^sig.charCodeAt(i);
  return diff===0;
}
const json=(status,obj)=>new Response(JSON.stringify(obj),{status,headers:{'Content-Type':'application/json'}});
export async function onRequestPost({request,env}){
  bind(env);
  if(!env.STRIPE_WEBHOOK_SECRET||!env.STRIPE_SECRET_KEY)return json(503,{error:'Webhook is not configured.'});
  const raw=await request.text();
  const ok=await verifySignature(raw,request.headers.get('stripe-signature'),env.STRIPE_WEBHOOK_SECRET);
  if(!ok)return json(400,{error:'Invalid signature.'});
  let event;try{event=JSON.parse(raw);}catch{return json(400,{error:'Bad payload.'});}
  const seen=await events().get(event.id,{type:'json'});
  if(seen)return json(200,{received:true,duplicate:true});
  try{
    if(event.type==='checkout.session.completed'){
      const s=event.data.object;
      if(s.metadata?.brand==='FAVROE'&&s.payment_status==='paid'){
        const full=await stripe('checkout/sessions/'+s.id+'?expand[]=line_items',env);
        const items=(full.line_items?.data||[]).map(li=>{
          const key=li.price?.metadata?.favroe_sku||'';
          const sets=Number(key.split('-')[1]||0)*li.quantity;
          return {sku:SKU[key.split('-')[1]]||key,key,packs:li.quantity,sets,unitCents:li.price?.unit_amount};
        }).filter(it=>it.sets>0);
        const totalSets=items.reduce((a,it)=>a+it.sets,0);
        const order={
          id:'FAV-'+s.id.slice(-12),sessionId:s.id,paymentIntent:String(s.payment_intent||''),
          items,totalSets,amountTotal:s.amount_total,currency:s.currency,
          email:s.customer_details?.email||'',shipping:s.collected_information?.shipping_details||null,
          status:'paid',fulfillment:'pending',livemode:!!s.livemode,createdAt:new Date().toISOString()
        };
        const existing=await orders().get(s.id,{type:'json'});
        if(!existing)await orders().setJSON(s.id,order);
        if(s.client_reference_id)await reservations().delete(s.client_reference_id).catch(()=>{});
      }
    }else if(event.type==='checkout.session.expired'||event.type==='checkout.session.async_payment_failed'){
      const s=event.data.object;
      if(s.client_reference_id)await reservations().delete(s.client_reference_id).catch(()=>{});
    }else if(event.type==='charge.refunded'){
      const c=event.data.object;
      const allOrders=await orders().list();
      for(const {key} of allOrders.blobs){
        const o=await orders().get(key,{type:'json'});
        if(o&&o.paymentIntent===c.payment_intent){o.status='refunded';o.refundedAt=new Date().toISOString();await orders().setJSON(key,o);}
      }
    }
    await events().setJSON(event.id,{processedAt:new Date().toISOString(),type:event.type});
    return json(200,{received:true});
  }catch(e){
    return json(500,{error:'Processing failed. Stripe will retry.'});
  }
}
export const onRequestGet=()=>json(405,{error:'POST required.'});
