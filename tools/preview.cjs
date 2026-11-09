// Development preview: no Google connection; volatile, isolated demo orders only.
const http=require('node:http'); const fs=require('node:fs'); const path=require('node:path');
const {createRuntime}=require('./runtime.cjs');
const root=process.env.BRAND_STORE_SOURCE_DIR?path.resolve(process.env.BRAND_STORE_SOURCE_DIR):path.join(__dirname,'../src');
const runtime=createRuntime({sourceDir:root});
const allowed=new Set(['getCatalog','submitOrder','getAdminDashboard','adminGetOrder','adminSetOrderStatus','adminRecordPayment','adminUpdateSettings','adminRecoverPending']);
const transport=`<script>window.StoreTransport={request:async function(name,payload){const response=await fetch('/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,payload})});return response.json();}};</script>`;
function render(admin){let html=fs.readFileSync(path.join(root,admin?'Admin.html':'Index.html'),'utf8');html=html.replace(/<\?!=\s*include_\(['"](\w+)['"]\);?\s*\?>/g,(_,name)=>fs.readFileSync(path.join(root,name+'.html'),'utf8'));return html.replace('<head>','<head>'+transport).replace('<body>','<body><div style="background:#ecdcca;color:#382520;padding:8px;text-align:center;font:13px Arial" role="note">معاينة محلية — بيانات مؤقتة في الذاكرة — لا اتصال بـ Google ولا تسجيل دخول حقيقي'+(admin?' — صلاحية إدارة تجريبية تلقائية':'')+'</div>');}
const server=http.createServer(async(req,res)=>{try{
const pathname=new URL(req.url,'http://127.0.0.1').pathname;
if(req.method==='GET'&&(pathname==='/'||pathname==='/admin')){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(render(pathname==='/admin'));}
if(req.method==='POST'&&req.url==='/rpc'){let body='';for await(const chunk of req){body+=chunk;if(body.length>20000){res.writeHead(413);return res.end();}}const {name,payload}=JSON.parse(body);if(!allowed.has(name)){res.writeHead(404);return res.end();}
// Preview cannot be used to turn this process into a real store.
if(name==='adminUpdateSettings'&&payload?.values?.test_mode===false){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({ok:false,error:{code:'PREVIEW_ONLY',message:'هذه معاينة محلية تجريبية. إعداد البيع الحقيقي يتم داخل Google فقط.'}}));}
res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(runtime.call(name,payload)));}
res.writeHead(404);res.end('Not found');}catch(e){res.writeHead(500);res.end('Preview error');}});
server.listen(Number(process.env.PORT||8765),'127.0.0.1',()=>console.log('معاينة تجريبية: http://127.0.0.1:'+server.address().port+' | الإدارة: /admin | الذاكرة تُمسح عند الإيقاف'));
