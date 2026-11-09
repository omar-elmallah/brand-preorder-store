const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
function environment() {
 const db={Products:[{id:'product',name:'تجريبي',active:true,is_demo:true}],Variants:[{id:'black-m',product_id:'product',color:'black',color_label:'أسود',size:'M',price_minor:100000,active:true,preorder_limit:3,is_demo:true}],Shipping:[{id:'cairo',governorate:'القاهرة',fee_minor:5000,delivery_days:'2-4',active:true,is_demo:true}],SizeGuide:[],Orders:[],OrderItems:[],AuditLog:[]};
 const settings={test_mode:true,orders_open:true,max_order_qty:5,min_form_seconds:1,phone_orders_per_hour:30,global_orders_per_hour:100};
 const cache=new Map(); let locked=false, fault=null;
 const context=vm.createContext({console,
  Utilities:{getUuid:()=>crypto.randomUUID()},CacheService:{getScriptCache:()=>({get:k=>cache.get(k),put:(k,v)=>cache.set(k,v)})},
  sha256_:s=>crypto.createHash('sha256').update(s).digest('hex'),
  fail_:(code,message)=>{throw Object.assign(new Error(message),{code});},isTrue_:v=>v===true || String(v).toLowerCase()==='true',
  settings_:()=>({...settings}), rows_:name=>structuredClone(db[name]),
  insert_:(name,obj)=>{if(fault && fault(name,obj,'insert'))throw new Error('SIMULATED_WRITE_FAILURE');if(db[name].some(r=>r.id===obj.id))throw new Error('duplicate');db[name].push(structuredClone(obj));},
  patch_:(name,id,fields)=>{const row=db[name].find(r=>r.id===id);if(!row)throw new Error('missing');Object.keys(fields).forEach(k=>{if(fault && fault(name,{[k]:fields[k]},'patch'))throw new Error('SIMULATED_WRITE_FAILURE');row[k]=structuredClone(fields[k]);});},
  removeBy_:(name,key,value)=>{db[name]=db[name].filter(r=>r[key]!==value);},flush_:()=>{},
  withLock_:fn=>{assert.equal(locked,false);locked=true;try{return fn();}finally{locked=false;}},
  apiResult_:fn=>{try{return{ok:true,data:fn()};}catch(e){return{ok:false,error:{code:e.code||'INTERNAL',message:e.code?e.message:'تعذر تنفيذ الطلب.'}};}}
 });
 for(const file of ['Domain.gs','Orders.gs'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../src',file),'utf8'),context);
 function payload(key='a'.repeat(32)) {const token=context.createCheckoutToken_().token;cache.set('checkout:'+context.sha256_(token),String(Date.now()-10000));return {idempotency_key:key,checkout_token:token,honeypot:'',customer:{name:'عميل تجريبي',phone:'01012345678',governorate_id:'cairo',city:'القاهرة',address:'شارع تجريبي مبنى 12'},items:[{variant_id:'black-m',quantity:1}],utm:{source:'test'}};}
 return {c:context,db,settings,payload,setFault:fn=>{fault=fn;}};
}
test('Complete demo order persists item snapshots and remains unpaid even with cod setting',()=>{
 const e=environment();e.settings.payment_method='cod';const p=e.payload();p.total_minor=1;
 const result=e.c.submitOrder(p);assert.equal(result.ok,true);assert.equal(result.data.total_minor,105000);assert.equal(result.data.mode,'demo');assert.equal(result.data.payment_status,'unpaid');
 assert.equal(e.db.Orders[0].transaction_state,'committed');assert.equal(e.db.OrderItems[0].unit_price_minor,100000);assert.equal(e.db.Orders[0].utm_source,'test');
 assert.equal(e.c.usedCapacity_('black-m','demo'),1);assert.equal(e.c.usedCapacity_('black-m','live'),0);
});
test('Identical retry returns original order even after catalogue changes; conflicting replay fails',()=>{
 const e=environment(),p=e.payload(),one=e.c.submitOrder(p);e.db.Variants[0].active=false;e.settings.orders_open=false;e.settings.test_mode=false;
 const two=e.c.submitOrder(p);assert.equal(two.ok,true);assert.equal(two.data.order_id,one.data.order_id);assert.equal(e.db.Orders.length,1);assert.equal(e.db.OrderItems.length,1);
 const bad=e.c.submitOrder({...p,customer:{...p.customer,name:'Changed'}});assert.equal(bad.error.code,'IDEMPOTENCY_CONFLICT');
});
test('Incomplete item write never succeeds; recovery rolls back and same key safely retries',()=>{
 const e=environment(),p=e.payload();let once=true;e.setFault((name,obj,op)=>name==='OrderItems'&&op==='insert'&&once?(once=false,true):false);
 assert.equal(e.c.submitOrder(p).ok,false);assert.equal(e.db.Orders[0].transaction_state,'pending');
 const retry=e.c.submitOrder(p);assert.equal(retry.ok,true);assert.equal(e.db.Orders.length,1);assert.equal(e.db.OrderItems.length,1);assert.equal(e.c.usedCapacity_('black-m','demo'),1);
});
test('Lost commit write recovers complete header/items and does not duplicate capacity',()=>{
 const e=environment(),p=e.payload();let once=true;e.setFault((name,obj,op)=>name==='Orders'&&obj.transaction_state==='committed'&&once?(once=false,true):false);
 assert.equal(e.c.submitOrder(p).ok,false);assert.equal(e.db.OrderItems.length,1);assert.equal(e.db.Orders[0].transaction_state,'pending');
 const retry=e.c.submitOrder(p);assert.equal(retry.ok,true);assert.equal(e.db.Orders.length,1);assert.equal(e.db.OrderItems.length,1);assert.equal(e.c.usedCapacity_('black-m','demo'),1);
});
test('Capacity blocks oversell; repeated cancellation restores capacity once and cannot reopen',()=>{
 const e=environment(),p=e.payload();p.items[0].quantity=3;const result=e.c.submitOrder(p);assert.equal(result.ok,true);
 assert.equal(e.c.submitOrder(e.payload('b'.repeat(32))).error.code,'CAPACITY');
 e.c.withLock_(()=>e.c.runOrderStatusChange_(result.data.order_id,'cancelled','owner@example.com'));
 e.c.withLock_(()=>e.c.runOrderStatusChange_(result.data.order_id,'cancelled','owner@example.com'));
 assert.equal(e.c.usedCapacity_('black-m','demo'),0);assert.throws(()=>e.c.runOrderStatusChange_(result.data.order_id,'new','owner@example.com'),error=>error.code==='INVALID_TRANSITION');
 assert.equal(e.c.submitOrder(e.payload('c'.repeat(32))).ok,true);
});
test('Token, honeypot, timing and persistent phone rate limits reject before any order write',()=>{
 for(const patch of [{checkout_token:'expired'},{honeypot:'robot'}]) {const e=environment();assert.equal(e.c.submitOrder({...e.payload(),...patch}).ok,false);assert.equal(e.db.Orders.length,0);}
 const e=environment();e.settings.min_form_seconds=60;assert.equal(e.c.submitOrder(e.payload()).error.code,'TOO_FAST');assert.equal(e.db.Orders.length,0);
 const rate=environment();rate.settings.phone_orders_per_hour=1;assert.equal(rate.c.submitOrder(rate.payload()).ok,true);assert.equal(rate.c.submitOrder(rate.payload('b'.repeat(32))).error.code,'RATE_LIMIT');
});
test('Real mode cannot accept demo data and closed store rejects new orders',()=>{
 const e=environment();e.settings.test_mode=false;assert.equal(e.c.submitOrder(e.payload()).error.code,'LAUNCH_NOT_READY');assert.equal(e.db.Orders.length,0);
 e.settings.orders_open=false;assert.equal(e.c.submitOrder(e.payload()).error.code,'ORDERS_CLOSED');
});
test('Admin partial collection/refund journal tracks funds separately with replay protection',()=>{
 const e=environment(),r=e.c.submitOrder(e.payload()),id=r.data.order_id;
 const a=e.c.withLock_(()=>e.c.recordPayment_(id,20000,'collect','deposit','owner@example.com','payment-key-0000000001'));assert.equal(a.collected_minor,20000);assert.equal(a.payment_status,'partial');
 const retry=e.c.withLock_(()=>e.c.recordPayment_(id,20000,'collect','deposit','owner@example.com','payment-key-0000000001'));assert.equal(retry.collected_minor,20000);
 assert.throws(()=>e.c.recordPayment_(id,20000,'refund','changed','owner@example.com','payment-key-0000000001'),error=>error.code==='IDEMPOTENCY_CONFLICT');
 assert.throws(()=>e.c.recordPayment_(id,20001,'refund','','owner@example.com','payment-key-0000000003'),error=>error.code==='VALIDATION');
 const refunded=e.c.withLock_(()=>e.c.recordPayment_(id,20000,'refund','','owner@example.com','payment-key-0000000002'));assert.equal(refunded.payment_status,'refunded');assert.equal(refunded.total_minor,105000);
 assert.equal(e.db.AuditLog.filter(r=>r.action==='ADMIN_MUTATION_APPLIED').length,2);
 assert.ok(!e.db.AuditLog.map(r=>r.changes_json).join('').includes('deposit'));
});
test('Interrupted administrative payment replays journal before any later mutation',()=>{
 const e=environment(),id=e.c.submitOrder(e.payload()).data.order_id;let once=true;
 e.setFault((name,obj,op)=>name==='Orders'&&obj.payment_status==='partial'&&once?(once=false,true):false);
 assert.throws(()=>e.c.withLock_(()=>e.c.recordPayment_(id,20000,'collect','','owner@example.com','payment-key-0000000001')));
 assert.equal(e.db.Orders[0].collected_minor,20000);assert.equal(e.db.AuditLog[0].action,'ADMIN_MUTATION_PENDING');
 const retry=e.c.withLock_(()=>e.c.recordPayment_(id,20000,'collect','','owner@example.com','payment-key-0000000001'));
 assert.equal(retry.collected_minor,20000);assert.equal(retry.payment_status,'partial');assert.equal(e.db.AuditLog[0].action,'ADMIN_MUTATION_APPLIED');
});

test('Financial server rejects missing mutation key before changing funds',()=>{const e=environment(),id=e.c.submitOrder(e.payload()).data.order_id;assert.throws(()=>e.c.recordPayment_(id,100,'collect','','owner@example.com'),error=>error.code==='VALIDATION');assert.equal(e.db.Orders[0].collected_minor,0);assert.equal(e.db.AuditLog.length,0);});

test('Mid-basket partial failure removes the first saved item before exact safe retry',()=>{
 const e=environment();e.db.Variants.push({...e.db.Variants[0],id:'burgundy-m',color:'burgundy',color_label:'برجندي'});
 const p=e.payload();p.items.push({variant_id:'burgundy-m',quantity:1});let once=true;
 e.setFault((name,obj,op)=>name==='OrderItems'&&obj.variant_id==='burgundy-m'&&once?(once=false,true):false);
 assert.equal(e.c.submitOrder(p).ok,false);assert.equal(e.db.OrderItems.length,1);
 const retry=e.c.submitOrder(p);assert.equal(retry.ok,true);assert.equal(e.db.Orders.length,1);assert.equal(e.db.OrderItems.length,2);
 assert.equal(e.c.usedCapacity_('black-m','demo'),1);assert.equal(e.c.usedCapacity_('burgundy-m','demo'),1);
});
test('Approved live COD stays unpaid; existing demo reservation does not consume live capacity',()=>{
 const e=environment();assert.equal(e.c.submitOrder(e.payload()).ok,true);
 Object.assign(e.settings,{test_mode:false,orders_open:true,brand_name:'Brand',real_content_confirmed:true,payment_method:'cod',shipping_expected:'2027-01-15',preorder_message:'طلب مسبق',shipping_policy:'معتمد',exchange_policy:'معتمد',return_policy:'معتمد',contact_email:'store@example.com'});
 Object.assign(e.db.Products[0],{is_demo:false,material:'قطن',fit:'واسعة',description:'منتج حقيقي',image_urls:'["https://example.com/product.jpg"]'});
 e.db.Variants[0].is_demo=false;e.db.Shipping[0].is_demo=false;e.db.SizeGuide.push({size:'M',chest_cm:55,length_cm:70,sleeve_cm:60,is_demo:false});
 const p=e.payload('live-key-00000000000001');p.items[0].quantity=3;const result=e.c.submitOrder(p);
 assert.equal(result.ok,true);assert.equal(result.data.mode,'live');assert.equal(result.data.payment_status,'unpaid');
 assert.equal(e.db.Orders[1].payment_method,'cod');assert.equal(e.db.Orders[1].collected_minor,0);
 assert.equal(e.c.usedCapacity_('black-m','live'),3);assert.equal(e.c.usedCapacity_('black-m','demo'),1);
});
