const {test} = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {createRuntime} = require('../tools/runtime.cjs');

const copy = value => JSON.parse(JSON.stringify(value));
function bound(runtime) { return runtime.state.activeSpreadsheet; }
function snapshot(runtime, ss=bound(runtime)) {
  return copy({props:runtime.state.props,metadata:ss.getDeveloperMetadata().map(m=>[m.getKey(),m.getValue()]),timezone:ss.zone,
    sheets:ss.getSheets().map(s=>({name:s.getName(),data:s.data,numberFormats:s.numberFormats,validations:s.validations,styles:s.styles,frozenRows:s.frozenRows,maxRows:s.getMaxRows(),maxColumns:s.getMaxColumns(),gridChanges:s.gridChanges}))});
}
function watchWrites(runtime, ss=bound(runtime)) {
  const calls=[];
  function wrap(obj,name) {
    if(typeof obj[name]!=='function')return;
    const original=obj[name];obj[name]=function(...args){calls.push(name);return original.apply(this,args);};
  }
  for(const name of ['addDeveloperMetadata','setSpreadsheetTimeZone','insertSheet','deleteSheet','rename','setName'])wrap(ss,name);
  for(const sheet of ss.getSheets()){
    for(const name of ['setFrozenRows','deleteRow','insertRow','insertColumnsAfter','insertRowsAfter','setName'])wrap(sheet,name);
    const original=sheet.getRange;
    sheet.getRange=function(...args){const range=original.apply(this,args);for(const name of ['setValue','setValues','setNumberFormat','setFontWeight','setBackground','setDataValidation','clearDataValidations','clearContent'])wrap(range,name);return range;};
  }
  const properties=runtime.context.PropertiesService.getScriptProperties;
  runtime.context.PropertiesService.getScriptProperties=function(){const p=properties();for(const name of ['setProperty','setProperties','deleteProperty'])wrap(p,name);return p;};
  return calls;
}
function setupRejectsWithoutWrites(runtime, expectedCode) {
  const ss=bound(runtime),before=snapshot(runtime,ss),writes=watchWrites(runtime,ss);
  assert.throws(()=>runtime.call('setupStore'),error=>typeof error.safeCode==='string'&&(!expectedCode||error.safeCode===expectedCode));
  assert.deepEqual(writes,[],'Setup must finish the complete preflight before any mutation');
  assert.deepEqual(snapshot(runtime,ss),before);
}
function checkout(runtime) {
  const catalog=runtime.call('getCatalog');assert.equal(catalog.ok,true,JSON.stringify(catalog));
  runtime.ageToken(catalog.data.checkout.token);
  return {idempotency_key:crypto.randomUUID(),checkout_token:catalog.data.checkout.token,honeypot:'',
    customer:{name:'اختبار ربط مستقل',phone:'01012345678',governorate_id:'demo-cairo',city:'القاهرة',address:'عنوان تجريبي لاختبار ربط الشيت'},items:[{variant_id:'demo-black-M',quantity:1}],utm:{source:'bound-test'}};
}
function effectiveRecord(records,row,col) {
  return records.filter(r=>row>=r.row&&row<r.row+r.height&&col>=r.col&&col<r.col+r.width).at(-1);
}
function ruleFor(runtime,name,key,row=2) {
  const ss=bound(runtime),sheet=ss.getSheetByName(name),col=runtime.context.STORE_.schemas[name].indexOf(key)+1;
  assert.ok(col>0,'Known schema column '+name+'.'+key);
  const record=effectiveRecord(sheet.validations,row,col);
  assert.ok(record,'Validation exists for '+name+'.'+key+' row '+row);
  assert.equal(record.rule.allowInvalid,false,'Invalid input must be rejected for '+name+'.'+key);
  return record.rule;
}
function formatFor(runtime,name,key,row=2) {
  const sheet=bound(runtime).getSheetByName(name),col=runtime.context.STORE_.schemas[name].indexOf(key)+1;
  return effectiveRecord(sheet.numberFormats,row,col)?.format;
}
function listValues(rule){assert.equal(rule.criteria,'list');return copy(rule.values).map(String);}
function assertBooleanRule(rule) {
  if(rule.criteria==='list') return assert.deepEqual(listValues(rule),['TRUE','FALSE']);
  assert.equal(rule.criteria,'formula');assert.match(rule.formula,/ISLOGICAL/i);assert.match(rule.formula,/\"TRUE\"/);assert.match(rule.formula,/\"FALSE\"/);
}
function settingRow(runtime,key){const data=bound(runtime).getSheetByName('Settings').data;const i=data.findIndex(row=>row[0]===key);assert.ok(i>=1);return i+1;}

test('first setup binds the active spreadsheet instead of creating or opening another workbook',()=>{
  const r=createRuntime({setup:false}),ss=bound(r),id=ss.getId(),existingNames=ss.getSheets().map(s=>s.getName());
  r.call('setupStore');
  assert.equal(id,'local-bound-sheet');assert.equal(r.state.props.STORE_SPREADSHEET_ID,id);
  assert.deepEqual(r.state.creates,[]);assert.deepEqual(r.state.opens,[]);
  assert.equal(r.state.sheets.size,1);assert.equal(r.context.getStore_().getId(),id);
  assert.ok(ss.getDeveloperMetadata().some(m=>m.getKey()===r.context.STORE_.marker&&m.getValue()===r.context.ScriptApp.getScriptId()));
  assert.equal(ss.zone,'Africa/Cairo');
  for(const name of existingNames)assert.ok(ss.getSheetByName(name),'Existing blank tabs are retained');
  for(const [name,columns] of Object.entries(r.context.STORE_.schemas))assert.deepEqual(copy(ss.getSheetByName(name).getRange(1,1,1,columns.length).getValues()[0]),copy(columns));
  assert.equal(r.read('Orders').length,0);assert.equal(r.read('OrderItems').length,0);
  assert.equal(r.context.settings_().test_mode,true);assert.equal(r.context.settings_().orders_open,false);
});

test('rerun retains edited defaults, product values, customer orders and the same tab set',()=>{
  const r=createRuntime(),ss=bound(r),id=ss.getId();r.setting('brand_name','اسم عدله عمر');r.setting('max_order_qty',4);
  r.context.patch_('Variants','demo-black-M',{price_minor:70123});
  const order=r.call('submitOrder',checkout(r));assert.equal(order.ok,true,JSON.stringify(order));
  const names=ss.getSheets().map(s=>s.getName()),tables=['Products','Variants','SizeGuide','Orders','OrderItems','Shipping','Settings'];
  const before=Object.fromEntries(tables.map(name=>[name,r.read(name)]));
  r.call('setupStore');r.call('setupStore');
  assert.deepEqual(ss.getSheets().map(s=>s.getName()),names);assert.equal(r.state.props.STORE_SPREADSHEET_ID,id);assert.deepEqual(r.state.creates,[]);
  for(const name of tables){assert.deepEqual(r.read(name),before[name],name);const keys=r.read(name).map(o=>o.id||o.key);assert.equal(keys.length,new Set(keys).size,name+' IDs are unique');}
  assert.equal(r.read('Orders')[0].id,order.data.order_id);
});

for(const [kind,change] of Object.entries({
  reordered:columns=>{[columns[1],columns[2]]=[columns[2],columns[1]];return columns;},
  missing:columns=>columns.slice(0,-1),extra:columns=>[...columns,'unexpected_header'],duplicate:columns=>{columns[columns.length-1]=columns[0];return columns;}
}))test('late incompatible '+kind+' schema aborts setup before metadata, properties, data, formats or earlier tables change',()=>{
  const r=createRuntime({setup:false}),ss=bound(r);
  ss.addDeveloperMetadata(r.context.STORE_.marker,r.context.ScriptApp.getScriptId());
  const columns=copy(r.context.STORE_.schemas.AuditLog);
  ss.insertSheet('Products').getRange(1,1,1,r.context.STORE_.schemas.Products.length).setValues([copy(r.context.STORE_.schemas.Products)]);
  const broken=change(columns);ss.insertSheet('AuditLog').getRange(1,1,1,broken.length).setValues([broken]);
  setupRejectsWithoutWrites(r,'SCHEMA');
  assert.equal(r.state.props.STORE_SPREADSHEET_ID,undefined);assert.deepEqual(r.state.opens,[]);assert.deepEqual(r.state.creates,[]);
});

test('an unmarked nonempty active workbook is untouched and never adopted',()=>{
  const r=createRuntime({setup:false}),ss=bound(r),sheet=ss.getSheets()[0]||ss.insertSheet('Unrelated');
  sheet.getRange(1,1,1,2).setValues([['UNRELATED FIXTURE','do not replace']]);
  setupRejectsWithoutWrites(r);assert.equal(r.state.props.STORE_SPREADSHEET_ID,undefined);assert.deepEqual(r.state.opens,[]);assert.deepEqual(r.state.creates,[]);
});

test('conflicting ownership marker rejects without opening any configured foreign workbook',()=>{
  const r=createRuntime({setup:false}),ss=bound(r);ss.addDeveloperMetadata(r.context.STORE_.marker,'ANOTHER-SYNTHETIC-SCRIPT');
  setupRejectsWithoutWrites(r);assert.deepEqual(r.state.opens,[]);assert.deepEqual(r.state.creates,[]);
});

test('saved spreadsheet id differing from the active bound workbook rejects before foreign open',()=>{
  const r=createRuntime({setup:false});r.state.props.STORE_SPREADSHEET_ID='foreign-synthetic-sheet';
  setupRejectsWithoutWrites(r);assert.deepEqual(r.state.opens,[]);assert.deepEqual(r.state.creates,[]);
});

test('setup without an active bound spreadsheet fails and cannot silently create a new spreadsheet',()=>{
  const r=createRuntime({setup:false});r.state.activeSpreadsheet=null;
  assert.throws(()=>r.call('setupStore'),error=>typeof error.safeCode==='string');
  assert.equal(r.state.props.STORE_SPREADSHEET_ID,undefined);assert.deepEqual(r.state.creates,[]);assert.deepEqual(r.state.opens,[]);
});

test('web execution uses the saved marked spreadsheet when getActiveSpreadsheet is null',()=>{
  const r=createRuntime(),id=bound(r).getId();r.state.activeSpreadsheet=null;r.context.storeCache_=undefined;
  const payload=checkout(r),result=r.call('submitOrder',payload);assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.data.mode,'demo');assert.equal(result.data.total_minor,71000);
  assert.ok(r.state.opens.includes(id));assert.equal(r.state.opens.some(opened=>opened!==id),false);assert.deepEqual(r.state.creates,[]);
  assert.equal(r.call('adminGetOrder',result.data.order_id).data.order.id,result.data.order_id);
});

