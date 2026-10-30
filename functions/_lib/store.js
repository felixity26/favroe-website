// Request-scoped KV access. KV remains unsuitable for atomic inventory allocation.
export const store=ns=>({
 get:(key,opts={})=>ns.get(key,opts.type==='json'?'json':'text'),
 setJSON:(key,val,opts={})=>ns.put(key,JSON.stringify(val),opts),
 delete:key=>ns.delete(key),
 async list(){const blobs=[];let cursor;do{const r=await ns.list({cursor});blobs.push(...r.keys.map(k=>({key:k.name})));cursor=r.list_complete?undefined:r.cursor;}while(cursor);return {blobs};}
});
export function stores(env){return {orders:store(env.ORDERS),reservations:store(env.RESERVATIONS),inquiries:store(env.INQUIRIES),events:store(env.EVENTS)};}
export async function availability(env,{excludeReservation}={}){
 const {orders,reservations}=stores(env),live=env.FAVROE_PAYMENT_MODE==='live';
 const c=await store(env.CONFIG).get(live?'inventory':'inventory-test',{type:'json'});
 // A separate test ledger prevents sandbox purchases changing live stock.
 const total=c?.total??(!live?3000:null);
 if(!Number.isSafeInteger(total)||total<0)throw new Error('Inventory configuration missing');
 let sold=0,reserved=0;
 for(const {key} of (await orders.list()).blobs){const o=await orders.get(key,{type:'json'});if(o?.livemode===live&&Number.isSafeInteger(o.totalSets))sold+=o.totalSets;}
 for(const {key} of (await reservations.list()).blobs){if(key===excludeReservation)continue;const r=await reservations.get(key,{type:'json'});if(r?.livemode===live&&Number.isSafeInteger(r.sets)&&Date.parse(r.expiresAt)>Date.now())reserved+=r.sets;}
 return {mode:live?'live':'test',total,sold,reserved,available:Math.max(0,total-sold-reserved),atomic:false};
}
