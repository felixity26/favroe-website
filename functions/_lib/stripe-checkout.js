// Stripe-hosted Checkout adapter. No card details or prices are accepted from the browser.
const prices={50:1999,100:3499,200:6499,400:11999};
const headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const reply=(status,data)=>new Response(JSON.stringify(data),{status,headers});
function settings(env){
 if(env.FAVROE_CHECKOUT_ENABLED!=='true')throw new Error('Checkout is not connected yet.');
 if(!/^sk_(test|live)_[A-Za-z0-9]+$/.test(env.STRIPE_SECRET_KEY||''))throw new Error('Stripe setup is incomplete.');
 const origin=new URL(env.FAVROE_PUBLIC_ORIGIN||'');if(origin.protocol!=='https:'||origin.origin!==env.FAVROE_PUBLIC_ORIGIN)throw new Error('Website setup is incomplete.');
 if(!/^(test|live)$/.test(env.FAVROE_PAYMENT_MODE||'')||!env.STRIPE_SECRET_KEY.startsWith('sk_'+env.FAVROE_PAYMENT_MODE+'_'))throw new Error('Payment mode requires review.');
 if(env.FAVROE_PAYMENT_MODE==='live'&&env.FAVROE_LAUNCH_APPROVED!=='true')throw new Error('Live checkout has not been activated.');
 if(!['true','false'].includes(env.FAVROE_AUTOMATIC_TAX))throw new Error('Tax setup is incomplete.');
 if(!/^shr_[A-Za-z0-9]+$/.test(env.STRIPE_SHIPPING_RATE_ID||''))throw new Error('Shipping setup is incomplete.');
 if(!env.FAVROE_SHIPPING_COUNTRIES||!/^([A-Z]{2})(,[A-Z]{2})*$/.test(env.FAVROE_SHIPPING_COUNTRIES))throw new Error('Shipping destinations are not configured.');
 return {origin:origin.origin,key:env.STRIPE_SECRET_KEY,live:env.FAVROE_PAYMENT_MODE==='live'};
}
async function stripe(path,options,env,fetcher){
 const response=await fetcher('https://api.stripe.com/v1/'+path,{...options,headers:{Authorization:'Bearer '+env.STRIPE_SECRET_KEY,...options.headers},signal:AbortSignal.timeout(15000)});
 const data=await response.json();if(!response.ok)throw new Error('Stripe could not complete this request. Please try again or contact the seller.');return data;
}
export async function createCheckout(request,env,fetcher=fetch){
 if(request.method!=='POST')return reply(405,{error:'POST required.'});
 let setup;try{setup=settings(env);}catch{return reply(503,{error:'Checkout setup is not complete. No payment was started.'});}
 if(request.headers.get('origin')!==setup.origin||request.headers.get('sec-fetch-site')==='cross-site')return reply(403,{error:'Use the FAVRŒ website to start checkout.'});
 if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')||''))return reply(415,{error:'JSON required.'});
 const requestKey=request.headers.get('idempotency-key');if(!/^[a-f0-9-]{36}$/i.test(requestKey||''))return reply(400,{error:'Refresh your bag and try again.'});
 let data;try{if(Number(request.headers.get('content-length'))>4096)return reply(413,{error:'Request too large.'});const reader=request.body?.getReader();if(!reader)return reply(400,{error:'Missing bag.'});let text='',size=0;const decoder=new TextDecoder();while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>4096){await reader.cancel();return reply(413,{error:'Request too large.'});}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();data=JSON.parse(text);}catch{return reply(400,{error:'Check your bag and try again.'});}
 if(!Array.isArray(data.lines)||!data.lines.length||data.lines.length>4)return reply(400,{error:'Choose a valid pink pack.'});
 const seen=new Set();let sets=0;
 for(const line of data.lines){if(!line||!/^pink-(50|100|200|400)$/.test(line.key)||!Number.isSafeInteger(line.quantity)||line.quantity<1||line.quantity>20||seen.has(line.key))return reply(400,{error:'Only valid pink packs are available. Aluminum is coming soon.'});seen.add(line.key);sets+=Number(line.key.split('-')[1])*line.quantity;}
 const maxSets=Number(env.FAVROE_MAX_SETS_PER_ORDER);if(!Number.isSafeInteger(maxSets)||maxSets<50)return reply(503,{error:'Ordering limits have not been configured.'});if(sets>maxSets)return reply(400,{error:'This quantity needs an individual quote. Please reduce the bag or contact us.'});
 const shipState=String(data?.state||'').trim().toUpperCase();
 const LOWER48=new Set('AL,AZ,AR,CA,CO,CT,DE,DC,FL,GA,ID,IL,IN,IA,KS,KY,LA,ME,MD,MA,MI,MN,MS,MO,MT,NE,NV,NH,NJ,NM,NY,NC,ND,OH,OK,OR,PA,RI,SC,SD,TN,TX,UT,VT,VA,WA,WV,WI,WY'.split(','));
 if(!shipState)return reply(400,{error:'Choose your shipping state to continue.'});
 if(!LOWER48.has(shipState))return reply(400,{error:'We currently ship within the continental United States only.'});
 try{
 const form=new URLSearchParams({mode:'payment',success_url:setup.origin+'/payment-return/?session_id={CHECKOUT_SESSION_ID}',cancel_url:setup.origin+'/cart/',client_reference_id:'FAV-'+requestKey,'metadata[brand]':'FAVROE','metadata[sets]':String(sets),'payment_intent_data[metadata][brand]':'FAVROE','automatic_tax[enabled]':env.FAVROE_AUTOMATIC_TAX,'shipping_options[0][shipping_rate]':env.STRIPE_SHIPPING_RATE_ID});
  env.FAVROE_SHIPPING_COUNTRIES.split(',').forEach((country,i)=>form.set(`shipping_address_collection[allowed_countries][${i}]`,country));
  for(const [i,line] of data.lines.entries()){
   const count=Number(line.key.split('-')[1]),id=env['STRIPE_PRICE_PINK_'+count];if(!/^price_[A-Za-z0-9]+$/.test(id||''))return reply(503,{error:'This pack is awaiting payment setup.'});
   const price=await stripe('prices/'+id,{method:'GET'},env,fetcher);
   if(!price.active||price.currency!=='usd'||price.unit_amount!==prices[count]||price.type!=='one_time'||price.livemode!==setup.live||price.metadata?.favroe_sku!==line.key)return reply(503,{error:'This pack’s price or availability needs confirmation.'});
   form.set(`line_items[${i}][price]`,id);form.set(`line_items[${i}][quantity]`,line.quantity);
  }
  const session=await stripe('checkout/sessions',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Idempotency-Key':'favroe-'+requestKey},body:form},env,fetcher);
  const target=new URL(session.url);if(target.protocol!=='https:'||target.hostname!=='checkout.stripe.com')throw new Error('Unexpected payment destination.');
  return reply(200,{url:target.href});
 }catch{return reply(502,{error:'Checkout could not be opened. No order is confirmed. Please try again.'});}
}
export async function paymentStatus(request,env,fetcher=fetch){
 if(request.method!=='GET')return reply(405,{error:'GET required.'});
 let setup;try{setup=settings(env);}catch{return reply(503,{error:'Payment verification is not connected.'});}
 const id=new URL(request.url).searchParams.get('session_id');if(!/^cs_(test|live)_[A-Za-z0-9]+$/.test(id||''))return reply(400,{error:'No valid payment reference.'});
 try{const s=await stripe('checkout/sessions/'+id,{method:'GET'},env,fetcher);if(s.metadata?.brand!=='FAVROE'||s.livemode!==setup.live)return reply(404,{error:'Payment reference not found.'});let paid=s.status==='complete'&&s.payment_status==='paid',refunded=false;if(paid&&s.payment_intent){const pi=await stripe('payment_intents/'+s.payment_intent,{method:'GET'},env,fetcher);if(pi.latest_charge){const c=await stripe('charges/'+pi.latest_charge,{method:'GET'},env,fetcher);refunded=!!c.refunded||(c.amount_refunded||0)>0;if(refunded)paid=false;}}return reply(200,{paid,refunded});}catch{return reply(502,{error:'Payment could not be verified. Check your receipt before retrying.'});}
}
