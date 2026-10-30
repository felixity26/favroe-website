// Dormant preparation only. No environment/account values are changed by this module.
export function analyticsConfig(env={}) {
 const id=env.GA4_MEASUREMENT_ID||'';
 return {
  measurementId:/^G-[A-Z0-9]{6,20}$/.test(id)?id:'',
  activationApproved:env.GA4_ACTIVATION_APPROVED==='true',
  consentApproved:env.GA4_CONSENT_APPROVED==='true',
  internalTraffic:env.GA4_INTERNAL_TRAFFIC==='true',
  paymentMode:env.FAVROE_PAYMENT_MODE==='live'?'live':'test'
 };
}
export function verificationMarkup(html,token='') {
 if(!/^[A-Za-z0-9_-]{10,200}$/.test(token)||/<meta\b[^>]*name\s*=\s*["']google-site-verification["']/i.test(html))return html;
 return html.replace(/<\/head\s*>/i,`<meta name="google-site-verification" content="${token}"></head>`);
}
export function purchasePayload(order) {
 if(!order||order.livemode!==true||order.status!=='paid'||order.fulfillment==='address_hold'||!/^cs_live_[A-Za-z0-9]+$/.test(order.sessionId||''))return null;
 if(order.currency!=='usd'||!Number.isSafeInteger(order.amountSubtotal)||order.amountSubtotal<0||!Array.isArray(order.items)||!order.items.length)return null;
 const items=order.items.map(i=>({item_id:i.key,item_name:`Pink · ${Number(i.key?.split('-')[1])} complete sets`,price:i.unitCents/100,quantity:i.packs}));
 if(items.some(i=>!/^pink-(50|100|200|400)$/.test(i.item_id)||!Number.isSafeInteger(i.quantity)||i.quantity<1||!Number.isFinite(i.price)||i.price<0))return null;
 if(order.items.reduce((n,i)=>n+i.unitCents*i.packs,0)!==order.amountSubtotal)return null;
 return {transaction_id:order.sessionId,value:order.amountSubtotal/100,currency:'USD',shipping:(order.shippingCents||0)/100,tax:(order.taxCents||0)/100,items};
}
