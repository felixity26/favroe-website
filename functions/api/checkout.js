import {createCheckout} from '../_lib/stripe-checkout.js';
import {bind,availability,reservations} from '../_lib/store.js';
const json=(status,obj)=>new Response(JSON.stringify(obj),{status,headers:{'Content-Type':'application/json'}});
export async function onRequestPost({request,env}){
  bind(env);
  let reservedKey=null;
  try{
    const idem=request.headers.get('idempotency-key')||'';
    const data=await request.clone().json().catch(()=>null);
    const lines=Array.isArray(data?.lines)?data.lines:[];
    const sets=lines.reduce((a,l)=>a+Number(String(l?.key||'').split('-')[1]||0)*Number(l?.quantity||0),0);
    if(sets>0&&/^[a-f0-9-]{36}$/i.test(idem)){
      const st=await availability();
      if(sets>st.available)return json(409,{error:'This quantity is not currently in stock. Please reduce the bag or request a bulk quote.'});
      reservedKey='FAV-'+idem;
      await reservations().setJSON(reservedKey,{sets,livemode:env.FAVROE_PAYMENT_MODE==='live',createdAt:new Date().toISOString()});
    }
  }catch{/* store unreadable: do not block checkout on a store error */}
  const res=await createCheckout(request,env);
  if(reservedKey&&res.status>=400){try{await reservations().delete(reservedKey);}catch{}}
  return res;
}
export const onRequestGet=()=>json(405,{error:'POST required.'});
