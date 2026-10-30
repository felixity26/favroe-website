import {reserveInventory,attachSession} from '../_lib/inventory.js';
import {createCheckout} from '../_lib/stripe-checkout.js';
import {stores,availability} from '../_lib/store.js';
export async function onRequestPost({request,env}){
 // Validation and Stripe price checks happen BEFORE any reservation write.
 return createCheckout(request,env,fetch,{attach:env.INVENTORY_DB?(key,id)=>attachSession(env,key,id):undefined,reserve:async({key,sets,expiresAt,fingerprint})=>{
  if(env.INVENTORY_DB)return reserveInventory(env,{key,sets,expiresAt,fingerprint});
  if(env.FAVROE_PAYMENT_MODE==='live')throw new Error('Atomic inventory is required');
  const {reservations}=stores(env);
  const existing=await reservations.get(key,{type:'json'});
  if(existing&&existing.sets!==sets)throw new Error('This checkout reference belongs to a different bag.');
  if(existing&&Date.parse(existing.expiresAt)<=Date.now())throw new Error('Checkout reference expired');
  if(existing)return {expiresAt:Math.floor(Date.parse(existing.expiresAt)/1000)};
  const stock=await availability(env,{excludeReservation:key});
  if(sets>stock.available)throw new Error('This quantity is not currently in stock. Please reduce the bag or request a bulk quote.');
  await reservations.setJSON(key,{sets,livemode:env.FAVROE_PAYMENT_MODE==='live',createdAt:new Date().toISOString(),expiresAt:new Date(expiresAt*1000).toISOString()},{expiration:expiresAt+300});
  return {expiresAt};
 }});
}
export const onRequestGet=()=>new Response(JSON.stringify({error:'POST required.'}),{status:405,headers:{'Content-Type':'application/json'}});
