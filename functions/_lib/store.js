// Cloudflare KV adapter - same shape as the Netlify Blobs store.
// KV is eventually consistent (~60s propagation), same tolerance the
// recompute-from-records design already relies on with Blobs.
const mk=ns=>({
  async get(key,opts={}){const v=await ns.get(key,opts.type==='json'?'json':'text');return v;},
  async setJSON(key,val){await ns.put(key,JSON.stringify(val));},
  async set(key,val){await ns.put(key,val);},
  async delete(key){await ns.delete(key);},
  async list(){const out=[];let cursor;do{const r=await ns.list({cursor});for(const k of r.keys)out.push({key:k.name});cursor=r.list_complete?undefined:r.cursor;}while(cursor);return {blobs:out};}
});
let E;
export const bind=env=>{E=env;};
export const orders=()=>mk(E.ORDERS);
export const reservations=()=>mk(E.RESERVATIONS);
export const inquiries=()=>mk(E.INQUIRIES);
export const events=()=>mk(E.EVENTS);
const config=()=>mk(E.CONFIG);
export const STARTING_SETS=3000;
export async function getTotal(){
  const c=await config().get('inventory',{type:'json'});
  return (c&&Number.isSafeInteger(c.total))?c.total:STARTING_SETS;
}
export async function soldSets(){
  let sold=0;const l=await orders().list();
  for(const {key} of l.blobs){const o=await orders().get(key,{type:'json'});
    if(o&&o.livemode===true&&Number.isSafeInteger(o.totalSets))sold+=o.totalSets;}
  return sold;
}
export async function reservedSets(){
  let r=0;const l=await reservations().list();
  for(const {key} of l.blobs){const v=await reservations().get(key,{type:'json'});
    if(v&&v.livemode===true&&Number.isSafeInteger(v.sets))r+=v.sets;}
  return r;
}
export async function availability(){
  const [total,sold,reserved]=await Promise.all([getTotal(),soldSets(),reservedSets()]);
  return {total,sold,reserved,available:total-sold-reserved};
}
