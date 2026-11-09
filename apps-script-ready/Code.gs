/** Ready for manual paste: all server modules. Generated from src; do not also copy src/*.gs. */

// ===== Config.gs =====
/** Independent preorder store. All money is integer EGP piastres. */
var STORE_ = Object.freeze({
  timezone: 'Africa/Cairo', marker: 'INDEPENDENT_BRAND_STORE_SCRIPT',
  schemas: {
    Products: ['id','name','description','material','fit','image_urls','active','is_demo'],
    Variants: ['id','product_id','color','color_label','size','price_minor','active','preorder_limit','is_demo'],
    SizeGuide: ['id','size','chest_cm','length_cm','sleeve_cm','notes','is_demo'],
    Orders: ['id','created_at','updated_at','customer_name','phone','governorate_id','city','address','notes','subtotal_minor','shipping_minor','total_minor','payment_method','payment_status','collected_minor','refunded_minor','order_status','mode','idempotency_hash','payload_hash','transaction_state','item_count','utm_source','utm_medium','utm_campaign','utm_term','utm_content','capacity_released'],
    OrderItems: ['id','order_id','variant_id','product_id','product_name','color','color_label','size','quantity','unit_price_minor','line_total_minor','mode'],
    Shipping: ['id','governorate','fee_minor','delivery_days','active','is_demo'],
    Settings: ['key','value','description'],
    AuditLog: ['id','created_at','actor','action','entity_id','changes_json']
  },
  publicSettings: ['brand_name','brand_description','test_mode','orders_open','payment_method','shipping_expected','preorder_message','shipping_policy','exchange_policy','return_policy','contact_phone','contact_email'],
  editableSettings: ['brand_name','brand_description','test_mode','orders_open','payment_method','shipping_expected','preorder_message','shipping_policy','exchange_policy','return_policy','contact_phone','contact_email','real_content_confirmed','max_order_qty','min_form_seconds','global_orders_per_hour','phone_orders_per_hour']
});
function fail_(code, message) { var e = new Error(message); e.safeCode = code; throw e; }
function apiResult_(fn) {
  try { return {ok: true, data: fn()}; }
  catch (e) { return {ok: false, error: {code: e.safeCode || 'INTERNAL', message: e.safeCode ? e.message : 'تعذر إتمام العملية. أعد المحاولة بنفس بيانات الطلب، أو تواصل مع الإدارة.'}}; }
}
function isTrue_(v) { return v === true || v === 'true' || v === 'TRUE'; }
function text_(v, max) {
  if (typeof v !== 'string' || v.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)) fail_('VALIDATION', 'راجع الحقول وأطوال النصوص.');
  return v.trim();
}
function sha256_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8).map(function(b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) fail_('BUSY', 'المتجر مشغول الآن. أعد المحاولة بنفس الطلب.');
  try { return fn(); } finally { lock.releaseLock(); }
}
/** Accessing-user deployment only. Blank identities and owner impersonation fail closed. */
function requireAdmin_() {
  var raw = PropertiesService.getScriptProperties().getProperty('STORE_ADMIN_EMAILS') || '';
  var allowed = raw.split(',').map(function(s) { return s.trim().toLowerCase(); }).filter(Boolean);
  var active = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  var effective = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  if (!allowed.length || allowed.length > 2 || !active || active !== effective || allowed.indexOf(active) < 0) fail_('FORBIDDEN', 'الدخول متاح لعمر ومصطفى عبر نشر الإدارة وحساب Google المصرح له فقط.');
  return active;
}
function audit_(actor, action, entityId, changes) {
  insert_('AuditLog', {id: Utilities.getUuid(), created_at: new Date().toISOString(), actor: actor, action: action, entity_id: entityId, changes_json: JSON.stringify(changes || {})});
  flush_();
}


// ===== Storage.gs =====
var storeCache_;
function getStore_() {
  var id = PropertiesService.getScriptProperties().getProperty('STORE_SPREADSHEET_ID');
  if (!id) fail_('NOT_CONFIGURED', 'لم يكتمل إعداد المتجر. شغّل setupStore من محرر Apps Script المرتبط بالشيت الجديد.');
  // Runtime deliberately never uses getActiveSpreadsheet: web apps have no active Sheet.
  var ss = storeCache_ && storeCache_.getId() === id ? storeCache_ : SpreadsheetApp.openById(id);
  var scriptId = ScriptApp.getScriptId();
  var markers = ss.getDeveloperMetadata().filter(function(m) { return m.getKey() === STORE_.marker; });
  if (!markers.some(function(m) { return m.getValue() === scriptId; }) || markers.some(function(m) { return m.getValue() !== scriptId; }))
    fail_('WRONG_STORE', 'هذا الشيت لا يخص مشروع المتجر المستقل. لم يتم تعديله.');
  storeCache_ = ss;
  return ss;
}
/** Exact structure only: setup never repairs or reorders a populated table. */
function assertSheetSchema_(sheet,name,checkRows) {
  var expected=STORE_.schemas[name], width=sheet.getLastColumn(), head=headers_(sheet);
  if (width!==expected.length || head.length!==expected.length)
    fail_('SCHEMA','جدول '+name+': يجب أن يحتوي صف العناوين على '+expected.length+' أعمدة بالترتيب التالي: '+expected.join(', ')+'. لم يُعدّل الجدول.');
  for (var i=0;i<expected.length;i++) if (head[i]!==expected[i])
    fail_('SCHEMA','جدول '+name+': العمود '+(i+1)+' يجب أن يكون '+expected[i]+'. أصلح صف العناوين دون نقل أو حذف البيانات.');
  if (checkRows && sheet.getLastRow()>1) assertPrimaryRows_(sheet.getRange(2,1,sheet.getLastRow()-1,width).getValues(),name);
}
function assertPrimaryRows_(data,name) {
  var ids=Object.create(null);
  data.forEach(function(row,index) {
    var hasContent=row.some(function(value) { return value!=='' && value!==null && value!==undefined; });
    if (!hasContent) return;
    var id=String(row[0]===null || row[0]===undefined ? '' : row[0]);
    if (!id.trim()) fail_('SCHEMA','جدول '+name+': الصف '+(index+2)+' يحتوي بيانات دون معرف في العمود '+STORE_.schemas[name][0]+'. لم يُعدّل الجدول.');
    if (Object.prototype.hasOwnProperty.call(ids,id)) fail_('SCHEMA','جدول '+name+': يوجد معرف مكرر في العمود '+STORE_.schemas[name][0]+' عند الصف '+(index+2)+'. أصلح التكرار أولًا.');
    ids[id]=true;
  });
}
function sheet_(name) {
  if (!Object.prototype.hasOwnProperty.call(STORE_.schemas,name)) fail_('SCHEMA','جدول غير صالح.');
  var sheet=getStore_().getSheetByName(name);
  if (!sheet) fail_('SCHEMA','جدول '+name+' مفقود. شغّل setupStore من محرر المشروع المرتبط لاستكمال الجداول.');
  assertSheetSchema_(sheet,name,false);
  return sheet;
}
function headers_(sheet) {
  var width=sheet.getLastColumn();
  return width ? sheet.getRange(1,1,1,width).getValues()[0].map(String) : [];
}
function cleanValue_(value) { return value instanceof Date ? value.toISOString() : value; }
function rows_(name) {
  var sheet=sheet_(name), n=sheet.getLastRow();
  if (n<2) return [];
  var data=sheet.getRange(1,1,n,sheet.getLastColumn()).getValues(), head=data.shift();
  assertPrimaryRows_(data,name);
  return data.filter(function(row) { return String(row[0])!==''; }).map(function(row) {
    var result={}; head.forEach(function(key,index) { result[key]=cleanValue_(row[index]); }); return result;
  });
}
function safeCell_(value) {
  if (value===undefined || value===null) return '';
  if (typeof value==='string') return /^[\s\uFEFF]*[=+\-@]/.test(value) ? "'"+value : value;
  if (typeof value==='number' && !Number.isFinite(value)) fail_('VALIDATION','قيمة رقمية غير صالحة.');
  return value;
}
function ensureStoreRow_(sheet,row) {
  var max=sheet.getMaxRows();
  if (row>max) sheet.insertRowsAfter(max,row-max);
}
function insert_(name,obj) {
  var sheet=sheet_(name), head=headers_(sheet), key=head[0];
  if (!obj[key] || !String(obj[key]).trim()) fail_('SCHEMA','معرف السجل مطلوب.');
  if (rows_(name).some(function(row) { return String(row[key])===String(obj[key]); })) fail_('DUPLICATE','معرف سجل مكرر.');
  ensureStoreRow_(sheet,sheet.getLastRow()+1);
  sheet.getRange(sheet.getLastRow()+1,1,1,head.length).setValues([head.map(function(column) { return safeCell_(obj[column]); })]);
}
function patch_(name,id,changes) {
  var sheet=sheet_(name), head=headers_(sheet), data=sheet.getDataRange().getValues();
  var keys=Object.keys(changes);
  // Validate every field before writing even the first changed cell.
  keys.forEach(function(key) {
    var col=head.indexOf(key);
    if (col===0 && String(changes[key])===String(id)) return;
    if (col<0 || col===0) fail_('SCHEMA','حقل تعديل غير صالح.');
    safeCell_(changes[key]);
  });
  assertPrimaryRows_(data.slice(1),name);
  for (var index=1;index<data.length;index++) {
    if (String(data[index][0])!==String(id)) continue;
    // Preserve all untouched text and formatting; journal revision is always the final write.
    keys.sort(function(a,b) { return a==='updated_at'?1:b==='updated_at'?-1:0; }).forEach(function(key) {
      var col=head.indexOf(key); if (col===0) return;
      sheet.getRange(index+1,col+1).setValue(safeCell_(changes[key]));
    });
    return;
  }
  fail_('NOT_FOUND','السجل غير موجود.');
}
function removeBy_(name,key,value) {
  var sheet=sheet_(name), head=headers_(sheet), col=head.indexOf(key);
  if (col<0) fail_('SCHEMA','حقل غير صالح.');
  var data=sheet.getDataRange().getValues(); assertPrimaryRows_(data.slice(1),name);
  for (var i=data.length-1;i>0;i--) if (String(data[i][col])===String(value)) sheet.deleteRow(i+1);
}
function flush_() { SpreadsheetApp.flush(); }
function settings_() {
  var result={}; rows_('Settings').forEach(function(row) { result[row.key]=row.value; });
  result.test_mode=isTrue_(result.test_mode); result.orders_open=isTrue_(result.orders_open);
  result.real_content_confirmed=isTrue_(result.real_content_confirmed);
  return result;
}


