const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {createRuntime}=require('../tools/runtime.cjs');
const ready=path.join(__dirname,'../apps-script-ready');

test('four manual editor files are current, self-contained and use unique server function names',()=>{
 const check=spawnSync(process.execPath,[path.join(__dirname,'../tools/build-apps-script-ready.cjs'),'--check'],{encoding:'utf8'});
 assert.equal(check.status,0,check.stderr||check.stdout);
 assert.deepEqual(fs.readdirSync(ready).filter(p=>/\.(gs|html|json)$/.test(p)).sort(),['Admin.html','Code.gs','Index.html','appsscript.json']);
 const server=fs.readFileSync(path.join(ready,'Code.gs'),'utf8');
 const names=Array.from(server.matchAll(/^function\s+(\w+)\s*\(/gm),m=>m[1]);
 assert.equal(new Set(names).size,names.length,'No duplicate function declarations after merging modules');
 for(const html of ['Index.html','Admin.html']){
   const text=fs.readFileSync(path.join(ready,html),'utf8');
   assert.equal(/<\?/.test(text),false,'No unresolved server-side HTML includes');
   assert.equal(/src=["'][^"']*node_modules/.test(text),false);
 }
 assert.equal(/require\s*\(|module\.exports|import\s+.*from/.test(server),false,'No Node runtime dependency');
 const manifest=JSON.parse(fs.readFileSync(path.join(ready,'appsscript.json'),'utf8'));
 assert.equal(manifest.timeZone,'Africa/Cairo');assert.deepEqual(manifest.dependencies,{});
 const declared=new Set(names);
 for(const file of ['Index.html','Admin.html']){
   const text=fs.readFileSync(path.join(ready,file),'utf8');
   for(const match of text.matchAll(/(?:api|rpc|mutateOrder)\(['"]([a-zA-Z]\w+)['"]/g))assert.ok(declared.has(match[1]),file+' references available RPC '+match[1]);
 }
});

test('copy-ready server routes only the two delivered HTML files and still rejects unauthorized administration',()=>{
 const r=createRuntime({sourceDir:ready}),requested=[];
 function output(){return {setTitle(){return this;},addMetaTag(){return this;}};}
 r.context.HtmlService={createTemplateFromFile(name){assert.ok(['Index','Admin'].includes(name));assert.ok(fs.existsSync(path.join(ready,name+'.html')));requested.push(name);return {evaluate:output};},createHtmlOutput(){return output();}};
 r.call('doGet',{parameter:{}});r.call('doGet',{parameter:{admin:'1'}});assert.deepEqual(requested,['Index','Admin']);
 r.state.active='';r.state.effective='omar@example.test';r.call('doGet',{parameter:{admin:'1'}});assert.deepEqual(requested,['Index','Admin']);
 for(const method of ['getAdminDashboard','adminGetOrder','adminSetOrderStatus','adminRecordPayment','adminUpdateSettings','adminRecoverPending'])assert.equal(r.call(method,{}).error.code,'FORBIDDEN',method);
 assert.throws(()=>r.call('setupStore'),e=>e.safeCode==='FORBIDDEN');
});

test('copy-ready bundle completes demo checkout and administration with saved spreadsheet id and no active sheet',()=>{
 const r=createRuntime({sourceDir:ready});r.state.activeSpreadsheet=null;r.context.storeCache_=undefined;
 const reads=r.state.activeReads,catalog=r.call('getCatalog');assert.equal(catalog.ok,true,JSON.stringify(catalog));r.ageToken(catalog.data.checkout.token);
 const payload={idempotency_key:crypto.randomUUID(),checkout_token:catalog.data.checkout.token,honeypot:'',customer:{name:'اختبار الحزمة',phone:'01055550004',governorate_id:'demo-cairo',city:'القاهرة',address:'عنوان تجريبي لحزمة النسخ اليدوي'},items:[{variant_id:'demo-burgundy-L',quantity:2}],utm:{source:'ready-bundle'}};
 const result=r.call('submitOrder',payload);assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.data.total_minor,136000);assert.equal(result.data.payment_status,'unpaid');assert.equal(result.data.mode,'demo');
 assert.equal(r.call('submitOrder',payload).data.order_id,result.data.order_id);
 const detail=r.call('adminGetOrder',result.data.order_id);assert.equal(detail.ok,true);assert.equal(detail.data.items.length,1);assert.equal(detail.data.items[0].size,'L');
 assert.equal(r.call('getAdminDashboard',{mode:'demo'}).data.orders.length,1);assert.equal(r.state.activeReads,reads,'Web RPCs must not call getActiveSpreadsheet');
});