test('bound setup installs restrictive boolean and enum validation in catalog, shipping and operation fields',()=>{
  const r=createRuntime();
  for(const [name,key]of [['Products','active'],['Products','is_demo'],['Variants','active'],['Variants','is_demo'],['Shipping','active'],['Shipping','is_demo'],['SizeGuide','is_demo']])assertBooleanRule(ruleFor(r,name,key));
  const expected={order_status:['new','confirmed','preparing','shipped','delivered','cancelled','returned'],payment_status:['unpaid','partial','paid','refunded'],payment_method:['demo','cod','manual_transfer'],mode:['demo','live']};
  for(const [field,values]of Object.entries(expected))assert.deepEqual(listValues(ruleFor(r,'Orders',field)),values);
  for(const key of ['test_mode','orders_open','real_content_confirmed'])assertBooleanRule(ruleFor(r,'Settings','value',settingRow(r,key)));
  assert.deepEqual(listValues(ruleFor(r,'Settings','value',settingRow(r,'payment_method'))),expected.payment_method);
});

test('bound setup preserves numeric money/measurements and validates integer money, quantities and setting bounds',()=>{
  const r=createRuntime();
  for(const [name,key]of [['Variants','price_minor'],['Shipping','fee_minor'],['Variants','preorder_limit'],['OrderItems','quantity'],['Orders','total_minor']]){
    const rule=ruleFor(r,name,key),description=JSON.stringify(rule);
    assert.equal(rule.criteria,'formula',name+'.'+key+' must validate integers, not only a decimal range');
    assert.match(description,/ISNUMBER/i);assert.match(description,/(INT|MOD|TRUNC|FLOOR)/i);
  }
  for(const [key,min,max]of [['max_order_qty',1,20],['min_form_seconds',1,60],['global_orders_per_hour',1,300],['phone_orders_per_hour',1,20]]){
    const rule=ruleFor(r,'Settings','value',settingRow(r,key)),description=JSON.stringify(rule);
    assert.ok(rule.criteria==='formula'||rule.criteria==='numberBetween');
    if(rule.criteria==='numberBetween'){assert.equal(rule.min,min);assert.equal(rule.max,max);}
    else {assert.match(description,/(INT|MOD|TRUNC|FLOOR)/i);assert.match(description,new RegExp(String(max)));}
  }
  assert.equal(typeof r.read('Variants')[0].price_minor,'number');assert.equal(r.read('Variants')[0].price_minor,65000);
  assert.equal(typeof r.read('Shipping')[0].fee_minor,'number');assert.notEqual(formatFor(r,'Variants','price_minor'),'@');
  assert.equal(formatFor(r,'Orders','phone'),'@');assert.equal(formatFor(r,'Variants','id'),'@');
  assert.equal(formatFor(r,'Settings','value',settingRow(r,'shipping_expected')),'@');
  assert.equal(formatFor(r,'Settings','value',settingRow(r,'contact_phone')),'@');
});

