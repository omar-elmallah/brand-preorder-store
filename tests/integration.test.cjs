const {test} = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {createRuntime} = require('../tools/runtime.cjs');

function checkout(runtime, changes={}) {
  const catalog = runtime.call('getCatalog');
  assert.equal(catalog.ok, true);
  runtime.ageToken(catalog.data.checkout.token);
  return {
    idempotency_key:crypto.randomUUID(), checkout_token:catalog.data.checkout.token, honeypot:'',
    customer:{name:'عميل مستقل للاختبار',phone:'01012345678',governorate_id:'demo-cairo',city:'القاهرة',address:'عنوان خاص للاختبار مبنى 12'},
    items:[{variant_id:'demo-black-M',quantity:2}],utm:{source:'integration',campaign:'launch'},...changes
  };
}
function accepted(runtime, payload=checkout(runtime)) {
  const result=runtime.call('submitOrder',payload);
  assert.equal(result.ok,true,JSON.stringify(result));
  return result.data;
}
function makeLive(runtime) {
  const c=runtime.context;
  for(const row of runtime.read('Products')) c.patch_('Products',row.id,{is_demo:false,name:'سويت شيرت حقيقي',material:'قطن معتمد',fit:'قصة معتمدة',description:'تفاصيل المنتج المعتمدة',image_urls:'["https://example.com/real-product.jpg"]'});
  for(const row of runtime.read('Variants')) c.patch_('Variants',row.id,{is_demo:false});
  for(const row of runtime.read('Shipping')) c.patch_('Shipping',row.id,{is_demo:false,delivery_days:'3–5 أيام بعد الشحن'});
  for(const row of runtime.read('SizeGuide')) c.patch_('SizeGuide',row.id,{is_demo:false});
  for(const [key,value] of Object.entries({brand_name:'BRAND TEST',real_content_confirmed:true,payment_method:'cod',shipping_expected:'2027-01-10',shipping_policy:'سياسة شحن معتمدة',exchange_policy:'سياسة استبدال معتمدة',return_policy:'سياسة استرجاع معتمدة',contact_email:'store@example.test'})) runtime.setting(key,value);
}

test('setupStore reruns preserve the independent sheet, edited content, customer orders and unique seed IDs',()=>{
  const r=createRuntime(), firstId=r.state.props.STORE_SPREADSHEET_ID;
  r.setting('brand_name','اسم عدله عمر');
  r.context.patch_('Variants','demo-black-M',{price_minor:70123});
  const id=accepted(r).order_id;
  const names=['Products','Variants','SizeGuide','Orders','OrderItems','Shipping','Settings'];
  const before=Object.fromEntries(names.map(name=>[name,r.read(name)]));
  for(let i=0;i<2;i++)assert.equal(r.call('setupStore').ok,true);
  assert.equal(r.state.sheets.size,1);assert.equal(r.state.props.STORE_SPREADSHEET_ID,firstId);
  for(const name of names){assert.deepEqual(r.read(name),before[name]);const ids=r.read(name).map(row=>row.id||row.key);assert.equal(new Set(ids).size,ids.length,name);}
  assert.equal(r.read('Orders')[0].id,id);
  assert.equal(r.state.sheets.get(firstId).zone,'Africa/Cairo');
});

test('foreign sheet marker fails closed before setup mutates existing tables',()=>{
  const r=createRuntime();const ss=r.state.sheets.get(r.state.props.STORE_SPREADSHEET_ID);
  const before=JSON.stringify(Array.from(ss.tabs,([name,tab])=>[name,tab.data]));
  ss.meta=[];r.context.storeCache_=undefined;
  const result=r.call('setupStore');assert.equal(result.ok,false);assert.equal(result.error.code,'WRONG_STORE');
  assert.equal(JSON.stringify(Array.from(ss.tabs,([name,tab])=>[name,tab.data])),before);
  assert.equal(r.state.sheets.size,1);
});

