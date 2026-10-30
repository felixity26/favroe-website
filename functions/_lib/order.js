export const LOWER48=new Set('AL,AZ,AR,CA,CO,CT,DE,DC,FL,GA,ID,IL,IN,IA,KS,KY,LA,ME,MD,MA,MI,MN,MS,MO,MT,NE,NV,NH,NJ,NM,NY,NC,ND,OH,OK,OR,PA,RI,SC,SD,TN,TX,UT,VT,VA,WA,WV,WI,WY'.split(','));
const PRICE={50:1999,100:3499,200:6499,400:11999};
const SKU={50:'FAV-D50',100:'FAV-S100',200:'FAV-W200',400:'FAV-V400'};
export function orderFromSession(s,env){
 if(s.metadata?.brand!=='FAVROE'||s.livemode!==(env.FAVROE_PAYMENT_MODE==='live'))throw new Error('Mode or brand mismatch');
 if(s.status!=='complete'||s.payment_status!=='paid')return null;
 if(s.line_items?.has_more||!s.line_items?.data?.length)throw new Error('Incomplete items');
 const items=s.line_items.data.map(li=>{
  const count=Object.keys(PRICE).find(n=>env['STRIPE_PRICE_PINK_'+n]===li.price?.id);
  if(!count||!Number.isSafeInteger(li.quantity)||li.quantity<1||li.price.currency!=='usd'||li.price.unit_amount!==PRICE[count])throw new Error('Unrecognized order item');
  return {sku:SKU[count],key:'pink-'+count,packs:li.quantity,sets:Number(count)*li.quantity,unitCents:PRICE[count]};
 });
 const totalSets=items.reduce((a,it)=>a+it.sets,0);
 if(totalSets<1||totalSets>400||String(totalSets)!==s.metadata.sets)throw new Error('Invalid set count');
 const shipping=s.collected_information?.shipping_details||s.shipping_details||null;
 const address=shipping?.address;
 const supported=address?.country==='US'&&LOWER48.has(address.state?.toUpperCase());
 return {id:'FAV-'+s.id.slice(-12),sessionId:s.id,paymentIntent:typeof s.payment_intent==='string'?s.payment_intent:s.payment_intent?.id||'',items,totalSets,amountTotal:s.amount_total,amountSubtotal:s.amount_subtotal,shippingCents:s.total_details?.amount_shipping,taxCents:s.total_details?.amount_tax,currency:s.currency,email:s.customer_details?.email||'',shipping,status:'paid',fulfillment:!s.livemode?'test_hold':supported?'pending':'address_hold',holdReason:!supported?'Delivery address missing or outside supported area':!s.livemode?'Sandbox order; do not fulfill':null,livemode:s.livemode,createdAt:new Date().toISOString()};
}