test('duplicate Settings keys abort a rerun without changing any stored rows, metadata or formatting',()=>{
  const r=createRuntime(),sheet=bound(r).getSheetByName('Settings');
  sheet.getRange(sheet.getLastRow()+1,1,1,3).setValues([['brand_name','A conflicting value','synthetic fixture']]);
  setupRejectsWithoutWrites(r,'SCHEMA');
});

test('a populated row with a blank primary id is not silently skipped during setup preflight',()=>{
  const r=createRuntime(),sheet=bound(r).getSheetByName('Shipping');
  sheet.getRange(sheet.getLastRow()+1,1,1,6).setValues([['','Synthetic governorate',6000,'3 days',true,true]]);
  setupRejectsWithoutWrites(r,'SCHEMA');
});

test('a populated extra column beyond correct headers is rejected instead of being appended or ignored',()=>{
  const r=createRuntime(),sheet=bound(r).getSheetByName('AuditLog');
  sheet.getRange(2,r.context.STORE_.schemas.AuditLog.length+1).setValue('unexpected synthetic content');
  setupRejectsWithoutWrites(r,'SCHEMA');
});

test('rerun preserves custom number formats on populated own tabs while keeping values unchanged',()=>{
  const r=createRuntime(),sheet=bound(r).getSheetByName('Variants'),priceCol=r.context.STORE_.schemas.Variants.indexOf('price_minor')+1;
  sheet.getRange(2,priceCol,1,1).setNumberFormat('0" custom piastres"');
  r.call('setupStore');
  assert.equal(formatFor(r,'Variants','price_minor'),'0" custom piastres"');assert.equal(r.read('Variants')[0].price_minor,65000);
});

