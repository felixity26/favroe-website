// Wholesale inquiry intake: validation, honeypot, duplicate windows, KV store,
// email to founder + customer ack via Resend HTTP API.
import {stores} from '../_lib/store.js';
const json=(status,obj)=>new Response(JSON.stringify(obj),{status,headers:{'Content-Type':'application/json'}});
const clean=(v,max)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,max);
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
async function sendMail(env,{to,subject,text,replyTo}){
  if(!env.RESEND_API_KEY||!env.RESEND_FROM||!to)throw new Error('Email configuration missing');
  const r=await fetch('https://api.resend.com/emails',{method:'POST',
    headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':await sha256(to+'|'+subject)},
    body:JSON.stringify({from:env.RESEND_FROM,to:[to],subject,text,reply_to:replyTo?[replyTo]:undefined})});
  if(!r.ok)throw new Error('resend '+r.status);
}
async function sha256(text){
  const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
  return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
async function handleGet({request,env}){
  const {inquiries}=stores(env);
  const tok=env.FAVROE_OPS_TOKEN||'';
  if(!tok||(request.headers.get('authorization')||'')!=='Bearer '+tok)return json(401,{error:'Not authorized.'});
  try{
    const l=await inquiries.list();const items=[];
    for(const {key} of l.blobs){
      if(key.startsWith('dupe-')||key.startsWith('idem-'))continue;
      const v=await inquiries.get(key,{type:'json'});if(v)items.push(v);
    }
    items.sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
    return json(200,{items});
  }catch{return json(503,{error:'The inbox is unavailable.'});}
}
async function handlePost({request,env}){
  const {inquiries}=stores(env);
  if(request.headers.get('origin')!==env.FAVROE_PUBLIC_ORIGIN)return json(403,{error:'Use the website inquiry form.'});
  if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')||''))return json(415,{error:'JSON required.'});
  let data;try{const reader=request.body?.getReader();if(!reader)throw new Error('Missing body');let text='',size=0;const decoder=new TextDecoder();while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>16384){await reader.cancel();return json(413,{error:'Inquiry too large.'});}text+=decoder.decode(value,{stream:true});}data=JSON.parse(text+decoder.decode());if(!data||typeof data!=='object')throw new Error('Invalid body');}catch{return json(400,{error:'Something was off with that. Please try again.'});}
  if(clean(data.website,200))return json(200,{received:true});
  const f={
    finish:/^(pink|aluminum)$/.test(data.finish)?data.finish:'pink',
    business:clean(data.business,120),name:clean(data.name,100),
    email:clean(data.email,254).toLowerCase(),phone:clean(data.phone,40),
    location:clean(data.location,120),
    quantity:Number.isSafeInteger(Number(data.quantity))&&Number(data.quantity)>0&&Number(data.quantity)<=1000000?Number(data.quantity):0,
    zip:clean(data.zip,10),date:clean(data.date,10),requirements:clean(data.requirements,2000)
  };
  if(!/^(pink|aluminum)$/.test(data.finish)||f.date&&(!/^\d{4}-\d{2}-\d{2}$/.test(f.date)||Number.isNaN(Date.parse(f.date))))return json(400,{error:'Check the finish and requested date.'});
  if(!f.business||!f.name||!EMAIL.test(f.email)||!f.location||!f.quantity||!/^\d{5}(-\d{4})?$/.test(f.zip))
    return json(400,{error:'Please complete the required fields (business, contact, a valid email, location, quantity, ZIP).'});
  const idem=clean(request.headers.get('idempotency-key'),64);
  if(!/^[a-f0-9-]{36}$/i.test(idem))return json(400,{error:'Refresh the inquiry form and try again.'});
  const keys=[];
  if(/^[a-f0-9-]{36}$/i.test(idem))keys.push('idem-'+idem);
  const bucket=Math.floor(Date.now()/600000);
  keys.push('dupe-'+await sha256([f.email,f.business,f.quantity,f.zip,f.requirements,bucket].join('|')));
  for(const k of keys){
    const seen=await inquiries.get(k,{type:'json'});
    if(seen)return json(200,{received:true,duplicate:true,id:seen.ref});
  }
  const id='INQ-'+crypto.randomUUID().toUpperCase();
  const record={id,...f,status:'inquiry',livemode:env.FAVROE_PAYMENT_MODE==='live',createdAt:new Date().toISOString()};
  let emailed=false,acked=false;
  try{
    await inquiries.setJSON(id,record);
    for(const k of keys)await inquiries.setJSON(k,{ref:id,at:record.createdAt});
  }catch{return json(503,{error:'The inquiry could not be saved. Please try again.'});}
  const lines=[`New wholesale inquiry ${id}`,`Business: ${f.business}`,`Contact: ${f.name} <${f.email}>${f.phone?' '+f.phone:''}`,`Location: ${f.location} ${f.zip}`,`Quantity: ${f.quantity} sets`,`Finish: ${f.finish}`,`Requested date: ${f.date||'-'}`,'',f.requirements||'(no requirements given)'].join('\n');
  try{await sendMail(env,{to:env.FAVROE_NOTIFY_EMAIL,subject:`FAVRŒ inquiry ${id} - ${f.business}`,text:lines,replyTo:f.email});emailed=true;}catch{}
  try{await sendMail(env,{to:f.email,subject:`Your FAVRŒ inquiry (${id})`,text:`Thank you, ${f.name}.\n\nWe have received your inquiry for ${f.quantity} sets and will reply from essentials@favroe.com.\n\nReference: ${id}\n\nFAVRŒ - Objects for Presentation.`});acked=true;}catch{}
  return json(200,{received:true,id,emailed,acked});
}
export const onRequestGet=handleGet;
export const onRequestPost=handlePost;