// ===== Setup.gs =====
/** Run in the NEW Sheet's Extensions → Apps Script editor after configuring admins. */
function setupStore() {
  var result = apiResult_(function() {
    var actor = requireAdmin_();
    return withLock_(function() {
      var props = PropertiesService.getScriptProperties();
      // Only setup reads the active spreadsheet. Public/admin runtime always uses openById.
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      if (!ss) fail_('NO_ACTIVE_SHEET', 'افتح Google Sheet جديدًا وفارغًا، ثم Extensions → Apps Script وشغّل setupStore من المحرر المرتبط به.');
      var id = ss.getId(), savedId = props.getProperty('STORE_SPREADSHEET_ID');
      if (savedId && savedId !== id) fail_('BOUND_SHEET_MISMATCH', 'المشروع مرتبط بمعرّف شيت آخر. لم يُفتح أو يُعدّل أي شيت محفوظ. استخدم مشروع Apps Script الجديد المرتبط بهذا الشيت.');
      var scriptId = ScriptApp.getScriptId();
      var markers = ss.getDeveloperMetadata().filter(function(m) { return m.getKey() === STORE_.marker; });
      if (markers.some(function(m) { return m.getValue() !== scriptId; })) fail_('WRONG_STORE', 'هذا الشيت يحمل علامة مشروع متجر آخر. أنشئ شيتًا جديدًا وفارغًا لهذا المشروع.');
      var owned = markers.some(function(m) { return m.getValue() === scriptId; });
      if (!owned && ss.getSheets().some(function(s) { return s.getLastRow() !== 0; }))
        fail_('WRONG_STORE', 'لن يُستخدم شيت غير معلّم يحتوي على بيانات، حتى لو كانت عناوين فقط. أنشئ Google Sheet جديدًا وفارغًا؛ لم تتغير أي بيانات.');
      var names = Object.keys(STORE_.schemas), blank = {}, anyRecords = false;
      // Read-only preflight ALL existing store tabs before metadata/properties/timezone/styles.
      names.forEach(function(name) {
        var sheet = ss.getSheetByName(name);
        blank[name] = !sheet || sheet.getLastRow() === 0;
        if (!blank[name]) { assertSheetSchema_(sheet, name, true); if (sheet.getLastRow() > 1) anyRecords = true; }
      });
      var initialSeed = props.getProperty('STORE_INITIAL_SEED_PENDING') === 'true' ||
        (props.getProperty('STORE_INITIAL_SEED_COMPLETE') !== 'true' && !anyRecords);
      // Mark first, then save ID: an interrupted setup can safely recover this same bound sheet.
      if (!owned) ss.addDeveloperMetadata(STORE_.marker, scriptId);
      props.setProperty('STORE_SPREADSHEET_ID', id);
      if (initialSeed) props.setProperty('STORE_INITIAL_SEED_PENDING', 'true');
      storeCache_ = ss;
      ss.setSpreadsheetTimeZone(STORE_.timezone);
      var created = [];
      names.forEach(function(name) {
        var sheet = ss.getSheetByName(name);
        if (!sheet) { sheet = ss.insertSheet(name); created.push(name); }
        var schema = STORE_.schemas[name];
        if (blank[name]) {
          ensureBlankStoreGrid_(sheet, schema.length);
          sheet.getRange(1,1,1,schema.length).setValues([schema]);
        }
        sheet.setFrozenRows(1);
        sheet.getRange(1,1,1,schema.length).setFontWeight('bold').setBackground('#f2e9df');
        // Preserve all historical/custom formats on populated tabs. Format new blank tabs only.
        if (blank[name]) formatNewStoreTab_(sheet, name);
      });
      var inserted = seedStore_(initialSeed); flush_();
      names.forEach(function(name) { applyStoreValidations_(ss.getSheetByName(name), name); });
      flush_();
      if (initialSeed) {
        props.setProperty('STORE_INITIAL_SEED_COMPLETE', 'true');
        props.setProperty('STORE_INITIAL_SEED_PENDING', 'false');
      }
      audit_(actor, 'setup_store', 'store', {schema:1, initialized:initialSeed, created_tabs:created});
      var counts = {}; names.forEach(function(name) { counts[name] = Math.max(0,ss.getSheetByName(name).getLastRow()-1); });
      var output = {spreadsheet_id:id,spreadsheet_url:ss.getUrl(),tab_names:names,created_tabs:created,
        row_counts:counts,seeded_counts:inserted,setup_status:initialSeed?'initialized':'preserved',
        test_mode:settings_().test_mode,seed_status:initialSeed?'demo_seeded':'existing_data_preserved',
        note:'تم تجهيز الشيت المرتبط فقط. الإعدادات والبيانات الحالية محفوظة؛ لم تُحذف أو تُنقل أي تبويبات.'};
      console.log(JSON.stringify(output));
      return output;
    });
  });
  // Apps Script editor must show setup failure, not a successful execution containing {ok:false}.
  if (!result.ok) { var error = new Error(result.error.message); error.safeCode = result.error.code; throw error; }
  return result;
}
function ensureBlankStoreGrid_(sheet,width) {
  var columns=sheet.getMaxColumns(), rows=sheet.getMaxRows();
  if (columns<width) sheet.insertColumnsAfter(columns,width-columns);
  if (rows<2) sheet.insertRowsAfter(rows,2-rows);
}
function formatNewStoreTab_(sheet, name) {
  var schema = STORE_.schemas[name], height = Math.max(1,sheet.getMaxRows()-1);
  schema.forEach(function(key,index) {
    var format = /_cm$/.test(key) ? '0.0#' : /_minor$/.test(key) || ['quantity','item_count','preorder_limit'].indexOf(key)>=0 ? '0' :
      ['active','is_demo','capacity_released'].indexOf(key)>=0 || (name==='Settings' && key==='value') ? 'General' : '@';
    sheet.getRange(2,index+1,height,1).setNumberFormat(format);
  });
}
function columnLetter_(index) {
  var letters = ''; for (var n=index+1;n>0;n=Math.floor((n-1)/26)) letters=String.fromCharCode(65+(n-1)%26)+letters;
  return letters;
}
function formulaRule_(formula,help) {
  return SpreadsheetApp.newDataValidation().requireFormulaSatisfied(formula).setAllowInvalid(false).setHelpText(help).build();
}
function enumRule_(values,help) {
  return SpreadsheetApp.newDataValidation().requireValueInList(values,true).setAllowInvalid(false).setHelpText(help).build();
}
function integerRule_(cell,min,max) {
  return formulaRule_('=OR(ISBLANK('+cell+'),AND(ISNUMBER('+cell+'),'+cell+'=INT('+cell+'),'+cell+'>='+min+','+cell+'<='+max+'))',
    'عدد صحيح من '+min+' إلى '+max+'؛ الحقول النقدية بالقروش، وليس بالجنيه.');
}
function booleanRule_(cell) {
  return formulaRule_('=OR(ISBLANK('+cell+'),ISLOGICAL('+cell+'),'+cell+'="TRUE",'+cell+'="FALSE",'+cell+'="true",'+cell+'="false")',
    'استخدم TRUE أو FALSE فقط.');
}
function applyStoreValidations_(sheet,name) {
  var schema=STORE_.schemas[name], height=Math.max(1,sheet.getMaxRows()-1);
  var enums={order_status:['new','confirmed','preparing','shipped','delivered','cancelled','returned'],
    payment_status:['unpaid','partial','paid','refunded'],payment_method:['demo','cod','manual_transfer'],
    mode:['demo','live'],transaction_state:['pending','committed','aborted']};
  schema.forEach(function(key,index) {
    var cell=columnLetter_(index)+'2', rule=null;
    if (['active','is_demo','capacity_released'].indexOf(key)>=0) rule=booleanRule_(cell);
    else if (/_minor$/.test(key)) rule=integerRule_(cell,key==='price_minor'||key==='unit_price_minor'||key==='line_total_minor'?1:0,['collected_minor','refunded_minor'].indexOf(key)>=0?9007199254740991:100000000);
    else if (/_cm$/.test(key)) rule=formulaRule_('=OR(ISBLANK('+cell+'),AND(ISNUMBER('+cell+'),'+cell+'>0,'+cell+'<=300))','قياس موجب بالسنتيمتر، حتى 300 سم.');
    else if (key==='quantity'||key==='item_count') rule=integerRule_(cell,1,20);
    else if (key==='preorder_limit') rule=integerRule_(cell,0,9007199254740991);
    else if (enums[key]) rule=enumRule_(enums[key],'اختر قيمة من الحالات المعتمدة؛ تعديل الطلبات من لوحة الإدارة فقط.');
    else if (name==='Settings' && key==='value') rule=formulaRule_('=OR(ISBLANK('+cell+'),LEN('+cell+')<=3000)','قيمة الإعداد بحد أقصى 3000 حرف؛ توجد قواعد مخصصة للصفوف المعروفة.');
    if (rule) sheet.getRange(2,index+1,height,1).setDataValidation(rule);
  });
  if (name!=='Settings') return;
  var rows=sheet.getDataRange().getValues(), valueIndex=schema.indexOf('value');
  var bounds={max_order_qty:[1,20],min_form_seconds:[1,60],global_orders_per_hour:[1,300],phone_orders_per_hour:[1,20]};
  rows.slice(1).forEach(function(row,index) {
    var key=String(row[0]), number=index+2, cell=columnLetter_(valueIndex)+number, rule=null;
    if (['test_mode','orders_open','real_content_confirmed'].indexOf(key)>=0) rule=booleanRule_(cell);
    else if (bounds[key]) rule=integerRule_(cell,bounds[key][0],bounds[key][1]);
    else if (key==='payment_method') rule=enumRule_(['demo','cod','manual_transfer'],'وضع demo للتجربة. cod غير محصّل تلقائيًا؛ لا توجد بوابة دفع.');
    else if (key==='shipping_expected') rule=formulaRule_('=OR(ISBLANK('+cell+'),AND(ISTEXT('+cell+'),REGEXMATCH('+cell+',"^20[0-9]{2}-[0-9]{2}-[0-9]{2}$"),IFERROR(TEXT(DATE(VALUE(LEFT('+cell+',4)),VALUE(MID('+cell+',6,2)),VALUE(RIGHT('+cell+',2))),"yyyy-mm-dd")='+cell+',FALSE)))',
      'تاريخ الشحن المتوقع كنص YYYY-MM-DD، منفصل عن مدة التوصيل.');
    if (rule) sheet.getRange(number,valueIndex+1,1,1).setDataValidation(rule);
  });
}
function seedMissing_(name, list) {
  var key = STORE_.schemas[name][0], existing = rows_(name).map(function(r) { return String(r[key]); });
  var inserted = 0;
  list.forEach(function(r) { if (existing.indexOf(String(r[key])) < 0) {
    if (name === 'Settings') {
      var sheet = sheet_(name), numeric = ['max_order_qty','min_form_seconds','global_orders_per_hour','phone_orders_per_hour'];
      var format = numeric.indexOf(r.key) >= 0 ? '0' : ['test_mode','orders_open','real_content_confirmed'].indexOf(r.key) >= 0 ? 'General' : '@';
      // Only the new cell is formatted; historical/custom Settings formats remain intact.
      ensureStoreRow_(sheet, sheet.getLastRow()+1);
      sheet.getRange(sheet.getLastRow()+1,2,1,1).setNumberFormat(format);
    }
    insert_(name,r); existing.push(String(r[key])); inserted++;
  } });
  return inserted;
}
function seedStore_(includeDemo) {
  var inserted = {Settings:0,Products:0,Variants:0,SizeGuide:0,Shipping:0};
  var defaults = [
    ['brand_name','BRAND NAME','اسم مؤقت؛ يُستبدل قبل الإطلاق'],
    ['brand_description','قطعة واحدة. تفاصيل تعبر عنك.','وصف البراند'],
    ['test_mode',true,'true للتجربة المعزولة، false للبيع الحقيقي بعد الجاهزية'],
    ['orders_open',false,'فتح الطلبات الحقيقية؛ لا يمنع تجربة الطلب الواضحة'],
    ['payment_method','demo','demo أو cod أو manual_transfer'],
    ['shipping_expected','','موعد تجهيز وتسليم الطلبات لشركة الشحن؛ حدده قبل الإطلاق'],
    ['preorder_message','المنتج بنظام الطلب المسبق. يبدأ التجهيز بعد اعتماد تفاصيل الإطلاق.','رسالة الطلب المسبق'],
    ['shipping_policy','','سياسة الشحن المعتمدة'],['exchange_policy','','سياسة الاستبدال المعتمدة'],['return_policy','','سياسة الاسترجاع المعتمدة'],
    ['contact_phone','','رقم التواصل المعتمد'],['contact_email','','بريد التواصل'],
    ['real_content_confirmed',false,'تأكيد مراجعة الصور والخامة والمقاسات والأسعار والسياسات'],
    ['max_order_qty',5,'أقصى عدد قطع للطلب (1–20)'],['min_form_seconds',3,'حد أدنى لزمن النموذج؛ حماية محدودة'],
    ['global_orders_per_hour',60,'حد طلبات الساعة للمشروع (1–300)'],['phone_orders_per_hour',3,'حد طلبات الساعة للهاتف (1–20)']
  ].map(function(r) {return {key:r[0],value:r[1],description:r[2]};});
  inserted.Settings = seedMissing_('Settings',defaults);
  // Initial demo seeds resume only during the first setup transaction.
  // A normal rerun never resurrects a deliberately removed demo row.
  if (!includeDemo || isTrue_(settings_().real_content_confirmed)) return inserted;
  inserted.Products = seedMissing_('Products',[{id:'demo-sweatshirt',name:'سويت شيرت — نموذج تجريبي',description:'تصميم أولي لاستكشاف الألوان والمقاسات. تفاصيل المنتج النهائي لم تُعتمد بعد.',material:'خامة تجريبية — تُحدد قبل الإطلاق',fit:'قَصّة تجريبية — تُحدد قبل الإطلاق',image_urls:'[]',active:true,is_demo:true}]);
  var variants = []; ['black','burgundy'].forEach(function(c) { ['S','M','L','XL'].forEach(function(size) { variants.push({id:'demo-'+c+'-'+size,product_id:'demo-sweatshirt',color:c,color_label:c==='black'?'أسود':'برجندي',size:size,price_minor:65000,active:true,preorder_limit:'',is_demo:true}); }); });
  inserted.Variants = seedMissing_('Variants',variants);
  inserted.SizeGuide = seedMissing_('SizeGuide',[['S',52,66,58],['M',55,69,60],['L',58,72,62],['XL',61,75,64]].map(function(r) { return {id:'demo-size-'+r[0],size:r[0],chest_cm:r[1],length_cm:r[2],sleeve_cm:r[3],notes:'قياسات تجريبية بالسنتيمتر وليست مواصفات المنتج الحقيقي',is_demo:true}; }));
  inserted.Shipping = seedMissing_('Shipping',[{id:'demo-cairo',governorate:'القاهرة — تجريبي',fee_minor:6000,delivery_days:'2–4 أيام تجريبية بعد الشحن',active:true,is_demo:true},{id:'demo-giza',governorate:'الجيزة — تجريبي',fee_minor:6500,delivery_days:'2–4 أيام تجريبية بعد الشحن',active:true,is_demo:true}]);
  return inserted;
}


