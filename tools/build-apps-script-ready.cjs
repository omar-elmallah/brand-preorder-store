// Packaging for manual Apps Script copy/paste. This runs only for maintainers.
// The generated four editor files have no Node/npm/build dependency.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createRuntime}=require('./runtime.cjs');
const root=path.join(__dirname,'..'),src=path.join(root,'src'),out=path.join(root,'apps-script-ready');
function read(name){return fs.readFileSync(path.join(src,name),'utf8');}
const modules=['Config.gs','Storage.gs','Setup.gs','Domain.gs','Orders.gs','Catalog.gs','AdminApi.gs'];
let entry=read('Code.gs');
// The modular source has one trailing static include helper. The ready HTML
// already contains both includes, so this helper and its file references vanish.
const includeAt=entry.indexOf('\nfunction include_(');
if(includeAt<0||entry.slice(includeAt).match(/^function /gm)?.length!==1)throw Error('Review Code.gs include helper before packaging.');
entry=entry.slice(0,includeAt).trimEnd()+'\n';
const server='/** Ready for manual paste: all server modules. Generated from src; do not also copy src/*.gs. */\n'+modules.map(name=>'\n// ===== '+name+' =====\n'+read(name)).join('\n')+'\n// ===== Code.gs: routing =====\n'+entry;
let index=read('Index.html');
const includeNames=[];
index=index.replace(/<\?!=\s*include_\(['"](\w+)['"]\);?\s*\?>/g,(_,name)=>{if(!['Styles','Storefront'].includes(name))throw Error('Unexpected HTML include: '+name);includeNames.push(name);return read(name+'.html');});
if(includeNames.join(',')!=='Styles,Storefront'||/<\?/.test(index))throw Error('Unresolved Index template includes');
const admin=read('Admin.html');if(/<\?/.test(admin))throw Error('Unexpected Admin include');
new vm.Script(server,{filename:'apps-script-ready/Code.gs'});
for(const html of [index,admin])for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
const runtime=createRuntime(),schemas=JSON.parse(JSON.stringify(runtime.context.STORE_.schemas));
const descriptions={Products:'بيانات المنتج وصوره',Variants:'SKU والألوان والمقاسات والسعر والتفعيل والسعة',SizeGuide:'قياسات المقاسات بالسنتيمتر',Orders:'بيانات الطلبات؛ يكتبها التطبيق فقط',OrderItems:'نسخة تفاصيل وسعر القطع عند الطلب؛ يكتبها التطبيق',Shipping:'المحافظات ورسومها ومدة التوصيل',Settings:'الإعدادات التشغيلية والنصوص',AuditLog:'التغييرات الإدارية؛ يكتبها التطبيق'};
let schema='# الجداول الفعلية وترتيب الأعمدة\n\nمولّد من STORE_.schemas وبذور الإعداد في الكود نفسه. أسماء الجداول والأعمدة حساسة للحروف؛ لا تغيّر ترتيبها. الصف الأول للعناوين فقط. يوقف setupStore الإعداد قبل أي تعديل عند وجود جدول قديم غير مطابق، ويوقف الخادم استخدام جدول تغيرت بنيته. لا تحتاج إلى إنشاء أي جدول أو عنوان يدويًا.\n\n';
for(const [name,columns] of Object.entries(schemas)){
 schema+='## '+name+'\n\n'+descriptions[name]+'.\n\n| الترتيب | العمود |\n|---:|---|\n'+columns.map((c,i)=>'| '+(i+1)+' | `'+c+'` |').join('\n')+'\n\n';
}
schema+='## مفاتيح Settings\n\nالقيم التالية افتراضية وآمنة للتجربة. العملات أعداد صحيحة بالقرش المصري؛ 65000 = 650 جنيهًا. الأعلام Boolean أو النص الحرفي TRUE/FALSE. موعد shipping_expected نص YYYY-MM-DD.\n\n| key | القيمة الافتراضية | الوصف |\n|---|---|---|\n';
for(const setting of runtime.read('Settings'))schema+='| `'+setting.key+'` | '+(setting.value===''?'فارغ':'`'+String(setting.value).replaceAll('|','\\|')+'`')+' | '+String(setting.description).replaceAll('|','\\|')+' |\n';
schema+='\n## Script Properties\n\n- `STORE_ADMIN_EMAILS`: تضيفه يدويًا؛ حساب Google واحد أو حسابان فقط، بفاصلة إنجليزية.\n- `STORE_SPREADSHEET_ID`: تحفظه setupStore من الشيت المرتبط الحالي؛ لا تضفه أو تغيّره يدويًا. طلبات الويب تستخدم openById لهذا المعرف ولا تستخدم Active Spreadsheet.\n- `STORE_INITIAL_SEED_PENDING` و`STORE_INITIAL_SEED_COMPLETE`: علامتان داخليتان لاستكمال أول تهيئة بأمان ومنع إعادة بذور الكتالوج المحذوفة عمدًا. لا تعدلهما.\n\nتبويب Google الافتراضي الفارغ وأي تبويبات إضافية موجودة تظل كما هي؛ الجداول الثمانية أعلاه وحدها تخص التطبيق. لا توجد بيانات عملاء أو طلبات افتراضية. يبدأ AuditLog بسجل إعداد فعلي، وليس طلب عميل تجريبيًا.\n';
const manual=fs.readFileSync(path.join(root,'docs/MANUAL_SETUP.md'),'utf8');
const files={'Code.gs':server,'Index.html':index,'Admin.html':admin,'appsscript.json':read('appsscript.json'),'README.md':manual,'SCHEMA.md':schema};
if(process.argv.includes('--check')){
 const actual=fs.readdirSync(out).sort();if(JSON.stringify(actual)!==JSON.stringify(Object.keys(files).sort()))throw Error('Unexpected/missing ready-folder files');
 for(const [name,text]of Object.entries(files))if(fs.readFileSync(path.join(out,name),'utf8')!==text)throw Error('Ready folder stale: '+name);
 console.log('Ready folder matches source: 4 editor files, 2 Arabic guides, 8 schemas, 17 settings.');
}else{
 fs.mkdirSync(out,{recursive:true});for(const [name,text]of Object.entries(files))fs.writeFileSync(path.join(out,name),text);
 console.log('Generated apps-script-ready: '+Object.keys(files).join(', '));
}
