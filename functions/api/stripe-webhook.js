import {recordPaidOrder,releaseReservation} from '../_lib/inventory.js';
import {stores} from '../_lib/store.js';
import {orderFromSession} from '../_lib/order.js';
import {notifyOrder} from '../_lib/notifications.js';
const json=(status,obj)=>new Response(JSON.stringify(obj),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
export async function verifySignature(raw,header,secret){
 const parts=(header||'').split(',').map(p=>p.trim().split('='));
 const timestamp=parts.find(([k])=>k==='t')?.[1];
 const signatures=parts.filter(([k])=>k==='v1').map(([,v])=>v);
 if(!/^\d+$/.test(timestamp||'')||Math.abs(Date.now()/1000-Number(timestamp))>300)return false;
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 for(const sig of signatures){if(!/^[a-f0-9]{64}$/.test(sig||''))continue;const bytes=new Uint8Array(sig.match(/../g).map(x=>parseInt(x,16)));if(await crypto.subtle.verify('HMAC',key,bytes,new TextEncoder().encode(timestamp+'.'+raw)))return true;}
 return false;
}
async function stripe(path,env){const r=await fetch('https://api.stripe.com/v1/'+path,{headers:{Authorization:'Bearer '+env.STRIPE_SECRET_KEY},signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error('Stripe lookup failed');return r.json();}
export async function onRequestPost({request,env}){
 if(!env.STRIPE_WEBHOOK_SECRET||!env.STRIPE_SECRET_KEY)return json(503,{error:'Webhook is not configured.'});
 const raw=await request.text();
 if(!await verifySignature(raw,request.headers.get('stripe-signature'),env.STRIPE_WEBHOOK_SECRET))return json(400,{error:'Invalid signature.'});
 let event;try{event=JSON.parse(raw);}catch{return json(400,{error:'Bad payload.'});}
 if(!/^evt_[A-Za-z0-9]+$/.test(event.id||''))return json(400,{error:'Bad event reference.'});
 if(event.livemode!==(env.FAVROE_PAYMENT_MODE==='live')||!env.STRIPE_SECRET_KEY.startsWith('sk_'+env.FAVROE_PAYMENT_MODE+'_'))return json(400,{error:'Payment mode mismatch.'});
 const {orders,events,reservations}=stores(env);
 try{
  if(await events.get(event.id,{type:'json'}))return json(200,{received:true,duplicate:true});
  const s=event.data?.object;
  if(['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type)){
   if(s?.metadata?.brand==='FAVROE'){
    const full=await stripe('checkout/sessions/'+encodeURIComponent(s.id)+'?expand[]=line_items&expand[]=customer',env);
    const order=orderFromSession(full,env);
    if(order){
     const existing=env.INVENTORY_DB?await recordPaidOrder(env,order,full.client_reference_id):await orders.get(order.sessionId,{type:'json'});
     if(!existing)await orders.setJSON(order.sessionId,order);
     if(full.client_reference_id)await reservations.delete(full.client_reference_id);
     // Keep the event retryable if notification delivery to the provider fails.
     await notifyOrder(existing||order,env);
    }
   }
  }else if(['checkout.session.expired','checkout.session.async_payment_failed'].includes(event.type)){
   if(s?.metadata?.brand==='FAVROE'&&s.client_reference_id){if(env.INVENTORY_DB)await releaseReservation(env,s.client_reference_id,s.id);await reservations.delete(s.client_reference_id);}
  }else if(event.type==='charge.refunded'){
   // Retrieve latest refund totals: events can arrive out of order.
   const charge=await stripe('charges/'+encodeURIComponent(s.id),env);
   for(const {key} of (await orders.list()).blobs){const order=await orders.get(key,{type:'json'});if(order?.paymentIntent===charge.payment_intent&&order.livemode===event.livemode){order.status=charge.refunded||charge.amount_refunded>=charge.amount?'refunded':'partially_refunded';order.amountRefunded=charge.amount_refunded;order.refundedAt=new Date().toISOString();if(orders.patch)await orders.patch(key,{status:order.status,amountRefunded:order.amountRefunded,refundedAt:order.refundedAt});else await orders.setJSON(key,order);}}
  }
  await events.setJSON(event.id,{processedAt:new Date().toISOString(),type:event.type});
  return json(200,{received:true});
 }catch{return json(500,{error:'Processing failed. Stripe will retry.'});}
}
export const onRequestGet=()=>json(405,{error:'POST required.'});
