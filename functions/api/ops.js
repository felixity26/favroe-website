// Operations view backend: Bearer-token guarded read + pipeline status updates.
import {stores,availability} from '../_lib/store.js';
const json=(status,obj)=>new Response(JSON.stringify(obj),{status,headers:{'Content-Type':'application/json'}});
const INQUIRY_STATUSES=['inquiry','quote','awaiting_payment','cancelled'];
const ORDER_STATUSES=['fulfillment','completed'];
function authed(request,env){
  const tok=env.FAVROE_OPS_TOKEN||'';
  return tok&&(request.headers.get('authorization')||'')==='Bearer '+tok;
}
async function all(store,skip){
  const out=[];const l=await store.list();
  for(const {key} of l.blobs){
    if(skip&&skip(key))continue;
    const v=await store.get(key,{type:'json'});if(v)out.push({key,...v});
  }
  return out;
}
export async function onRequestGet({request,env}){
  const {orders,reservations,inquiries}=stores(env);if(!authed(request,env))return json(401,{error:'Not authorized.'});
  const [orderList,inquiryList,reservationList,inv]=await Promise.all([
    all(orders),all(inquiries,k=>k.startsWith('dupe-')||k.startsWith('idem-')),all(reservations),availability(env)]);
  orderList.sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
  inquiryList.sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
  return json(200,{orders:orderList,inquiries:inquiryList,reservations:reservationList,inventory:inv});
}
export async function onRequestPatch({request,env}){
  const {orders,reservations,inquiries}=stores(env);if(!authed(request,env))return json(401,{error:'Not authorized.'});
  let data;try{data=await request.json();}catch{return json(400,{error:'Bad request.'});}
  const {type,id,status}=data||{};
  if(!['inquiry','order'].includes(type)||!id||!(type==='order'?ORDER_STATUSES:INQUIRY_STATUSES).includes(status))
    return json(400,{error:'type (inquiry|order), id and a valid status are required.'});
  const store=type==='order'?orders:inquiries;
  const rec=await store.get(id,{type:'json'});
  if(!rec)return json(404,{error:'Record not found.'});
  if(type==='order'&&(rec.livemode!==true||rec.holdReason||!['paid','fulfillment','completed'].includes(rec.status)))return json(409,{error:'Only verified paid orders without a hold can enter fulfillment.'});
  rec.status=status;rec.statusUpdatedAt=new Date().toISOString();
  await store.setJSON(id,rec);
  return json(200,{updated:id,status});
}
