import {stores} from './store.js';

const marker=(id,role)=>`inquiry-mail-${id}-${role}`;
export async function inquiryNotificationStatus(id,env){
 const {events}=stores(env);
 const result={};
 for(const role of ['operations','customer'])result[role]=await events.get(marker(id,role),{type:'json'})||{status:'pending'};
 return result;
}

// Saved inquiry is authoritative. Failed notifications stay visible and can be
// retried from /ops or by retrying the same submission. No automatic retry job.
export async function notifyInquiry(record,env){
 const {events}=stores(env);
 for(const role of ['operations','customer']){
  const key=marker(record.id,role),previous=await events.get(key,{type:'json'});
  if(previous?.status==='accepted')continue;
  const test=record.livemode?'':'TEST — ';
  const lines=[`${test}New inquiry ${record.id}`,`Business: ${record.business}`,`Contact: ${record.name} <${record.email}>`,
   `Phone: ${record.phone||'Not supplied'}`,`Location: ${record.location}`,`Delivery ZIP: ${record.zip}`,`Quantity: ${record.quantity} complete sets`,
   `Finish: ${record.finish}`,`Requested date: ${record.date||'Not supplied'}`,record.requirements||'',`Manage this inquiry: ${env.FAVROE_PUBLIC_ORIGIN}/ops/`];
  const to=role==='operations'?env.FAVROE_NOTIFY_EMAIL:record.email;
  const subject=test+(role==='operations'?`FAVRŒ inquiry ${record.id}`:`Your FAVRŒ inquiry (${record.id})`);
  const text=role==='operations'?lines.join('\n'):`Thank you, ${record.name}.\n\nWe have received your inquiry for ${record.quantity} sets. We will reply from essentials@favroe.com.\n\nReference: ${record.id}\n${record.livemode?'':'This submission was made while the website is in test mode.\n'}\nFAVRŒ — Objects for Presentation.`;
  try{
   if(!env.RESEND_API_KEY||!env.RESEND_FROM||!to)throw new Error('Not configured');
   const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':key},
    body:JSON.stringify({from:env.RESEND_FROM,to:[to],subject,text,reply_to:role==='operations'?[record.email]:[env.FAVROE_NOTIFY_EMAIL]}),signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw new Error('Provider rejected');
   const result=await response.json();
   if(!result.id)throw new Error('Missing provider reference');
   await events.setJSON(key,{status:'accepted',providerId:result.id,acceptedAt:new Date().toISOString()});
  }catch{
   await events.setJSON(key,{status:'failed',lastAttemptAt:new Date().toISOString(),message:'Email delivery to the provider failed. Check sender configuration, then retry.'});
  }
 }
 return inquiryNotificationStatus(record.id,env);
}
