import {reservationFor,releaseReservation} from '../_lib/inventory.js';
const reply=(status,data)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
export async function onRequestPost({request,env}){
 if(request.headers.get('origin')!==env.FAVROE_PUBLIC_ORIGIN||request.headers.get('sec-fetch-site')==='cross-site')return reply(403,{error:'Use the FAVRŒ website.'});
 if(!env.INVENTORY_DB)return reply(503,{error:'Cancellation requires a stock review. Please contact us.'});
 let data;try{const raw=await request.text();if(raw.length>256)throw Error();data=JSON.parse(raw);}catch{return reply(400,{error:'Invalid checkout reference.'});}
 if(!/^[a-f0-9-]{36}$/i.test(data?.reference||''))return reply(400,{error:'Invalid checkout reference.'});
 try{
  const key='FAV-'+data.reference,r=await reservationFor(env,key);
  if(!r||r.state==='released')return reply(200,{cancelled:true});
  if(r.state!=='held'||!r.session_id)return reply(409,{error:'This checkout needs review. Check your payment confirmation before ordering again.'});
  const base='https://api.stripe.com/v1/checkout/sessions/'+encodeURIComponent(r.session_id),headers={Authorization:'Bearer '+env.STRIPE_SECRET_KEY};
  let response=await fetch(base,{headers,signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error();let session=await response.json();
  if(session.metadata?.brand!=='FAVROE'||session.client_reference_id!==key||session.livemode!==(env.FAVROE_PAYMENT_MODE==='live'))throw Error();
  if(session.status==='open'){response=await fetch(base+'/expire',{method:'POST',headers,signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error();session=await response.json();}
  if(session.status!=='expired'||session.payment_status==='paid')return reply(409,{error:'Payment may already be complete. Check your confirmation before ordering again.'});
  await releaseReservation(env,key,r.session_id);return reply(200,{cancelled:true});
 }catch{return reply(503,{error:'Cancellation could not be confirmed. No stock was released. Please contact us.'});}
}
export const onRequestGet=()=>reply(405,{error:'POST required.'});
