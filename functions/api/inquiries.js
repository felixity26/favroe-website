// Wholesale inquiry intake: validation, honeypot, duplicate windows, KV store,
// email to founder + customer ack via Resend HTTP API.
import {stores} from '../_lib/store.js';
import {notifyInquiry} from '../_lib/inquiry-notifications.js';
const json=(status,obj)=>new Response(JSON.stringify(obj),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const clean=(v,max)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,max);
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
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
  const id='INQ-'+idem.toUpperCase();
  const fingerprint=await sha256(JSON.stringify(f));
  const dupeKey='dupe-'+fingerprint;
  try{
    let record=await inquiries.get(id,{type:'json'});
    if(record&&record.fingerprint!==fingerprint)return json(409,{error:'This reference belongs to different inquiry details. Review the form and submit again.'});
    if(!record){
      const seen=await inquiries.get(dupeKey,{type:'json'});
      if(seen&&Date.now()-Date.parse(seen.at)<600000)record=await inquiries.get(seen.ref,{type:'json'});
    }
    const duplicate=!!record;
    if(!record){
      record={id,...f,fingerprint,status:'inquiry',livemode:env.FAVROE_PAYMENT_MODE==='live',createdAt:new Date().toISOString()};
      await inquiries.setJSON(id,record);
      await inquiries.setJSON(dupeKey,{ref:id,at:record.createdAt},{expirationTtl:600});
    }
    const notifications=await notifyInquiry(record,env);
    return json(200,{received:true,id:record.id,duplicate,emailed:notifications.operations.status==='accepted',acked:notifications.customer.status==='accepted'});
  }catch{return json(503,{error:'We could not finish confirming this inquiry. Please retry with the same submission reference.'});}
}
export const onRequestGet=handleGet;
export const onRequestPost=handlePost;