test('every privileged RPC rejects anonymous, unlisted and owner-execution identity mismatch',()=>{
  const cases=[{active:'',effective:'omar@example.test'},{active:'other@example.test',effective:'other@example.test'},{active:'mustafa@example.test',effective:'omar@example.test'}];
  const names=['getAdminDashboard','adminGetOrder','adminSetOrderStatus','adminRecordPayment','adminRecoverPending','adminUpdateSettings','setupStore'];
  for(const identity of cases){const r=createRuntime();Object.assign(r.state,identity);for(const name of names){const result=r.call(name,{});assert.equal(result.ok,false,name);assert.equal(result.error.code,'FORBIDDEN',name+' '+JSON.stringify(identity));}}
  const r=createRuntime();Object.assign(r.state,{active:'mustafa@example.test',effective:'mustafa@example.test'});assert.equal(r.call('getAdminDashboard',{}).ok,true);
});

test('public catalog stays available to anonymous owner-execution visitors and contains no customer records',()=>{
  const r=createRuntime(),id=accepted(r).order_id;
  Object.assign(r.state,{active:'',effective:'omar@example.test'});
  const result=r.call('getCatalog');assert.equal(result.ok,true);
  const publicJson=JSON.stringify(result);
  for(const privateValue of [id,'عميل مستقل للاختبار','01012345678','عنوان خاص للاختبار','idempotency_hash','customer_name','collected_minor'])assert.equal(publicJson.includes(privateValue),false,privateValue);
  assert.equal(result.data.product.id,'demo-sweatshirt');
});

test('default demo full path uses real storage, authoritative totals and isolated admin listing while real sales remain closed',()=>{
  const r=createRuntime();assert.equal(r.context.settings_().orders_open,false);
  const p=checkout(r);p.total_minor=1;p.shipping_minor=0;p.items[0].unit_price_minor=1;
  const result=accepted(r,p);assert.equal(result.mode,'demo');assert.equal(result.total_minor,136000);assert.equal(result.payment_status,'unpaid');
  const again=r.call('submitOrder',p);assert.equal(again.ok,true);assert.equal(again.data.order_id,result.order_id);
  const dashboard=r.call('getAdminDashboard',{mode:'demo'});assert.equal(dashboard.ok,true);assert.equal(dashboard.data.orders.length,1);assert.equal(dashboard.data.summary.unit_count,2);assert.equal(dashboard.data.summary.collected_minor,0);assert.equal(dashboard.data.summary.order_value_minor,136000);
  assert.equal(r.call('getAdminDashboard',{mode:'live'}).data.orders.length,0);
  assert.equal(r.call('adminGetOrder',result.order_id).data.items[0].unit_price_minor,65000);
});

test('formula-like customer input is stored as literal text and the address remains private',()=>{
  const r=createRuntime(),p=checkout(r);p.customer.name='=IMPORTXML("private","x")';p.customer.address=' +HYPERLINK("private")';
  accepted(r,p);
  assert.equal(r.read('Orders')[0].customer_name,p.customer.name);assert.equal(r.read('Orders')[0].address,p.customer.address.trim());
  assert.equal(r.context.safeCell_(' \t=1+1'),"' \t=1+1");assert.equal(r.context.safeCell_('@SUM(1)'),"'@SUM(1)");assert.equal(r.context.safeCell_(123),123);
});

test('actual Storage rebuilds interrupted orders without attempting to overwrite the primary key',()=>{
  const r=createRuntime(),p=checkout(r),insert=r.context.insert_;let failOnce=true;
  r.context.insert_=function(name,row){if(name==='OrderItems'&&failOnce){failOnce=false;throw Error('INTERRUPTED_ITEM_WRITE');}return insert(name,row);};
  assert.equal(r.call('submitOrder',p).ok,false);assert.equal(r.read('Orders')[0].transaction_state,'pending');
  const retried=accepted(r,p);assert.equal(r.read('Orders').length,1);assert.equal(r.read('OrderItems').length,1);assert.equal(r.read('Orders')[0].id,retried.order_id);assert.equal(r.context.usedCapacity_('demo-black-M','demo'),2);
});

