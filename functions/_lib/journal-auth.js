import {fail} from './journal-content.js';
const enc=new TextEncoder();
const b64=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const decode=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
const key=secret=>crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
export async function digest(s){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(s)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export function configured(env){if(!env.JOURNAL_DB||![env.JOURNAL_EDITOR_KEY,env.JOURNAL_FOUNDER_KEY,env.JOURNAL_SESSION_SECRET].every(s=>typeof s==='string'&&s.length>=32)||env.JOURNAL_EDITOR_KEY===env.JOURNAL_FOUNDER_KEY)fail('Journal access is not configured.',503);}
export function checkOrigin(request){if(request.headers.get('Origin')!==new URL(request.url).origin)fail('Use the editor on this website.',403);}
export async function readJSON(request,max=80000){if(!request.headers.get('Content-Type')?.startsWith('application/json'))fail('JSON required.',415);const reader=request.body?.getReader();let chunks=[],size=0;if(!reader)fail('Request body required.');while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();fail('Request too large.',413);}chunks.push(value);}const all=new Uint8Array(size);let offset=0;for(const c of chunks){all.set(c,offset);offset+=c.length;}try{return JSON.parse(new TextDecoder().decode(all));}catch{fail('Invalid JSON.');}}
export async function session(request,env){
 configured(env);const cookie=(request.headers.get('Cookie')||'').match(/(?:^|;\s*)favroe_journal=([^;]+)/)?.[1];if(!cookie)return null;
 try{const [payload,signature]=cookie.split('.');const valid=await crypto.subtle.verify('HMAC',await key(env.JOURNAL_SESSION_SECRET),decode(signature),enc.encode(payload));if(!valid)return null;const data=JSON.parse(new TextDecoder().decode(decode(payload)));if(!['editor','founder'].includes(data.role)||data.exp<Date.now()||data.epoch!==await digest(env[data.role==='founder'?'JOURNAL_FOUNDER_KEY':'JOURNAL_EDITOR_KEY']))return null;return {role:data.role,actor:data.role==='founder'?'Founder':'Instinct editor'};}catch{return null;}
}
export async function requireSession(request,env){const s=await session(request,env);if(!s)fail('Sign in to the journal editor.',401);return s;}
export function sessionCookie(request,value,age=14400){return `favroe_journal=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${new URL(request.url).protocol==='https:'?'; Secure':''}`;}
export async function login(request,env){
 configured(env);checkOrigin(request);const data=await readJSON(request,3000);const hour=Math.floor(Date.now()/3600000);const ip=await digest((request.headers.get('CF-Connecting-IP')||'local')+env.JOURNAL_SESSION_SECRET);const bucket=`${hour}:${ip}`;
 const row=await env.JOURNAL_DB.prepare('INSERT INTO journal_login_limits(bucket,attempts) VALUES(?,1) ON CONFLICT(bucket) DO UPDATE SET attempts=attempts+1 RETURNING attempts').bind(bucket).first();
 if(row.attempts>20)fail('Too many sign-in attempts. Try again next hour.',429);
 const supplied=await digest(String(data.key||''));let role=null;
 if(supplied===await digest(env.JOURNAL_EDITOR_KEY))role='editor';if(supplied===await digest(env.JOURNAL_FOUNDER_KEY))role='founder';if(!role)fail('Access key not recognized.',401);
 const epoch=await digest(env[role==='founder'?'JOURNAL_FOUNDER_KEY':'JOURNAL_EDITOR_KEY']);const payload=b64(enc.encode(JSON.stringify({role,epoch,exp:Date.now()+14400000,nonce:crypto.randomUUID()})));
 const signature=b64(await crypto.subtle.sign('HMAC',await key(env.JOURNAL_SESSION_SECRET),enc.encode(payload)));
 return {role,cookie:sessionCookie(request,`${payload}.${signature}`)};
}
