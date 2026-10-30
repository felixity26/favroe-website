// Authenticated operations records. Payment truth is separate from fulfillment.
import {stores,availability} from '../_lib/store.js';
import {notifyInquiry,inquiryNotificationStatus} from '../_lib/inquiry-notifications.js';
const json=(status,obj)=>new Response(JSON.stringify(obj),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const INQUIRY_STATUSES=['inquiry','quote','awaiting_payment','cancelled'];
const FULFILLMENT=['pending','fulfillment','completed'];
const clean=(s,n)=>String(s??'').replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,n);
function authed(request,env){return !!env.FAVROE_OPS_TOKEN&&request.headers.get('authorization')==='Bearer '+env.FAVROE_OPS_TOKEN;}
async function all(store,skip){const out=[];for(const {key} of (await store.list()).blobs){if(skip?.(key))continue;const v=await store.get(key,{type:'json'});if(v)out.push({...v,key});}return out;}
export async function onRequestGet({request,env}){
 if(!authed(request,env))return json(401,{error:'Not authorized.'});
 try{
  const {orders,reservations,inquiries,events}=stores(env);
  const [orderList,inquiryList,reservationList,inventory]=await Promise.all([all(orders),all(inquiries,k=>k.startsWith('dupe-')||k.startsWith('idem-')),all(reservations),availability(env)]);
  for(const item of inquiryList)item.notifications=await inquiryNotificationStatus(item.id,env);
  for(const order of orderList){order.notifications={};for(const role of ['operations','customer'])order.notifications[role]=await events.get('mail-'+order.sessionId+'-'+role,{type:'json'});}
  orderList.sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));inquiryList.sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
  return json(200,{orders:orderList,inquiries:inquiryList,reservations:reservationList,inventory});
 }catch{return json(503,{error:'Operations records could not be loaded. Please retry. No records were changed.'});}
}
export async function onRequestPatch({request,env}){
 if(!authed(request,env))return json(401,{error:'Not authorized.'});
 const raw=await request.text();if(new TextEncoder().encode(raw).byteLength>4096)return json(413,{error:'Update too large.'});
 let data;try{data=JSON.parse(raw);}catch{return json(400,{error:'Bad request.'});}
 const {type,id,status,action}=data||{};
 if(!['inquiry','order'].includes(type)||typeof id!=='string'||id.length>200)return json(400,{error:'A valid record type and id are required.'});
 if(!(type==='inquiry'&&action==='retry_notifications')&&!(type==='order'?FULFILLMENT:INQUIRY_STATUSES).includes(status))return json(400,{error:'Choose a valid workflow status.'});
 try{
  const {orders,inquiries}=stores(env),store=type==='order'?orders:inquiries;
  const record=await store.get(id,{type:'json'});if(!record)return json(404,{error:'Record not found.'});
  if(type==='inquiry'&&action==='retry_notifications')return json(200,{updated:id,notifications:await notifyInquiry(record,env)});
  if(type==='order'){
   if(record.livemode!==true||record.holdReason||!['paid','fulfillment','completed'].includes(record.status)||!['pending','fulfillment','completed'].includes(record.fulfillment))return json(409,{error:'Only verified paid orders without a hold can enter fulfillment.'});
   if(data.tracking!==undefined){
    if(!data.tracking||typeof data.tracking!=='object')return json(400,{error:'Invalid tracking details.'});
    const tracking={carrier:clean(data.tracking.carrier,100),number:clean(data.tracking.number,160),url:clean(data.tracking.url,2048)};
    if(tracking.url){try{const u=new URL(tracking.url);if(u.protocol!=='https:'||u.username||u.password)throw new Error();}catch{return json(400,{error:'Tracking links must use HTTPS.'});}}
    record.tracking=tracking;
   }
   record.status='paid';record.fulfillment=status;record.fulfillmentUpdatedAt=new Date().toISOString();
  }else{record.status=status;record.statusUpdatedAt=new Date().toISOString();}
  await store.setJSON(id,record);return json(200,{updated:id,status:record.status,fulfillment:record.fulfillment});
 }catch{return json(503,{error:'The update could not be confirmed. Refresh the record before retrying.'});}
}