test('expected shipping date remains text and has calendar-aware ISO validation',()=>{
  const r=createRuntime(),row=settingRow(r,'shipping_expected'),rule=ruleFor(r,'Settings','value',row);
  assert.equal(rule.criteria,'formula');assert.match(rule.formula,/REGEXMATCH/i);assert.match(rule.formula,/DATE\(/i);
  assert.equal(formatFor(r,'Settings','value',row),'@');
});

test('interrupted initial seeding resumes in the same bound workbook without duplicating seeded rows',()=>{
  const r=createRuntime({setup:false}),id=bound(r).getId(),insert=r.context.insert_;let variantWrites=0;
  r.context.insert_=function(name,row){if(name==='Variants'&&++variantWrites===4)throw Error('SYNTHETIC_SETUP_INTERRUPT');return insert(name,row);};
  assert.throws(()=>r.call('setupStore'),error=>error.safeCode==='INTERNAL');
  assert.equal(r.state.props.STORE_SPREADSHEET_ID,id);assert.equal(r.state.props.STORE_INITIAL_SEED_PENDING,'true');
  assert.equal(r.read('Products').length,1);assert.equal(r.read('Variants').length,3);
  r.call('setupStore');
  assert.equal(r.state.props.STORE_INITIAL_SEED_PENDING,'false');assert.equal(r.state.props.STORE_INITIAL_SEED_COMPLETE,'true');
  assert.equal(r.read('Variants').length,8);assert.equal(new Set(r.read('Variants').map(row=>row.id)).size,8);
  assert.equal(r.read('SizeGuide').length,4);assert.equal(r.read('Shipping').length,2);assert.equal(r.read('Orders').length,0);assert.equal(r.read('OrderItems').length,0);
  assert.equal(r.state.sheets.size,1);assert.deepEqual(r.state.creates,[]);
});

test('completed setup does not resurrect a demo variant deliberately removed by an administrator',()=>{
  const r=createRuntime();r.context.removeBy_('Variants','id','demo-black-S');assert.equal(r.read('Variants').length,7);
  r.call('setupStore');
  assert.equal(r.read('Variants').length,7);assert.equal(r.read('Variants').some(row=>row.id==='demo-black-S'),false);
});

test('first setup expands the default 26-column grid for the full 28-column Orders schema',()=>{
  const r=createRuntime({setup:false}),ss=bound(r),blank=ss.getSheets()[0];
  assert.equal(blank.getMaxColumns(),26);
  r.call('setupStore');
  const orders=ss.getSheetByName('Orders'),width=r.context.STORE_.schemas.Orders.length;
  assert.equal(width,28);assert.ok(orders.getMaxColumns()>=width);assert.equal(orders.getLastColumn(),width);
  assert.equal(blank.getMaxColumns(),26,'The original blank tab is not resized');
  assert.equal(r.read('Orders').length,0);
});