test('server launch gate blocks incomplete live data and permits a reviewed COD order without marking it collected',()=>{
  const r=createRuntime();r.setting('test_mode',false);r.setting('orders_open',true);
  const blocked=r.call('submitOrder',checkout(r));assert.equal(blocked.ok,false);assert.equal(blocked.error.code,'LAUNCH_NOT_READY');assert.equal(r.read('Orders').length,0);
  r.setting('orders_open',false);makeLive(r);
  const launch=r.call('adminUpdateSettings',{values:{test_mode:false,orders_open:true}});assert.equal(launch.ok,true,JSON.stringify(launch));assert.equal(launch.data.readiness.ready,true);
  const order=accepted(r);assert.equal(order.mode,'live');assert.equal(order.payment_status,'unpaid');assert.equal(r.read('Orders')[0].payment_method,'cod');assert.equal(r.read('Orders')[0].collected_minor,0);
});

test('admin wrappers record partial payment once, keep financial state separate and release cancelled capacity once',()=>{
  const r=createRuntime(),id=accepted(r).order_id;
  const payment={order_id:id,amount_minor:20000,kind:'collect',note:'مرجع اختبار',mutation_key:'payment-unique-integration-001'};
  const first=r.call('adminRecordPayment',payment);assert.equal(first.ok,true,JSON.stringify(first));assert.equal(first.data.order.payment_status,'partial');assert.equal(first.data.order.order_status,'new');
  assert.equal(r.call('adminRecordPayment',payment).data.order.collected_minor,20000);
  assert.equal(r.call('adminRecordPayment',{...payment,amount_minor:21000}).error.code,'IDEMPOTENCY_CONFLICT');
  assert.equal(r.call('adminRecordPayment',{...payment,mutation_key:''}).ok,false);
  const cancel=r.call('adminSetOrderStatus',{order_id:id,status:'cancelled'});assert.equal(cancel.ok,true);assert.equal(cancel.data.order.payment_status,'partial');
  assert.equal(r.call('adminSetOrderStatus',{order_id:id,status:'cancelled'}).ok,true);assert.equal(r.context.usedCapacity_('demo-black-M','demo'),0);
  assert.equal(r.call('adminSetOrderStatus',{order_id:id,status:'new'}).error.code,'INVALID_TRANSITION');
  const refund=r.call('adminRecordPayment',{...payment,kind:'refund',mutation_key:'refund-unique-integration-001'});assert.equal(refund.ok,true);assert.equal(refund.data.order.payment_status,'refunded');
  const journal=r.read('AuditLog').filter(row=>row.action==='ADMIN_MUTATION_APPLIED');assert.equal(journal.length,3);
  const auditText=JSON.stringify(journal);assert.equal(auditText.includes('01012345678'),false);assert.equal(auditText.includes('عنوان خاص للاختبار'),false);assert.equal(auditText.includes('مرجع اختبار'),false);
});

test('interrupted admin payment journal recovers using actual per-cell Storage writes',()=>{
  const r=createRuntime(),id=accepted(r).order_id,ss=r.state.sheets.get(r.state.props.STORE_SPREADSHEET_ID),sheet=ss.getSheetByName('Orders'),getRange=sheet.getRange;
  const statusCol=r.context.headers_(sheet).indexOf('payment_status')+1;let failOnce=true;
  sheet.getRange=function(...args){const range=getRange.apply(this,args),setValue=range.setValue;range.setValue=function(value){if(failOnce&&args[1]===statusCol&&value==='partial'){failOnce=false;throw Error('INTERRUPTED_PAYMENT_STATUS');}return setValue.call(this,value);};return range;};
  const payload={order_id:id,amount_minor:20000,kind:'collect',note:'journal',mutation_key:'payment-journal-integration-001'};
  assert.equal(r.call('adminRecordPayment',payload).ok,false);assert.equal(r.read('Orders')[0].collected_minor,20000);assert.equal(r.read('AuditLog').some(row=>row.action==='ADMIN_MUTATION_PENDING'),true);
  const retried=r.call('adminRecordPayment',payload);assert.equal(retried.ok,true,JSON.stringify(retried));assert.equal(retried.data.order.collected_minor,20000);assert.equal(retried.data.order.payment_status,'partial');assert.equal(r.read('AuditLog').some(row=>row.action==='ADMIN_MUTATION_PENDING'),false);
});
