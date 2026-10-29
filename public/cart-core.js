(function(root){
'use strict';
function item(config,key){
 if(typeof key!=='string'||!Object.hasOwn(config.variants,key))return null;
 const match=/^(pink|aluminum)-(50|100|200|400)$/.exec(key);if(!match)return null;
 const finish=config.finishes[match[1]],pack=config.packs.find(p=>p.sets===Number(match[2]));
 return finish&&pack?{key,finishId:match[1],finish,pack,variant:config.variants[key]}:null;
}
function normalize(config,input){
 if(!Array.isArray(input))return [];
 const quantities=new Map();
 for(const line of input.slice(0,100)){
  if(!line||!item(config,line.key)||!Number.isSafeInteger(line.quantity)||line.quantity<1)continue;
  quantities.set(line.key,Math.min(20,(quantities.get(line.key)||0)+line.quantity));
 }
 return [...quantities].map(([key,quantity])=>({key,quantity}));
}
function totals(config,cart){
 return normalize(config,cart).reduce((t,line)=>{const p=item(config,line.key).pack;return {cents:t.cents+p.cents*line.quantity,sets:t.sets+p.sets*line.quantity,packs:t.packs+line.quantity};},{cents:0,sets:0,packs:0});
}
function checkout(config,cart){
 const lines=normalize(config,cart);
 if(!lines.length)return {error:'Add a pack to your bag first.'};
 if(!config.checkout.enabled)return {error:'Checkout is not connected yet. This preview cannot take payment or place an order.'};
 for(const line of lines){const p=item(config,line.key);if(!p.finish.selectable||!p.finish.stockConfirmed||!p.variant.saleEnabled)return {error:'An item in your bag is not available for checkout. Please review your selection.'};}
 if(config.checkout.endpoint!=='api/checkout')return {error:'The payment connection needs review.'};
 return {lines};
}
const api={item,normalize,totals,checkout};if(typeof module==='object'&&module.exports)module.exports=api;else root.FavroeCart=api;
})(typeof window==='object'?window:globalThis);