// ===== Domain.gs =====
/** Pure validation and money rules. Money is integer piastres throughout. */
function domainText_(value, max, required) {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string') fail_('VALIDATION', 'راجع البيانات المدخلة.');
  var result = value.trim();
  if (result.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(result) || (required && !result))
    fail_('VALIDATION', 'راجع الحقول المطلوبة وأطوالها.');
  return result;
}
function normalizePhone_(value) {
  var phone = domainText_(value, 30, true).replace(/[٠-٩]/g, function (c) { return String(c.charCodeAt(0) - 1632); })
    .replace(/[۰-۹]/g, function (c) { return String(c.charCodeAt(0) - 1776); }).replace(/[\s()\-]/g, '');
  if (/^(?:\+20|0020|20)1/.test(phone)) phone = '0' + phone.replace(/^(?:\+20|0020|20)/, '');
  if (!/^01[0125]\d{8}$/.test(phone)) fail_('PHONE_INVALID', 'أدخل رقم موبايل مصريًا صحيحًا.');
  return phone;
}
function validateCustomer_(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail_('VALIDATION', 'أكمل بيانات التوصيل.');
  var customer = {
    name: domainText_(input.name, 100, true), phone: normalizePhone_(input.phone),
    governorate_id: domainText_(input.governorate_id, 60, true), city: domainText_(input.city, 100, true),
    address: domainText_(input.address, 500, true), notes: domainText_(input.notes, 500, false)
  };
  if (customer.name.length < 2 || customer.city.length < 2 || customer.address.length < 8)
    fail_('VALIDATION', 'اكتب الاسم والمنطقة وعنوانًا تفصيليًا للتوصيل.');
  return customer;
}
function normalizeItems_(input, maxQty) {
  if (!Array.isArray(input) || input.length < 1 || input.length > 10) fail_('VALIDATION', 'اختر القطع المطلوبة.');
  var merged = Object.create(null), count = 0;
  input.forEach(function (item) {
    if (!item || typeof item !== 'object') fail_('VALIDATION', 'اختيار المنتج غير صحيح.');
    var id = domainText_(item.variant_id, 100, true), qty = item.quantity;
    if (typeof qty !== 'number' || !Number.isSafeInteger(qty) || qty < 1 || qty > maxQty)
      fail_('VALIDATION', 'الكمية المطلوبة غير صحيحة.');
    merged[id] = (merged[id] || 0) + qty; count += qty;
  });
  if (count > maxQty) fail_('VALIDATION', 'تجاوز الطلب الحد المسموح للكمية.');
  return Object.keys(merged).sort().map(function (id) { return {variant_id: id, quantity: merged[id]}; });
}
function minorAmount_(value, allowZero) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= (allowZero ? 0 : 1) && value <= 100000000;
}
function numericSetting_(settings, name, fallback, min, max) {
  var raw = settings[name], value = raw === '' || raw === undefined ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) fail_('LAUNCH_NOT_READY', 'يوجد إعداد غير صالح في المتجر.');
  return value;
}
function calculateOrder_(items, variants, products, shippingRow, mode, maxQty) {
  items = normalizeItems_(items, maxQty || 10);
  if (!shippingRow || !isTrue_(shippingRow.active) || !minorAmount_(shippingRow.fee_minor, true) ||
      (mode === 'live' && isTrue_(shippingRow.is_demo))) fail_('UNAVAILABLE', 'التوصيل غير متاح لهذه المحافظة.');
  var subtotal = 0;
  var lines = items.map(function (item) {
    var variant = variants.filter(function (row) { return row.id === item.variant_id; })[0];
    var product = variant && products.filter(function (row) { return row.id === variant.product_id; })[0];
    if (!variant || !product || !isTrue_(variant.active) || !isTrue_(product.active) ||
        (mode === 'live' && (isTrue_(variant.is_demo) || isTrue_(product.is_demo))) || !minorAmount_(variant.price_minor, false))
      fail_('UNAVAILABLE', 'اللون أو المقاس المختار غير متاح.');
    var line = variant.price_minor * item.quantity;
    if (!Number.isSafeInteger(line)) fail_('VALIDATION', 'قيمة الطلب غير صالحة.');
    subtotal += line;
    return {variant_id: variant.id, product_id: product.id, product_name: product.name,
      color: variant.color, color_label: variant.color_label, size: variant.size, quantity: item.quantity,
      unit_price_minor: variant.price_minor, line_total_minor: line, mode: mode};
  });
  var total = subtotal + shippingRow.fee_minor;
  if (!Number.isSafeInteger(total) || total > 100000000) fail_('VALIDATION', 'قيمة الطلب غير صالحة.');
  return {items: lines, subtotal_minor: subtotal, shipping_minor: shippingRow.fee_minor, total_minor: total};
}
function readiness_(settings, products, variants, shipping, sizeGuide) {
  var issues = [];
  var activeProducts = products.filter(function (row) { return isTrue_(row.active); });
  var activeVariants = variants.filter(function (row) { return isTrue_(row.active); });
  var activeShipping = shipping.filter(function (row) { return isTrue_(row.active); });
  if (!activeProducts.length || !activeVariants.length) issues.push('فعّل منتجًا ولونًا ومقاسًا على الأقل.');
  if (!activeShipping.length) issues.push('حدد محافظات الشحن المتاحة.');
  if (activeVariants.some(function (row) { return !minorAmount_(row.price_minor, false); })) issues.push('أكمل أسعار المتغيرات بقروش صحيحة.');
  if (activeShipping.some(function (row) { return !minorAmount_(row.fee_minor, true) || !String(row.delivery_days || '').trim(); }))
    issues.push('أكمل رسوم الشحن ومدة التوصيل لكل محافظة مفعلة.');
  {
    if (!isTrue_(settings.real_content_confirmed)) issues.push('راجع البيانات الحقيقية وأكد جاهزية المحتوى.');
    if (['cod', 'manual_transfer'].indexOf(String(settings.payment_method)) < 0) issues.push('حدد طريقة الدفع الحقيقية.');
    if (!settings.brand_name || /^BRAND NAME$/i.test(String(settings.brand_name).trim())) issues.push('حدد اسم البراند.');
    var dispatch = String(settings.shipping_expected || '');
    if (!/^20\d{2}-\d{2}-\d{2}$/.test(dispatch) || isNaN(Date.parse(dispatch)) || new Date(dispatch).toISOString().slice(0, 10) !== dispatch)
      issues.push('حدد موعد الشحن المتوقع بصيغة YYYY-MM-DD.');
    if (!settings.preorder_message) issues.push('أكمل توضيح الطلب المسبق.');
    if (!settings.shipping_policy || !settings.exchange_policy || !settings.return_policy) issues.push('أكمل نصوص الشحن والاستبدال والاسترجاع.');
    if (!settings.contact_phone && !settings.contact_email) issues.push('حدد وسيلة تواصل.');
    if (activeProducts.some(function (row) { return isTrue_(row.is_demo) || !row.name || !row.material || !row.fit || !row.description || !validRealImages_(row.image_urls); }) ||
        activeVariants.some(function (row) { return isTrue_(row.is_demo); }) || activeShipping.some(function (row) { return isTrue_(row.is_demo); }))
      issues.push('استبدل البيانات والصور والأسعار والشحن التجريبي ببيانات حقيقية وأزل علامة is_demo.');
    if (!sizeGuide || !sizeGuide.length || sizeGuide.some(function (row) { return isTrue_(row.is_demo) || !row.size || ['chest_cm','length_cm','sleeve_cm'].some(function(k) { return !Number.isFinite(Number(row[k])) || Number(row[k]) <= 0; }); }))
      issues.push('راجع جدول المقاسات الحقيقي وأزل علامة is_demo.');
    if (String(settings.contact_email || '') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.contact_email)) issues.push('راجع بريد التواصل.');
  }
  if (activeVariants.some(function(row) { return !row.id || !row.color || !row.size || !activeProducts.some(function(p) { return p.id === row.product_id; }); })) issues.push('راجع معرفات المنتجات والألوان والمقاسات.');
  activeVariants.forEach(function (row) {
    if (row.preorder_limit !== '' && row.preorder_limit !== null && row.preorder_limit !== undefined &&
        (!Number.isSafeInteger(Number(row.preorder_limit)) || Number(row.preorder_limit) < 0)) issues.push('راجع سعة الطلب المسبق.');
  });
  return {ready: issues.length === 0, issues: issues};
}
function validRealImages_(raw) {
  var values; try { values = JSON.parse(String(raw || '[]')); } catch (e) { return false; }
  return Array.isArray(values) && values.length > 0 && values.length <= 6 && values.every(function(value) {
    return typeof value === 'string' && value.length < 2000 && /^https:\/\/(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}(?::\d{1,5})?(?:[/?#][^\s]*)?$/i.test(value);
  });
}
function paymentState_(total, collected, refunded) {
  var net = collected - refunded;
  if (refunded > 0 && net === 0) return 'refunded';
  if (net === 0) return 'unpaid';
  return net >= total ? 'paid' : 'partial';
}


// ===== Orders.gs =====
/** Serialized sheet ledger. The committed header is the public success marker. */
function createCheckoutToken_() {
  var token = Utilities.getUuid() + Utilities.getUuid(), issued = Date.now();
  CacheService.getScriptCache().put('checkout:' + sha256_(token), String(issued), 1800);
  var s = settings_();
  return {token: token, issued_at: issued, min_seconds: numericSetting_(s, 'min_form_seconds', 3, 1, 60)};
}
function validateCheckout_(payload, settings) {
  if (payload.honeypot !== undefined && String(payload.honeypot).trim()) fail_('BOT_REJECTED', 'تعذر إرسال الطلب.');
  var token = domainText_(payload.checkout_token, 100, true);
  var issued = Number(CacheService.getScriptCache().get('checkout:' + sha256_(token)));
  if (!issued || Date.now() - issued > 1800000) fail_('CHECKOUT_EXPIRED', 'انتهت جلسة الطلب. حدّث الصفحة وحاول مجددًا.');
  if (Date.now() - issued < numericSetting_(settings, 'min_form_seconds', 3, 1, 60) * 1000)
    fail_('TOO_FAST', 'راجع بياناتك ثم أعد المحاولة بعد لحظات.');
}
function orderUtm_(input) {
  input = input || {};
  if (typeof input !== 'object' || Array.isArray(input)) fail_('VALIDATION', 'مصدر الزيارة غير صالح.');
  var out = {};
  ['source', 'medium', 'campaign', 'term', 'content'].forEach(function (key) { out[key] = domainText_(input[key], 150, false); });
  return out;
}
function orderResponse_(order) {
  return {order_id: order.id, mode: order.mode, total_minor: order.total_minor, payment_status: order.payment_status};
}
function usedCapacity_(variantId, mode) {
  var orders = Object.create(null);
  rows_('Orders').forEach(function (row) {
    if (row.mode === mode && (row.transaction_state === 'committed' || row.transaction_state === 'pending') &&
        !isTrue_(row.capacity_released) && row.order_status !== 'cancelled') orders[row.id] = true;
  });
  return rows_('OrderItems').reduce(function (sum, item) {
    return sum + (orders[item.order_id] && item.variant_id === variantId ? Number(item.quantity) : 0);
  }, 0);
}
function enforceOrderRate_(phone, settings) {
  var since = Date.now() - 3600000, recent = rows_('Orders').filter(function (row) { return Date.parse(row.created_at) >= since; });
  var globalLimit = numericSetting_(settings, 'global_orders_per_hour', 100, 1, 1000);
  var phoneLimit = numericSetting_(settings, 'phone_orders_per_hour', 3, 1, 30);
  var phoneHash = sha256_(phone);
  var samePhone = recent.filter(function (row) { return sha256_(String(row.phone)) === phoneHash; });
  if (recent.length >= globalLimit || samePhone.length >= phoneLimit) fail_('RATE_LIMIT', 'وصلنا للحد المؤقت للطلبات. حاول لاحقًا أو تواصل معنا.');
}
function submitOrder(payload) {
  return apiResult_(function () {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) fail_('VALIDATION', 'بيانات الطلب غير صالحة.');
    return withLock_(function () {
      recoverPending_();
      var s = settings_(), customer = validateCustomer_(payload.customer);
      var key = domainText_(payload.idempotency_key, 100, true);
      if (!/^[A-Za-z0-9_-]{16,100}$/.test(key)) fail_('VALIDATION', 'معرف محاولة الطلب غير صالح.');
      var idempotencyHash = sha256_(key), previous = rows_('Orders').filter(function (r) { return r.idempotency_hash === idempotencyHash; })[0];
      var mode = previous ? previous.mode : (isTrue_(s.test_mode) ? 'demo' : 'live');
      var maxQty = numericSetting_(s, 'max_order_qty', 5, 1, 20);
      var items = normalizeItems_(payload.items, 20), utm = orderUtm_(payload.utm);
      var fingerprint = sha256_(JSON.stringify({customer: customer, items: items, utm: utm, mode: mode}));
      if (previous) {
        if (previous.payload_hash !== fingerprint) fail_('IDEMPOTENCY_CONFLICT', 'هذه المحاولة مرتبطة ببيانات مختلفة. ابدأ طلبًا جديدًا.');
        if (previous.transaction_state === 'committed') return orderResponse_(previous);
        if (previous.transaction_state !== 'aborted') fail_('PENDING', 'الطلب قيد التحقق. أعد المحاولة بنفس البيانات.');
        if (mode !== (isTrue_(s.test_mode) ? 'demo' : 'live')) fail_('LAUNCH_NOT_READY', 'تغيّر وضع المتجر. ابدأ محاولة جديدة.');
      }
      if (mode === 'live' && !isTrue_(s.orders_open)) fail_('ORDERS_CLOSED', 'استقبال الطلبات مغلق حاليًا.');
      var products = rows_('Products'), variants = rows_('Variants'), shipping = rows_('Shipping');
      var ready = readiness_(s, products, variants, shipping, rows_('SizeGuide'));
      if (mode === 'live' && !ready.ready) fail_('LAUNCH_NOT_READY', 'إعدادات الإطلاق غير مكتملة. الطلبات الحقيقية غير متاحة.');
      validateCheckout_(payload, s); enforceOrderRate_(customer.phone, s);
      var ship = shipping.filter(function (row) { return row.id === customer.governorate_id; })[0];
      var calculation = calculateOrder_(items, variants, products, ship, mode, maxQty);
      calculation.items.forEach(function (item) {
        var variant = variants.filter(function (row) { return row.id === item.variant_id; })[0];
        if (variant.preorder_limit !== '' && variant.preorder_limit !== null && variant.preorder_limit !== undefined &&
            usedCapacity_(variant.id, mode) + item.quantity > Number(variant.preorder_limit)) fail_('CAPACITY', 'الكمية المختارة غير متاحة لهذا اللون والمقاس.');
      });
      var now = new Date().toISOString(), id = previous ? previous.id : 'ORD-' + Utilities.getUuid().replace(/-/g, '').toUpperCase();
      var order = {id: id, created_at: previous ? previous.created_at : now, updated_at: now,
        customer_name: customer.name, phone: customer.phone, governorate_id: customer.governorate_id, city: customer.city,
        address: customer.address, notes: customer.notes, subtotal_minor: calculation.subtotal_minor, shipping_minor: calculation.shipping_minor,
        total_minor: calculation.total_minor, payment_method: mode === 'demo' ? 'demo' : s.payment_method, payment_status: 'unpaid',
        collected_minor: 0, refunded_minor: 0, order_status: 'new', mode: mode, idempotency_hash: idempotencyHash,
        payload_hash: fingerprint, transaction_state: 'pending', item_count: calculation.items.length,
        utm_source: utm.source, utm_medium: utm.medium, utm_campaign: utm.campaign, utm_term: utm.term, utm_content: utm.content, capacity_released: false};
      // Header first: every partial write has a durable recovery anchor.
      if (previous) { var restarted = Object.assign({}, order); delete restarted.id; patch_('Orders', id, restarted); } else insert_('Orders', order);
      flush_();
      calculation.items.forEach(function (item) {
        item.id = id + '-' + sha256_(item.variant_id).slice(0, 16); item.order_id = id;
        insert_('OrderItems', item);
      });
      flush_();
      patch_('Orders', id, {transaction_state: 'committed', updated_at: new Date().toISOString()});
      flush_();
      order.transaction_state = 'committed';
      return orderResponse_(order);
    });
  });
}
function validPendingItems_(order, items) {
  if (items.length !== Number(order.item_count) || !items.length) return false;
  var ids = Object.create(null), sum = 0;
  return items.every(function (item) {
    if (ids[item.variant_id] || item.mode !== order.mode || !Number.isSafeInteger(Number(item.quantity)) || Number(item.quantity) < 1 ||
        !minorAmount_(Number(item.unit_price_minor), false) || Number(item.line_total_minor) !== Number(item.unit_price_minor) * Number(item.quantity)) return false;
    ids[item.variant_id] = true; sum += Number(item.line_total_minor); return true;
  }) && sum === Number(order.subtotal_minor) && Number(order.total_minor) === sum + Number(order.shipping_minor);
}
function recoverPending_() {
  var count = recoverAdminMutations_(), items = rows_('OrderItems');
  rows_('Orders').filter(function (row) { return row.transaction_state === 'pending'; }).forEach(function (order) {
    var lines = items.filter(function (item) { return item.order_id === order.id; });
    if (validPendingItems_(order, lines)) {
      patch_('Orders', order.id, {transaction_state: 'committed', updated_at: new Date().toISOString()});
    } else {
      removeBy_('OrderItems', 'order_id', order.id); flush_();
      patch_('Orders', order.id, {transaction_state: 'aborted', updated_at: new Date().toISOString()});
    }
    flush_(); count++;
  });
  return count;
}
function committedOrder_(id) {
  id = domainText_(id, 100, true);
  var order = rows_('Orders').filter(function (row) { return row.id === id && row.transaction_state === 'committed'; })[0];
  if (!order) fail_('NOT_FOUND', 'الطلب غير موجود.');
  return order;
}
function nextOrderTime_(order) {
  return new Date(Math.max(Date.now(), Date.parse(order.updated_at || order.created_at) + 1)).toISOString();
}
function mutationApply_(order, fields, actor, action, metadata, key) {
  var id = key ? 'MUT-' + sha256_(key) : 'MUT-' + Utilities.getUuid();
  var prior = rows_('AuditLog').filter(function (row) { return row.id === id; })[0];
  var intent = {action: action, order_id: order.id, fields: fields, metadata: metadata || {}, previous_updated_at: order.updated_at};
  if (prior) {
    var old = JSON.parse(prior.changes_json);
    if (old.action !== action || old.order_id !== order.id || JSON.stringify(old.metadata) !== JSON.stringify(metadata || {}))
      fail_('IDEMPOTENCY_CONFLICT', 'هذه العملية مرتبطة ببيانات مختلفة.');
    if (prior.action === 'ADMIN_MUTATION_APPLIED') return committedOrder_(order.id);
    fail_('PENDING', 'التعديل قيد المراجعة. أعد المحاولة.');
  }
  insert_('AuditLog', {id: id, created_at: new Date().toISOString(), actor: actor, action: 'ADMIN_MUTATION_PENDING',
    entity_id: order.id, changes_json: JSON.stringify(intent)});
  flush_();
  patch_('Orders', order.id, fields); flush_();
  patch_('AuditLog', id, {action: 'ADMIN_MUTATION_APPLIED'}); flush_();
  return committedOrder_(order.id);
}
function recoverAdminMutations_() {
  var count = 0;
  rows_('AuditLog').filter(function (row) { return row.action === 'ADMIN_MUTATION_PENDING'; }).forEach(function (entry) {
    var intent = JSON.parse(entry.changes_json), order = committedOrder_(intent.order_id);
    var applied = Object.keys(intent.fields).every(function (key) { return String(order[key]) === String(intent.fields[key]); });
    if (!applied && String(order.updated_at) !== String(intent.previous_updated_at))
      fail_('RECOVERY_REQUIRED', 'يوجد تعارض إداري يحتاج مراجعة سجل التغييرات.');
    if (!applied) { patch_('Orders', order.id, intent.fields); flush_(); }
    patch_('AuditLog', entry.id, {action: 'ADMIN_MUTATION_APPLIED'}); flush_(); count++;
  });
  return count;
}
function runOrderStatusChange_(orderId, nextStatus, actor) {
  recoverPending_();
  var order = committedOrder_(orderId);
  var allowed = {new: ['confirmed', 'cancelled'], confirmed: ['preparing', 'cancelled'], preparing: ['shipped', 'cancelled'],
    shipped: ['delivered', 'returned'], delivered: ['returned'], cancelled: [], returned: []};
  if (order.order_status === nextStatus) return order;
  if (!allowed[order.order_status] || allowed[order.order_status].indexOf(nextStatus) < 0)
    fail_('INVALID_TRANSITION', 'هذا الانتقال في حالة الطلب غير مسموح.');
  return mutationApply_(order, {order_status: nextStatus, capacity_released: nextStatus === 'cancelled' ? true : isTrue_(order.capacity_released),
    updated_at: nextOrderTime_(order)}, actor, 'ORDER_STATUS', {from: order.order_status, to: nextStatus});
}
function recordPayment_(orderId, amountMinor, kind, note, actor, mutationKey) {
  recoverPending_();
  note = domainText_(note, 200, false);
  if (!minorAmount_(amountMinor, false) || ['collect', 'refund'].indexOf(kind) < 0) fail_('VALIDATION', 'قيمة الحركة المالية غير صحيحة.');
  {
    mutationKey = domainText_(mutationKey, 100, true);
    if (!/^[A-Za-z0-9_-]{16,100}$/.test(mutationKey)) fail_('VALIDATION', 'معرف العملية المالية غير صالح.');
    var prior = rows_('AuditLog').filter(function (row) { return row.id === 'MUT-' + sha256_(mutationKey); })[0];
    if (prior) {
      var intent = JSON.parse(prior.changes_json);
      if (intent.order_id !== orderId || intent.action !== 'PAYMENT' || intent.metadata.kind !== kind || intent.metadata.amount_minor !== amountMinor ||
          intent.metadata.note_hash !== sha256_(note)) fail_('IDEMPOTENCY_CONFLICT', 'هذه العملية مرتبطة ببيانات مختلفة.');
      if (prior.action === 'ADMIN_MUTATION_APPLIED') return committedOrder_(orderId);
      fail_('PENDING', 'العملية قيد المراجعة. أعد المحاولة.');
    }
  }
  var order = committedOrder_(orderId), collected = Number(order.collected_minor), refunded = Number(order.refunded_minor);
  if (kind === 'collect') {
    if (order.order_status === 'cancelled' || order.order_status === 'returned') fail_('VALIDATION', 'لا يمكن تسجيل تحصيل لطلب ملغي أو مرتجع.');
    collected += amountMinor;
    if (collected - refunded > Number(order.total_minor)) fail_('VALIDATION', 'التحصيل يتجاوز القيمة المتبقية للطلب.');
  } else {
    refunded += amountMinor;
    if (refunded > collected) fail_('VALIDATION', 'الاسترداد يتجاوز المبالغ المحصلة.');
  }
  if (!Number.isSafeInteger(collected) || !Number.isSafeInteger(refunded)) fail_('VALIDATION', 'القيمة المالية غير صالحة.');
  return mutationApply_(order, {collected_minor: collected, refunded_minor: refunded,
    payment_status: paymentState_(Number(order.total_minor), collected, refunded), updated_at: nextOrderTime_(order)}, actor,
    'PAYMENT', {kind: kind, amount_minor: amountMinor, note_hash: sha256_(note)}, mutationKey);
}


// ===== Catalog.gs =====
function publicSettings_(settings) {
  var result = {}; STORE_.publicSettings.forEach(function(k) { result[k] = settings[k] === undefined ? '' : settings[k]; }); return result;
}
function imageUrls_(raw) {
  var values; try { values = JSON.parse(String(raw || '[]')); } catch(e) { values = []; }
  if (!Array.isArray(values)) return [];
  return values.filter(function(v) { return typeof v === 'string' && /^https:\/\//i.test(v) && v.length < 2000; }).slice(0,6);
}
function launchReadiness_(s) { return readiness_(s,rows_('Products'),rows_('Variants'),rows_('Shipping'),rows_('SizeGuide')); }
function getCatalog() {
  return apiResult_(function() {
    var s = settings_(), mode = s.test_mode ? 'demo' : 'live';
    var products = rows_('Products'), allVariants = rows_('Variants'), allShipping = rows_('Shipping'), allGuide = rows_('SizeGuide');
    var candidates = products.filter(function(p) { return isTrue_(p.active) && (mode === 'demo' || !isTrue_(p.is_demo)); });
    var p = candidates[0];
    var variants = allVariants.filter(function(v) { return p && v.product_id === p.id && (mode === 'demo' || !isTrue_(v.is_demo)); }).map(function(v) {
      var price = Number(v.price_minor), active = isTrue_(v.active) && Number.isSafeInteger(price) && price > 0;
      var remaining = v.preorder_limit === '' ? null : Math.max(0,Number(v.preorder_limit)-usedCapacity_(v.id,mode));
      return {id:v.id,product_id:v.product_id,color:v.color,color_label:v.color_label,size:v.size,price_minor:price,active:active,available:active && (remaining === null || remaining > 0)};
    });
    var shipping = allShipping.filter(function(r) { return isTrue_(r.active) && (mode==='demo' || !isTrue_(r.is_demo)) && Number.isSafeInteger(Number(r.fee_minor)) && Number(r.fee_minor)>=0; }).map(function(r) { return {id:r.id,governorate:r.governorate,fee_minor:Number(r.fee_minor),delivery_days:r.delivery_days}; });
    var guide = allGuide.filter(function(r) { return mode==='demo' || !isTrue_(r.is_demo); });
    return {appearance:appearance_(),settings:publicSettings_(s),product:p ? {id:p.id,name:p.name,description:p.description,material:p.material,fit:p.fit,images:imageUrls_(p.image_urls),is_demo:isTrue_(p.is_demo)} : null,
      variants:variants,sizeGuide:guide,shipping:shipping,readiness:readiness_(s,products,allVariants,allShipping,allGuide),checkout:Object.assign(createCheckoutToken_(),{max_order_qty:numericSetting_(s,'max_order_qty',5,1,20)})};
  });
}


// ===== AdminApi.gs =====
function adminSafeOrder_(o) {
  var result = {}; Object.keys(o).forEach(function(k) { if (['idempotency_hash','payload_hash'].indexOf(k)<0) result[k]=o[k]; }); return result;
}
function adminOrderDetail_(id) {
  id = text_(id,100);
  var o = rows_('Orders').find(function(r) { return r.id === id && r.transaction_state === 'committed'; });
  if (!o) fail_('NOT_FOUND','الطلب غير موجود أو لم يكتمل حفظه.');
  return {order:adminSafeOrder_(o),items:rows_('OrderItems').filter(function(r) {return r.order_id===id;})};
}
function getAdminDashboard(filters) {
  return apiResult_(function() {
    var actor = requireAdmin_(); filters = filters || {};
    var search = text_(filters.search || '',100).toLowerCase();
    var mode = filters.mode === 'live' ? 'live' : 'demo', status = text_(filters.status || '',30);
    return withLock_(function() {
      recoverPending_();
      var all = rows_('Orders'), orders = all.filter(function(o) {return o.transaction_state==='committed' && o.mode===mode;});
      var summary = {order_count:orders.length,unit_count:0,order_value_minor:0,collected_minor:0,refunded_minor:0,net_collected_minor:0,by_variant:[]}, groups={};
      var effectiveIds = {};
      orders.forEach(function(o) {
        summary.collected_minor += Number(o.collected_minor || 0); summary.refunded_minor += Number(o.refunded_minor || 0);
        if (['cancelled','returned'].indexOf(o.order_status)<0) { summary.order_value_minor += Number(o.total_minor); effectiveIds[o.id]=true; }
      });
      rows_('OrderItems').forEach(function(i) {
        if (!effectiveIds[i.order_id]) return;
        summary.unit_count += Number(i.quantity);
        var key=String(i.color_label)+'|'+String(i.size); if (!groups[key]) groups[key]={color_label:i.color_label,size:i.size,quantity:0}; groups[key].quantity += Number(i.quantity);
      });
      summary.by_variant=Object.keys(groups).map(function(k){return groups[k];}); summary.net_collected_minor=summary.collected_minor-summary.refunded_minor;
      var filtered = orders.filter(function(o) { return (!status || o.order_status===status) && (!search || [o.id,o.customer_name,o.phone].join(' ').toLowerCase().indexOf(search)>=0); }).sort(function(a,b) {return String(b.created_at).localeCompare(String(a.created_at));});
      return {appearance:appearance_(),actor:actor,orders:filtered.slice(0,200).map(adminSafeOrder_),matched_count:filtered.length,summary:summary,readiness:launchReadiness_(settings_()),settings:settings_(),pending_count:all.filter(function(o){return o.transaction_state==='pending';}).length};
    });
  });
}
function adminGetOrder(id) {
  return apiResult_(function() { requireAdmin_(); return withLock_(function() { recoverPending_(); return adminOrderDetail_(id); }); });
}
function adminSetOrderStatus(payload) {
  return apiResult_(function() {
    var actor = requireAdmin_(); payload=payload||{};
    return withLock_(function() { recoverPending_(); runOrderStatusChange_(text_(payload.order_id,100),text_(payload.status,30),actor); return adminOrderDetail_(payload.order_id); });
  });
}
function adminRecordPayment(payload) {
  return apiResult_(function() {
    var actor = requireAdmin_(); payload=payload||{};
    return withLock_(function() { recoverPending_(); recordPayment_(text_(payload.order_id,100),payload.amount_minor,text_(payload.kind,20),text_(payload.note || '',250),actor,text_(payload.mutation_key || '',100)); return adminOrderDetail_(payload.order_id); });
  });
}
function adminRecoverPending() {
  return apiResult_(function() { var actor=requireAdmin_(); return withLock_(function() { var n=recoverPending_(); audit_(actor,'recover_pending','store',{recovered:n}); return {recovered:n}; }); });
}
function validateSetting_(key,value) {
  if (['test_mode','orders_open','real_content_confirmed'].indexOf(key)>=0) {
    if (typeof value!=='boolean') fail_('VALIDATION','قيمة الإعداد يجب أن تكون true أو false.'); return value;
  }
  var numeric={max_order_qty:[1,20],min_form_seconds:[1,60],global_orders_per_hour:[1,300],phone_orders_per_hour:[1,20]};
  if (numeric[key]) { var n=Number(value), bounds=numeric[key]; if (!Number.isInteger(n)||n<bounds[0]||n>bounds[1]) fail_('VALIDATION','قيمة إعداد الحماية خارج النطاق المسموح.'); return n; }
  value=text_(value,key.indexOf('policy')>=0?3000:1000);
  if (key==='payment_method' && ['demo','cod','manual_transfer'].indexOf(value)<0) fail_('VALIDATION','طريقة دفع غير صالحة.');
  if (key==='contact_email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) fail_('VALIDATION','بريد التواصل غير صالح.');
  if (key==='contact_phone' && value && !/^\+?[\d\s()-]{8,25}$/.test(value)) fail_('VALIDATION','رقم التواصل غير صالح.');
  return value;
}
function adminUpdateSettings(payload) {
  return apiResult_(function() {
    var actor=requireAdmin_(), values=payload&&payload.values;
    if (!values || typeof values!=='object' || Array.isArray(values) || Object.keys(values).length>STORE_.editableSettings.length) fail_('VALIDATION','إعدادات غير صالحة.');
    var cleaned={}; Object.keys(values).forEach(function(k) { if (STORE_.editableSettings.indexOf(k)<0) fail_('FORBIDDEN','لا يمكن تغيير هذا الإعداد من الواجهة.'); cleaned[k]=validateSetting_(k,values[k]); });
    return withLock_(function() {
      var old=settings_(), next=Object.assign({},old,cleaned);
      if (next.orders_open && next.test_mode) fail_('NOT_READY','أبقِ فتح البيع الحقيقي مغلقًا في وضع التجربة. يمكن إرسال الطلبات التجريبية بدونه.');
      var check=launchReadiness_(next);
      if (next.orders_open && !check.ready) fail_('NOT_READY','لا يمكن فتح البيع قبل استكمال جميع عناصر الجاهزية.');
      // Fail closed during multiple Settings row writes. Reopening is always the final write.
      patch_('Settings','orders_open',{value:false}); flush_();
      audit_(actor,'settings_update','store',{keys:Object.keys(cleaned),orders_open:next.orders_open,test_mode:next.test_mode});
      Object.keys(cleaned).filter(function(k){return k!=='orders_open';}).forEach(function(k){patch_('Settings',k,{value:cleaned[k]});}); flush_();
      if (next.orders_open) { var actual=launchReadiness_(settings_()); if (!actual.ready) fail_('NOT_READY','حُفظت الإعدادات وبقي البيع مغلقًا لحين استكمال الجاهزية.'); patch_('Settings','orders_open',{value:true}); flush_(); }
      return {settings:settings_(),readiness:launchReadiness_(settings_())};
    });
  });
}

// ===== Code.gs: routing =====
function doGet(e) {
  var admin = e && e.parameter && e.parameter.admin === '1';
  if (admin) {
    try { requireAdmin_(); } catch (err) {
      return HtmlService.createHtmlOutput('<html lang="ar" dir="rtl"><meta name="viewport" content="width=device-width, initial-scale=1"><title>الدخول غير مسموح</title><body style="font-family:Arial;padding:40px"><h1>الدخول غير مسموح</h1><p>استخدم رابط نشر الإدارة بحساب Google المصرح له. يجب نشر الإدارة بخيار التنفيذ باسم المستخدم الذي يدخل التطبيق.</p></body></html>');
    }
  }
  return HtmlService.createTemplateFromFile(admin ? 'Admin' : 'Index').evaluate().setTitle(admin ? 'إدارة المتجر' : 'BRAND NAME — طلب مسبق').addMetaTag('viewport','width=device-width, initial-scale=1');
}

/** Website Appearance Editor. Keys are isolated from commerce & launch settings. */
var APPEARANCE_DEFAULTS_ = Object.freeze({
  hero_title:'GENRAGE', hero_kicker:'NEW ARRIVALS / 2026',
  hero_description:'Born in the streets. GENRAGE delivers elevated essentials for a modern generation — premium streetwear with a bold, timeless edge.',
  hero_word:'GENRAGE', thumbnail_image_url:'',
  hero_button:'Shop now', hero_image_url:'', editorial_image_url:'',
  theme:'minimal', scroll_animation:'reveal', announcement_text:'',
  section_label:'01 — THE EDIT', footer_note:'A new point of view.'
});
function appearance_(){
  var saved=settings_(), out={};
  Object.keys(APPEARANCE_DEFAULTS_).forEach(function(k){
    var v=saved['appearance_'+k];
    out[k]=v===undefined||v===null ? APPEARANCE_DEFAULTS_[k] : String(v);
  });
  return out;
}
function validateAppearance_(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))fail_('VALIDATION','Invalid appearance settings.');
  var allowed=Object.keys(APPEARANCE_DEFAULTS_), cleaned={};
  if(Object.keys(raw).some(function(k){return allowed.indexOf(k)<0;}))fail_('VALIDATION','Unknown appearance option.');
  allowed.forEach(function(k){
    if(!Object.prototype.hasOwnProperty.call(raw,k))return;
    var v=text_(raw[k],k.indexOf('_url')>=0?1800:180);
    if(k==='theme'&&['editorial','minimal','dark'].indexOf(v)<0)fail_('VALIDATION','Invalid theme.');
    if(k==='scroll_animation'&&['reveal','parallax','off'].indexOf(v)<0)fail_('VALIDATION','Invalid animation setting.');
    if(k.indexOf('_url')>=0&&v&&!/^https:\/\/[^\s<>"']+$/i.test(v))fail_('VALIDATION','Image URL must use HTTPS.');
    cleaned[k]=v;
  });
  return cleaned;
}
function adminSaveAppearance(payload){
  return apiResult_(function(){
    var actor=requireAdmin_(), cleaned=validateAppearance_(payload&&payload.values);
    return withLock_(function(){
      var existing=settings_();
      Object.keys(cleaned).forEach(function(k){
        var key='appearance_'+k;
        if(Object.prototype.hasOwnProperty.call(existing,key))patch_('Settings',key,{value:cleaned[k]});
        else insert_('Settings',{key:key,value:cleaned[k],description:'Website Editor — '+k});
      });
      flush_();
      audit_(actor,'appearance_updated','store',{fields:Object.keys(cleaned)});
      return {appearance:appearance_()};
    });
  });
}
/** Intended only for images displayed publicly on the storefront. */
function adminUploadAppearanceImage(payload){
  return apiResult_(function(){
    var actor=requireAdmin_();
    if(!payload||typeof payload!=='object'||!/^image\/(jpeg|png|webp)$/.test(String(payload.mime||'')))fail_('VALIDATION','Use a JPG, PNG or WebP image.');
    var base64=String(payload.base64||'');
    if(base64.length<10||base64.length>2700000||!/^[A-Za-z0-9+\/]+=*$/.test(base64))fail_('VALIDATION','Image must be 2 MB or less.');
    var bytes=Utilities.base64Decode(base64);
    if(bytes.length>2000000)fail_('VALIDATION','Image exceeds 2 MB.');
    // Validate basic file signatures, not only client-provided MIME.
    var header=bytes.slice(0,12).map(function(b){return(b+256)%256;});
    var jpg=header[0]===255&&header[1]===216&&header[2]===255;
    var png=header[0]===137&&header[1]===80&&header[2]===78&&header[3]===71;
    var webp=String.fromCharCode.apply(null,header.slice(0,4))==='RIFF'&&String.fromCharCode.apply(null,header.slice(8,12))==='WEBP';
    if(!((payload.mime==='image/jpeg'&&jpg)||(payload.mime==='image/png'&&png)||(payload.mime==='image/webp'&&webp)))fail_('VALIDATION','File format does not match its contents.');
    var props=PropertiesService.getScriptProperties(), folderId=props.getProperty('STORE_PUBLIC_MEDIA_FOLDER_ID'),folder;
    if(folderId){folder=DriveApp.getFolderById(folderId);}
    else{
      folder=DriveApp.createFolder('Brand Store — PUBLIC website photos');
      props.setProperty('STORE_PUBLIC_MEDIA_FOLDER_ID',folder.getId());
    }
    var extension=payload.mime==='image/jpeg'?'jpg':payload.mime==='image/png'?'png':'webp';
    var file=folder.createFile(Utilities.newBlob(bytes,payload.mime,'brand-'+Utilities.getUuid()+'.'+extension));
    try{
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK,DriveApp.Permission.VIEW);
    }catch(e){
      file.setTrashed(true);
      fail_('SHARING_BLOCKED','Public image sharing is blocked by your Google account policy. Use a publicly hosted HTTPS image URL instead.');
    }
    var url='https://lh3.googleusercontent.com/d/'+encodeURIComponent(file.getId());
    audit_(actor,'public_media_uploaded',file.getId(),{mime:payload.mime,size:bytes.length});
    return {url:url,file_id:file.getId(),note:'Public image. Availability of Google Drive image delivery should be tested on an unsigned-in device.'};
  });
}
