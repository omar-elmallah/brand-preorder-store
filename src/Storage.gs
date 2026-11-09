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
