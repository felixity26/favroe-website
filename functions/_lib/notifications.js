import {stores} from './store.js';
// Durable sent markers + provider idempotency protect webhook retries.
// API acceptance is not proof of inbox delivery; verify provider delivery events.
export async function notifyOrder(order,env){
 if(!env.RESEND_API_KEY||!env.RESEND_FROM||!env.FAVROE_NOTIFY_EMAIL||!order.email)throw new Error('Order notifications not configured');
 const {events}=stores(env);
 for(const role of ['operations','customer']){
  const key='mail-'+order.sessionId+'-'+role;
  if(await events.get(key,{type:'json'}))continue;
  const test=order.livemode?'':'TEST — DO NOT FULFILL — ';
  const message=role==='operations'?`Payment recorded for ${order.id}.\n${order.totalSets} sets.\nFulfillment: ${order.fulfillment}.\n${order.holdReason||''}\nReview the order in the operations dashboard before fulfillment.`:`Your payment has been recorded.\n\nReference: ${order.id}\n${order.totalSets} complete sets.\n${!order.livemode?'This is a sandbox test transaction. It will not be fulfilled.':order.fulfillment==='address_hold'?'Your delivery address needs review. Please contact essentials@favroe.com.':'We will contact you with fulfillment details.'}\n\nFAVRŒ — Objects for Presentation.`;
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify({from:env.RESEND_FROM,to:[role==='operations'?env.FAVROE_NOTIFY_EMAIL:order.email],subject:test+'FAVRŒ order '+order.id,text:message}),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error('Email provider rejected notification');
  const result=await response.json();
  await events.setJSON(key,{providerId:result.id,acceptedAt:new Date().toISOString()});
 }
}
