const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = vm.createContext({console, fail_(code,message){throw Object.assign(new Error(message),{code});}, isTrue_(v){return v === true || String(v).toLowerCase() === 'true';}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/Domain.gs'),'utf8'),context);
const {normalizePhone_,validateCustomer_,calculateOrder_,readiness_,paymentState_} = context;
const products=[{id:'sweatshirt',name:'Sweatshirt',active:true,is_demo:true}];
const variants=[{id:'black-m',product_id:'sweatshirt',color:'black',color_label:'أسود',size:'M',price_minor:79950,active:true,is_demo:true}];
const shipping={id:'cairo',active:true,fee_minor:5550,delivery_days:'2–4',is_demo:true};
test('Egyptian phones normalize local, international and Arabic numerals',()=>{
  ['01012345678','+20 1012345678','00201012345678','201012345678','٠١٠١٢٣٤٥٦٧٨'].forEach(phone=>assert.equal(normalizePhone_(phone),'01012345678'));
  ['123','011111111111','01912345678','=1+1','+2010123456789'].forEach(phone=>assert.throws(()=>normalizePhone_(phone),e=>e.code==='PHONE_INVALID'));
});
test('Server totals use integer piastres and approved SKU prices',()=>{
 const result=calculateOrder_([{variant_id:'black-m',quantity:2,price_minor:1}],variants,products,shipping,'demo',5);
 assert.equal(result.subtotal_minor,159900);assert.equal(result.shipping_minor,5550);assert.equal(result.total_minor,165450);
 assert.equal(result.items[0].unit_price_minor,79950);
});
test('Rejects unknown/inactive SKU, invalid quantities and duplicate item quantity bypass',()=>{
 [0,-1,1.5,'2',NaN,6].forEach(quantity=>assert.throws(()=>calculateOrder_([{variant_id:'black-m',quantity}],variants,products,shipping,'demo',5)));
 assert.throws(()=>calculateOrder_([{variant_id:'bad',quantity:1}],variants,products,shipping,'demo',5),e=>e.code==='UNAVAILABLE');
 assert.throws(()=>calculateOrder_([{variant_id:'black-m',quantity:3},{variant_id:'black-m',quantity:3}],variants,products,shipping,'demo',5));
 assert.throws(()=>calculateOrder_([{variant_id:'black-m',quantity:1}],[{...variants[0],active:false}],products,shipping,'demo',5));
 assert.throws(()=>calculateOrder_([{variant_id:'black-m',quantity:1}],variants,products,shipping,'live',5));
});
test('Customer validation rejects missing, excessive and control-character fields',()=>{
 const valid={name:'عمر أحمد',phone:'01012345678',governorate_id:'cairo',city:'القاهرة',address:'شارع مثال مبنى 12'};
 assert.equal(validateCustomer_(valid).notes,'');
 for(const patch of [{name:''},{address:'short'},{notes:'x'.repeat(501)},{city:'bad\u0000data'}]) assert.throws(()=>validateCustomer_({...valid,...patch}),e=>e.code==='VALIDATION');
});
test('Launch gate blocks genuine ordering with demo data or incomplete configuration',()=>{
 assert.equal(readiness_({test_mode:true},products,variants,[shipping]).ready,false);
 const gate=readiness_({test_mode:false,brand_name:'BRAND NAME'},products,variants,[shipping],[]);
 assert.equal(gate.ready,false);assert.ok(gate.issues.length>=7);
});
test('Collection is separate from order value and refund state reflects net funds',()=>{
 assert.equal(paymentState_(10000,0,0),'unpaid'); assert.equal(paymentState_(10000,2000,0),'partial');
 assert.equal(paymentState_(10000,10000,0),'paid');assert.equal(paymentState_(10000,10000,10000),'refunded');
 assert.equal(paymentState_(10000,10000,3000),'partial');
});

test('Live gate requires real HTTPS image array and complete real size measurements',()=>{
 const settings={brand_name:'Brand',real_content_confirmed:true,payment_method:'cod',shipping_expected:'2027-01-15',preorder_message:'طلب مسبق',shipping_policy:'معتمد',exchange_policy:'معتمد',return_policy:'معتمد',contact_email:'team@example.com'};
 const prod=[{...products[0],is_demo:false,description:'وصف',material:'قطن',fit:'واسعة',image_urls:'[\"https://example.com/product.jpg\"]'}];
 const vars=[{...variants[0],is_demo:false}],ship=[{...shipping,is_demo:false}],guide=[{size:'M',chest_cm:55,length_cm:70,sleeve_cm:62,is_demo:false}];
 assert.equal(readiness_(settings,prod,vars,ship,guide).ready,true);
 for(const image_urls of ['[]','[\"javascript:alert(1)\"]','[\"https://\"]','invalid']) assert.equal(readiness_(settings,[{...prod[0],image_urls}],vars,ship,guide).ready,false);
 assert.equal(readiness_(settings,prod,vars,ship,[{...guide[0],chest_cm:0}]).ready,false);
});
