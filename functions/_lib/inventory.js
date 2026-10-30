// D1 is authoritative for orders and inventory. Existing KV orders remain an
// archival mirror. Holds are released only after Stripe confirms expiry/failure;
// a wall clock alone must never make a still-payable session's stock available.
const mode=env=>env.FAVROE_PAYMENT_MODE==='live'?'live':'test';
async function kvRows(ns){const out=[];let cursor;do{const r=await ns.list({cursor});for(const k of r.keys){const v=await ns.get(k.name,'json');if(v)out.push({key:k.name,value:v});}cursor=r.list_complete?undefined:r.cursor;}while(cursor);return out;}
export async function ensureLedger(env){
 const db=env.INVENTORY_DB;if(!db)throw new Error('Atomic inventory is not configured');
 const state=await db.prepare("SELECT ready FROM inventory_stock WHERE mode='test'").first();
 if(!state)throw new Error('Inventory schema is not initialized');
 if(state.ready===1)return db;
 // Bootstrap only the test ledger. INSERT OR IGNORE makes simultaneous first
 // requests safe. Preserve all historical orders, including refunds.
 const [orders,reservations]=await Promise.all([kvRows(env.ORDERS),kvRows(env.RESERVATIONS)]);
 if(orders.some(r=>r.value.livemode===true)||reservations.some(r=>r.value.livemode===true))throw new Error('Live historical inventory requires reconciliation');
 const now=new Date().toISOString(),statements=[];
 for(const {key,value:o} of orders){
  statements.push(db.prepare('INSERT OR IGNORE INTO order_records(key,data) VALUES(?,?)').bind(key,JSON.stringify(o)));
  if(Number.isSafeInteger(o.totalSets)&&o.totalSets>0)statements.push(db.prepare("INSERT OR IGNORE INTO inventory_reservations(key,mode,sets,state,session_id,expires_at,created_at,updated_at) VALUES(?,?,?,'allocated',?,0,?,?)").bind('legacy-order-'+key,'test',o.totalSets,key,o.createdAt||now,now));
 }
 for(const {key,value:r} of reservations){if(Number.isSafeInteger(r.sets)&&r.sets>0&&Date.parse(r.expiresAt)>Date.now())statements.push(db.prepare("INSERT OR IGNORE INTO inventory_reservations(key,mode,sets,state,expires_at,created_at,updated_at) VALUES(?,?,?,'held',?,?,?)").bind(key,'test',r.sets,Math.floor(Date.parse(r.expiresAt)/1000),r.createdAt||now,now));}
 statements.push(db.prepare("UPDATE inventory_stock SET ready=1 WHERE mode='test'"));
 await db.batch(statements);return db;
}
export async function inventoryAvailability(env){
 const db=await ensureLedger(env),m=mode(env);
 const r=await db.prepare("SELECT total,ready,COALESCE((SELECT SUM(sets) FROM inventory_reservations WHERE mode=? AND state='allocated'),0) sold,COALESCE((SELECT SUM(sets) FROM inventory_reservations WHERE mode=? AND state='held'),0) reserved FROM inventory_stock WHERE mode=?").bind(m,m,m).first();
 if(!r||r.ready!==1)throw new Error('Live inventory requires reconciliation');
 return {mode:m,total:r.total,sold:r.sold,reserved:r.reserved,available:Math.max(0,r.total-r.sold-r.reserved),atomic:true};
}
export async function reserveInventory(env,{key,sets,expiresAt,fingerprint}){
 const db=await ensureLedger(env),m=mode(env),now=new Date().toISOString();
 // The availability predicate and insertion execute as ONE SQLite statement.
 await db.prepare("INSERT OR IGNORE INTO inventory_reservations(key,mode,sets,state,expires_at,fingerprint,created_at,updated_at) SELECT ?,?,?,'held',?,?,?,? FROM inventory_stock WHERE mode=? AND ready=1 AND total-COALESCE((SELECT SUM(sets) FROM inventory_reservations WHERE mode=? AND state IN ('held','allocated')),0)>=?").bind(key,m,sets,expiresAt,fingerprint,now,now,m,m,sets).run();
 const r=await db.prepare('SELECT * FROM inventory_reservations WHERE key=?').bind(key).first();
 if(!r||r.mode!==m||r.sets!==sets||r.fingerprint!==fingerprint||r.state!=='held'||r.expires_at<=Date.now()/1000)throw new Error('Stock could not be reserved');
 return {expiresAt:r.expires_at};
}
export async function attachSession(env,key,sessionId){const db=await ensureLedger(env);const r=await db.prepare("UPDATE inventory_reservations SET session_id=?,updated_at=? WHERE key=? AND state='held' AND (session_id IS NULL OR session_id=?)").bind(sessionId,new Date().toISOString(),key,sessionId).run();if(r.meta.changes!==1)throw new Error('Reservation/session mismatch');}
export async function reservationFor(env,key){const db=await ensureLedger(env);return db.prepare('SELECT * FROM inventory_reservations WHERE key=?').bind(key).first();}
export async function releaseReservation(env,key,sessionId){const db=await ensureLedger(env);await db.prepare("UPDATE inventory_reservations SET state='released',updated_at=? WHERE key=? AND state='held' AND (session_id IS NULL OR session_id=?)").bind(new Date().toISOString(),key,sessionId).run();}
export async function recordPaidOrder(env,order,reservationKey){
 const db=await ensureLedger(env),now=new Date().toISOString();
 const previous=await db.prepare('SELECT data FROM order_records WHERE key=?').bind(order.sessionId).first();if(previous)return JSON.parse(previous.data);
 // A missing/legacy reservation is conservatively recorded and put on hold.
 // Paid stock is never silently omitted, even if the event arrives very late.
 const r=await reservationFor(env,reservationKey||'');
 const valid=r&&r.state==='held'&&r.sets===order.totalSets&&r.mode===(order.livemode?'live':'test')&&(!r.session_id||r.session_id===order.sessionId);
 if(!valid){
  order.fulfillment=order.livemode?'inventory_hold':'test_hold';order.holdReason='Inventory allocation needs reconciliation; do not dispatch';
 }
 const linked=await db.prepare('SELECT key FROM inventory_reservations WHERE session_id=?').bind(order.sessionId).first();
 const key=linked?.key||(valid?r.key:'paid-'+order.sessionId);
 await db.batch([
  db.prepare("INSERT INTO inventory_reservations(key,mode,sets,state,session_id,expires_at,created_at,updated_at) VALUES(?,?,?,'allocated',?,0,?,?) ON CONFLICT(key) DO UPDATE SET state='allocated',session_id=excluded.session_id,sets=excluded.sets,updated_at=excluded.updated_at WHERE inventory_reservations.state IN ('held','released') AND (inventory_reservations.session_id IS NULL OR inventory_reservations.session_id=excluded.session_id)").bind(key,order.livemode?'live':'test',order.totalSets,order.sessionId,now,now),
  db.prepare('INSERT OR IGNORE INTO order_records(key,data) VALUES(?,?)').bind(order.sessionId,JSON.stringify(order))
 ]);
 const saved=JSON.parse((await db.prepare('SELECT data FROM order_records WHERE key=?').bind(order.sessionId).first()).data);
 try{await env.ORDERS.put(order.sessionId,JSON.stringify(saved));}catch{ /* D1 preserves the paid record; ops reads D1. */ }
 return saved;
}
export function orderStore(env){return {
 async get(key){const db=await ensureLedger(env),r=await db.prepare('SELECT data FROM order_records WHERE key=?').bind(key).first();return r?JSON.parse(r.data):null;},
 async list(){const db=await ensureLedger(env),r=await db.prepare('SELECT key FROM order_records').all();return {blobs:r.results.map(r=>({key:r.key}))};},
 async setJSON(key,value){const db=await ensureLedger(env);await db.prepare('INSERT INTO order_records(key,data) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data').bind(key,JSON.stringify(value)).run();try{await env.ORDERS.put(key,JSON.stringify(value));}catch{}},
 async patch(key,values,{fulfillment=false}={}){const db=await ensureLedger(env);const pairs=Object.entries(values);const result=await db.prepare('UPDATE order_records SET data=json_set(data,'+pairs.map(()=>"?,json(?)").join(',')+') WHERE key=?'+(fulfillment?" AND json_extract(data,'$.livemode')=1 AND json_extract(data,'$.status') IN ('paid','fulfillment','completed') AND COALESCE(json_extract(data,'$.holdReason'),'')='' AND json_extract(data,'$.fulfillment') IN ('pending','fulfillment','completed')":'')).bind(...pairs.flatMap(([k,v])=>['$.'+k,JSON.stringify(v)]),key).run();if(result.meta.changes!==1)throw new Error('Order changed; refresh before updating fulfillment');const value=await this.get(key);try{await env.ORDERS.put(key,JSON.stringify(value));}catch{}return value;}
};}
export async function ledgerReservations(env){const db=await ensureLedger(env);const r=await db.prepare("SELECT * FROM inventory_reservations WHERE state='held' ORDER BY created_at DESC").all();return r.results.map(r=>({key:r.key,sets:r.sets,livemode:r.mode==='live',expiresAt:new Date(r.expires_at*1000).toISOString(),sessionId:r.session_id}));}
