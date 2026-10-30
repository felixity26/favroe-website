// Newsletter-only storage and Resend operations. No order/inventory imports.
export const CONSENT_VERSION='2026-10-30-v1';
export const CONSENT_TEXT='By signing up, you agree to receive FAVRŒ product updates and brand news by email.';
const GENERIC='Please check your inbox for a confirmation link. If you have requested one recently, use that email. Nothing is subscribed until you confirm.';
const ORIGIN='https://favroe.com';
export const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),v=>v.toString(16).padStart(2,'0')).join('');
const randomToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
const problem=(message,status)=>Object.assign(new Error(message),{status});
const dbq=(env,sql,...args)=>env.NEWSLETTER_DB.prepare(sql).bind(...args);
const now=()=>Math.floor(Date.now()/1000);
function configured(env){if(env.FAVROE_NEWSLETTER_ENABLED!=='true'||!env.NEWSLETTER_DB||!env.RESEND_API_KEY||!env.RESEND_NEWSLETTER_SEGMENT_ID||!env.RESEND_NEWSLETTER_TOPIC_ID)throw problem('Newsletter signup is temporarily unavailable. Please try again later.',503);}
async function body(request){
 if(request.headers.get('Origin')!==ORIGIN)throw problem('Please submit this form from favroe.com.',403);
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))throw problem('Unsupported request.',415);
 const reader=request.body?.getReader();if(!reader)throw problem('Please complete the form.',400);
 let chunks=[],size=0;for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>4096){await reader.cancel();throw problem('Request is too large.',413);}chunks.push(value);}
 try{const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}const data=JSON.parse(new TextDecoder().decode(bytes));if(!data||Array.isArray(data)||typeof data!=='object')throw 0;return data;}catch{throw problem('Please complete the form.',400);}
}
async function limit(env,key,max,expires){
 const row=await dbq(env,`INSERT INTO newsletter_limits(key,count,expires_at) VALUES(?,1,?)
 ON CONFLICT(key) DO UPDATE SET count=newsletter_limits.count+1 WHERE newsletter_limits.count < ? RETURNING count`,key,expires,max).first();
 if(!row)throw problem('Please try again later. We are keeping the inbox considered, too.',429);
}
export async function resend(env,path,method='GET',payload,key){
 for(let attempt=0;attempt<3;attempt++){
  let response;try{response=await fetch('https://api.resend.com'+path,{method,headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})},body:payload?JSON.stringify(payload):undefined,signal:AbortSignal.timeout(10000)});}catch{throw problem('We could not reach the email service. Please try again shortly.',503);}
  if(response.status===429&&attempt<2){await new Promise(r=>setTimeout(r,1100*(attempt+1)));continue;}
  if(response.status===404&&method==='GET')return null;
  if(!response.ok)throw problem('We could not update your email preferences. Please try again shortly.',503);
  return response.json();
 }
}
async function event(env,hash,name){await dbq(env,'INSERT INTO newsletter_events(token_hash,event,created_at) VALUES(?,?,?)',hash,name,now()).run();}
export async function signup(request,env){
 const data=await body(request);configured(env);
 if(data.website)return json({message:GENERIC}); // Honeypot: no storage/send.
 const email=typeof data.email==='string'?data.email.trim().toLowerCase():'';
 if(email.length>254||! /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(email))throw problem('Please enter a valid email address.',400);
 if(data.consentVersion!==CONSENT_VERSION)throw problem('Please refresh this page and review the signup notice.',400);
 const time=now(),day=Math.floor(time/86400),hour=Math.floor(time/3600);
 const ip=request.headers.get('CF-Connecting-IP')||'unknown';
 await limit(env,'ip:'+hour+':'+await digest(day+':'+ip),8,time+7200);
 await dbq(env,'DELETE FROM newsletter_limits WHERE expires_at < ?',time).run();
 // Keep unconfirmed addresses for at most 30 days; confirmed consent retained for support.
 await dbq(env,"DELETE FROM newsletter_events WHERE token_hash IN (SELECT token_hash FROM newsletter_requests WHERE state IN ('pending','send_failed') AND requested_at < ?)",time-30*86400).run();
 await dbq(env,"DELETE FROM newsletter_requests WHERE state IN ('pending','send_failed') AND requested_at < ?",time-30*86400).run();
 const recent=await dbq(env,"SELECT token_hash FROM newsletter_requests WHERE email=? AND requested_at>? AND state!='send_failed' LIMIT 1",email,time-86400).first();
 if(recent)return json({message:GENERIC});
 // Atomic per-email deduplication, including simultaneous submissions.
 try{await limit(env,'email:'+day+':'+await digest(email),1,time+172800);}catch(error){if(error.status===429)return json({message:GENERIC});throw error;}
 // Reserve only a small portion of the reported transactional plan for confirmation mail.
 await limit(env,'mail:'+day,30,time+172800);
 const token=randomToken(),hash=await digest(token);
 const source=typeof data.source==='string'&&/^\/[\w/.-]{0,150}$/.test(data.source)?data.source:'/';
 await dbq(env,'INSERT INTO newsletter_requests(token_hash,email,requested_at,expires_at,consent_version,consent_text,source) VALUES(?,?,?,?,?,?,?)',hash,email,time,time+86400,CONSENT_VERSION,CONSENT_TEXT,source).run();
 const url=ORIGIN+'/newsletter/confirm/#token='+token;
 try{
  await resend(env,'/emails','POST',{from:env.RESEND_FROM||'FAVRŒ <essentials@favroe.com>',to:[email],subject:'One little confirmation · FAVRŒ',text:`A little something, occasionally.\n\nYou asked to receive FAVRŒ product updates and brand news. Confirm your email within 24 hours:\n${url}\n\nIf you did not request this, ignore this email. You have not been subscribed.\n\nObjects for Presentation.\nFAVRŒ · essentials@favroe.com`,html:`<div style="background:#f3eee7;color:#493848;padding:40px 24px;font:16px/1.6 Arial,sans-serif"><div style="max-width:520px;margin:auto"><img src="${ORIGIN}/assets/favroe-master-aubergine.svg" alt="FAVRŒ" width="180"><h1 style="font-size:32px;line-height:1.15;font-weight:400">One little confirmation.</h1><p>You asked to receive FAVRŒ product updates and brand news.</p><p><a href="${url}" style="display:inline-block;background:#493848;color:#f3eee7;padding:14px 22px;text-decoration:none">Confirm my email ↗</a></p><p>This link expires in 24 hours. If you did not request this, simply ignore it. You have not been subscribed.</p><p style="font-size:12px">Objects for Presentation.<br>FAVRŒ · essentials@favroe.com</p></div></div>`},'newsletter-confirm/'+hash);
 }catch(error){await dbq(env,"UPDATE newsletter_requests SET state='send_failed' WHERE token_hash=?",hash).run();await dbq(env,'DELETE FROM newsletter_limits WHERE key=?','email:'+day+':'+await digest(email)).run();throw error;}
 await event(env,hash,'confirmation_requested');return json({message:GENERIC});
}
async function lockEmail(env,email){
 const owner=randomToken(),time=now();
 const row=await dbq(env,`INSERT INTO newsletter_locks(email,owner,expires_at) VALUES(?,?,?)
 ON CONFLICT(email) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at
 WHERE newsletter_locks.expires_at < ? RETURNING owner`,email,owner,time+120,time).first();
 if(!row)throw problem('Your preferences are being updated. Please try again shortly.',409);
 return ()=>dbq(env,'DELETE FROM newsletter_locks WHERE email=? AND owner=?',email,owner).run();
}
export async function confirm(request,env){
 const data=await body(request);configured(env);
 if(typeof data.token!=='string'||! /^[a-f0-9]{64}$/.test(data.token))throw problem('This confirmation link is not valid. Please sign up again.',400);
 const hash=await digest(data.token),time=now();
 const previous=await dbq(env,'SELECT state,email FROM newsletter_requests WHERE token_hash=?',hash).first();
 if(previous?.state==='confirmed')return json({message:'Your email has already been confirmed. You can unsubscribe through any newsletter email.'});
 if(!previous)throw problem('This confirmation link is not valid. Please sign up again.',400);
 const unlock=await lockEmail(env,previous.email);
 try{
 const row=await dbq(env,"UPDATE newsletter_requests SET state='confirming',lock_until=? WHERE token_hash=? AND expires_at>? AND (state='pending' OR (state='confirming' AND lock_until<?)) RETURNING *",time+120,hash,time,time).first();
 if(!row)throw problem('This link has expired or is already being processed. Try again shortly, or request a new signup link.',409);
 let contact;
 try{
  const path='/contacts/'+encodeURIComponent(row.email);
  contact=await resend(env,path);
  if(contact?.unsubscribed)throw problem('This address is opted out of all FAVRŒ newsletters. Contact essentials@favroe.com if you would like help updating your preferences.',409);
  if(!contact){
   // All marketing enrollment happens only after the explicit confirmation POST.
   contact=await resend(env,'/contacts','POST',{email:row.email,unsubscribed:false,segments:[{id:env.RESEND_NEWSLETTER_SEGMENT_ID}],topics:[{id:env.RESEND_NEWSLETTER_TOPIC_ID,subscription:'opt_in'}]});
  }else{
   await resend(env,path+'/segments/'+encodeURIComponent(env.RESEND_NEWSLETTER_SEGMENT_ID),'POST');
   await resend(env,path+'/topics','PATCH',[{id:env.RESEND_NEWSLETTER_TOPIC_ID,subscription:'opt_in'}]);
  }
  const unsubscribe=randomToken();
  await dbq(env,"UPDATE newsletter_requests SET state='confirmed',confirmed_at=?,resend_contact_id=?,unsubscribe_hash=?,lock_until=0 WHERE token_hash=?",time,contact.id,await digest(unsubscribe),hash).run();
  await event(env,hash,'confirmed');
  return json({message:'You’re on the list. A little something will find you when there is something worth sharing.',unsubscribe:ORIGIN+'/newsletter/unsubscribe/#token='+unsubscribe});
 }catch(error){await dbq(env,"UPDATE newsletter_requests SET state='pending',lock_until=0 WHERE token_hash=? AND state='confirming'",hash).run();throw error;}
 }finally{await unlock();}
}
export async function unsubscribe(request,env){
 const data=await body(request);configured(env);
 if(typeof data.token!=='string'||! /^[a-f0-9]{64}$/.test(data.token))throw problem('This unsubscribe link is not valid. Use the unsubscribe link in your newsletter, or contact essentials@favroe.com.',400);
 const row=await dbq(env,'SELECT * FROM newsletter_requests WHERE unsubscribe_hash=?',await digest(data.token)).first();
 if(!row)throw problem('This unsubscribe link is not valid. Use the link in your newsletter.',400);
 const unlock=await lockEmail(env,row.email);
 try{
 const path='/contacts/'+encodeURIComponent(row.email);
 const contact=await resend(env,path);
 if(contact)await resend(env,path+'/topics','PATCH',[{id:env.RESEND_NEWSLETTER_TOPIC_ID,subscription:'opt_out'}]);
 // Invalidate all confirmation links for this address so an older link cannot resubscribe it.
 await dbq(env,"UPDATE newsletter_requests SET state='unsubscribed',lock_until=0 WHERE email=?",row.email).run();
 await event(env,row.token_hash,'unsubscribed');
 return json({message:'You’re unsubscribed. Thank you for spending a little time with FAVRŒ. Order and inquiry emails are unaffected.'});
 }finally{await unlock();}
}
export async function handle(fn,request,env){try{return await fn(request,env);}catch(error){return json({error:error.status?error.message:'Something went wrong. Please try again shortly.'},error.status||503);}}
