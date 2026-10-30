import {analyticsConfig,purchasePayload} from '../_lib/seo-preparation.js';
import {stores} from '../_lib/store.js';
// Read only from webhook-verified orders. Never use a page visit or browser total as a sale.
export async function onRequestGet({request,env}) {
 const config=analyticsConfig(env),reply=(status,data)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
 if(!config.measurementId||!config.activationApproved||!config.consentApproved||config.internalTraffic||config.paymentMode!=='live')return reply(200,{purchase:null});
 if(request.headers.get('sec-fetch-site')==='cross-site')return reply(403,{purchase:null});
 const id=new URL(request.url).searchParams.get('session_id');
 if(!/^cs_live_[A-Za-z0-9]{16,200}$/.test(id||''))return reply(400,{purchase:null});
 try{return reply(200,{purchase:purchasePayload(await stores(env).orders.get(id,{type:'json'}))});}
 catch{return reply(503,{purchase:null});}
}
