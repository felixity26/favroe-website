import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {analyticsConfig,verificationMarkup,purchasePayload} from '../functions/_lib/seo-preparation.js';
import {onRequest} from '../functions/_middleware.js';
import {onRequestGet as purchaseEndpoint} from '../functions/api/analytics-purchase.js';
import {createAnalytics} from '../public/analytics.js';
const enabled={measurementId:'G-LOCALTEST1',activationApproved:true,consentApproved:true,paymentMode:'live'};
const item={item_id:'pink-200',item_name:'Wholesale 200',price:64.99,quantity:1};
const data={value:64.99,currency:'USD',items:[item],transaction_id:'cs_live_synthetictransaction123'};
function fixture(config=enabled,options={}){const sent=[],map=new Map();const storage={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)};return {sent,map,controller:createAnalytics({config,consent:true,send:(...a)=>sent.push(a),storage,...options})};}
test('GA4 and GSC empty by default; invalid identifier cannot enable collection',()=>{
 assert.equal(analyticsConfig({}).measurementId,'');assert.equal(analyticsConfig({}).activationApproved,false);
 for(const config of [{...enabled,measurementId:''},{...enabled,measurementId:'invalid'},{...enabled,activationApproved:false},{...enabled,consentApproved:false}]){const f=fixture(config);assert.equal(f.controller.track('purchase',data),false);assert.equal(f.sent.length,0);}
});
test('consent and internal traffic fail closed; no test ecommerce reaches reporting',()=>{
 for(const options of [{consent:false},{internal:true}]){const f=fixture(enabled,options);assert.equal(f.controller.track('quote_submit',{}),false);}
 const f=fixture({...enabled,paymentMode:'test'});for(const name of ['view_item','add_to_cart','begin_checkout','purchase'])assert.equal(f.controller.track(name,data),false);
 assert.equal(f.controller.track('quote_submit',{email:'DO NOT SEND',reference:'PRIVATE'}),true);assert.deepEqual(f.sent[0],['quote_submit',{form_id:'bulk-inquiry'}]);
});
test('all requested events use whitelisted fields and numeric ecommerce values',()=>{
 const f=fixture();for(const name of ['view_item','add_to_cart','begin_checkout','purchase'])assert.equal(f.controller.track(name,{...data,email:'private@example.com'}),true);
 f.controller.track('wholesale_view',{page_location:'https://favroe.com/wholesale/',page_title:'Wholesale',secret:'no'});
 assert.equal(f.sent.length,5);assert.ok(!JSON.stringify(f.sent).includes('private@example.com'));assert.ok(!JSON.stringify(f.sent).includes('secret'));
});
test('purchase refresh is deduplicated with persistent storage; missing storage suppresses',()=>{
 const f=fixture();assert.equal(f.controller.track('purchase',data),true);assert.equal(f.controller.track('purchase',data),false);
 assert.equal(fixture(enabled,{storage:null}).controller.track('purchase',data),false);
 const g=fixture();g.controller.setConsent(false);assert.equal(g.controller.track('purchase',data),false);assert.equal(g.map.size,0);
});
test('unpaid, refunded, held and test orders cannot create purchase payloads',()=>{
 const order={sessionId:data.transaction_id,livemode:true,status:'paid',currency:'usd',amountSubtotal:6499,shippingCents:1200,taxCents:0,items:[{key:'pink-200',packs:1,unitCents:6499}]};
 assert.equal(purchasePayload(order).value,64.99);assert.equal(purchasePayload(order).shipping,12);
 for(const change of [{livemode:false},{status:'refunded'},{status:'partially_refunded'},{status:'pending'},{fulfillment:'address_hold'},{fulfillment:'stock_hold'},{holdReason:'Review needed'},{amountSubtotal:1}])assert.equal(purchasePayload({...order,...change}),null);
 assert.ok(!JSON.stringify(purchasePayload({...order,email:'private@example.com',shipping:{name:'Private'}})).includes('Private'));
});
test('purchase endpoint reads no storage while inactive/test and rejects invalid session',async()=>{
 const request=new Request('https://favroe.com/api/analytics-purchase?session_id=cs_test_fixture');
 assert.deepEqual(await (await purchaseEndpoint({request,env:{}})).json(),{purchase:null});
 const env={GA4_MEASUREMENT_ID:'G-LOCALTEST1',GA4_ACTIVATION_APPROVED:'true',GA4_CONSENT_APPROVED:'true',FAVROE_PAYMENT_MODE:'live'};
 assert.equal((await purchaseEndpoint({request,env})).status,400);
});
test('URL-prefix fallback preserves every existing head tag and emits exactly one token',async()=>{
 const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.equal(verificationMarkup(html,''),html);assert.equal(verificationMarkup(html,'bad<tag'),html);
 const once=verificationMarkup(html,'local-verification-fixture');assert.equal(once.match(/name="google-site-verification"/g).length,1);assert.equal(verificationMarkup(once,'another-valid-fixture'),once);
 assert.equal(once.replace('<meta name="google-site-verification" content="local-verification-fixture">',''),html);
 const run=async(path,token)=>onRequest({request:new Request('https://favroe.com'+path),env:{GSC_VERIFICATION:token},next:async()=>new Response(html,{headers:{'content-type':'text/html','x-robots-tag':'preserved'}})});
 assert.equal(await (await run('/product/','local-verification-fixture')).text(),html);assert.equal((await run('/','local-verification-fixture')).headers.get('x-robots-tag'),'preserved');
});
test('browser bootstrap makes zero Google requests before approval/consent and rejects private paths',async()=>{
 const source=fs.readFileSync(new URL('../public/analytics.js',import.meta.url),'utf8').replace(/^export /gm,'');
 async function run(config,path='/product',grant=false){const scripts=[],events={};const window={};const document={title:'Product',referrer:'',querySelector:()=>null,createElement:()=>({}),head:{append:s=>scripts.push(s)},addEventListener:(n,fn)=>events[n]=fn};
 const ctx={window,document,URL,URLSearchParams,location:{pathname:path,hostname:'favroe.com',origin:'https://favroe.com',search:''},localStorage:{getItem:()=>null,setItem:()=>{}},fetch:async()=>({ok:true,json:async()=>config})};
 vm.runInNewContext(source,ctx);if(grant)window.FavroeAnalytics.setConsent(true);await new Promise(resolve=>setImmediate(resolve));return {scripts,window,events};}
 assert.equal((await run(enabled)).scripts.length,0);assert.equal((await run({...enabled,activationApproved:false},'/product',true)).scripts.length,0);
 for(const path of ['/ops/','/journal-preview/abc/','/journal-studio/'])assert.equal((await run(enabled,path,true)).scripts.length,0);assert.equal((await run(enabled,'/product',true)).scripts.length,1);
});
