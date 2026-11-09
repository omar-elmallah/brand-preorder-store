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
