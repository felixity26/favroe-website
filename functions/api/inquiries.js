// Wholesale inquiry intake: validation, honeypot, duplicate windows, KV store,
// email to founder + customer ack via Resend HTTP API.
import {bind,inquiries} from '../_lib/store.js';
const json=(status,obj)=>new Response(JSON.stringify(obj),{status,headers:{'Content-Type':'application/json'}});
const clean=(v,max)=>String(v??'').replace(/[-]/g,'').trim().slice(0,max);
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
async function sendMail(env,{to,subject,text,replyTo}){
  const r=await fetch('https://api.resend.com/emails',{method:'POST',
    headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({from:env.RESEND_FROM||'FAVROE <onboarding@resend.dev>',to:[to],subject,text,reply_to:replyTo?[replyTo]:undefined})});
  if(!r.ok)throw new Error('resend '+r.status);
}
async function sha256(text){
  const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
  return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
async function handleGet({request,env}){
  bind(env);
  const tok=env.FAVROE_OPS_TOKEN||'';
  if(!tok||(request.headers.get('authorization')||'')!=='Bearer '+tok)return json(401,{error:'Not authorized.'});
  try{
    const l=await inquiries().list();const items=[];
    for(const {key} of l.blobs){
      if(key.startsWith('dupe-')||key.startsWith('idem-'))continue;
      const v=await inquiries().get(key,{type:'json'});if(v)items.push(v);
    }
    items.sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
    return json(200,{items});
  }catch{return json(503,{error:'The inbox is unavailable.'});}
}
async function handlePost({request,env}){
  bind(env);
  let data;try{data=await request.json();}catch{return json(400,{error:'Something was off with that. Please try again.'});}
  if(clean(data.website,200))return json(200,{received:true});
  const f={
    finish:/^(pink|aluminum)$/.test(data.finish)?data.finish:'pink',
    business:clean(data.business,120),name:clean(data.name,100),
    email:clean(data.email,254).toLowerCase(),phone:clean(data.phone,40),
    location:clean(data.location,120),
    quantity:Number.isSafeInteger(Number(data.quantity))?Math.min(Math.max(1,Number(data.quantity)),1000000):0,
    zip:clean(data.zip,10),date:clean(data.date,10),requirements:clean(data.requirements,2000)
  };
  if(!f.business||!f.name||!EMAIL.test(f.email)||!f.location||!f.quantity||!/^\d{5}(-\d{4})?$/.test(f.zip))
    return json(400,{error:'Please complete the required fields (business, contact, a valid email, location, quantity, ZIP).'});
  const idem=clean(request.headers.get('idempotency-key'),64);
  const keys=[];
  if(/^[a-f0-9-]{36}$/i.test(idem))keys.push('idem-'+idem);
  const bucket=Math.floor(Date.now()/600000);
  keys.push('dupe-'+await sha256([f.email,f.business,f.quantity,f.zip,f.requirements,bucket].join('|')));
  for(const k of keys){
    const seen=await inquiries().get(k,{type:'json'});
    if(seen)return json(200,{received:true,duplicate:true,id:seen.ref});
  }
  const id='INQ-'+Date.now().toString(36).toUpperCase()+Math.random().toString(36).slice(2,6).toUpperCase();
  const record={id,...f,status:'inquiry',livemode:env.FAVROE_PAYMENT_MODE==='live',createdAt:new Date().toISOString()};
  let emailed=false,acked=false;
  try{
    await inquiries().setJSON(id,record);
    for(const k of keys)await inquiries().setJSON(k,{ref:id,at:record.createdAt});
  }catch{return json(503,{error:'The inquiry could not be saved. Please try again.'});}
  const lines=[`New wholesale inquiry ${id}`,`Business: ${f.business}`,`Contact: ${f.name} <${f.email}>${f.phone?' '+f.phone:''}`,`Location: ${f.location} ${f.zip}`,`Quantity: ${f.quantity} sets`,`Finish: ${f.finish}`,`Requested date: ${f.date||'-'}`,'',f.requirements||'(no requirements given)'].join('\n');
  try{await sendMail(env,{to:env.FAVROE_NOTIFY_EMAIL,subject:`FAVRŒ inquiry ${id} - ${f.business}`,text:lines,replyTo:f.email});emailed=true;}catch{}
  try{await sendMail(env,{to:f.email,subject:`Your FAVRŒ inquiry (${id})`,text:`Thank you, ${f.name}.\n\nWe have received your inquiry for ${f.quantity} sets and will reply from essentials@favroe.com.\n\nReference: ${id}\n\nFAVRŒ - Objects for Presentation.`});acked=true;}catch{}
  return json(200,{received:true,id,emailed,acked});
}
export const onRequestGet=handleGet;
export const onRequestPost=handlePost;
