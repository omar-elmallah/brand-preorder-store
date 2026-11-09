var storeCache_;
function getStore_() {
  if (storeCache_) return storeCache_;
  var id = PropertiesService.getScriptProperties().getProperty('STORE_SPREADSHEET_ID');
  if (!id) fail_('NOT_CONFIGURED', 'لم يكتمل إعداد المتجر بعد.');
  var ss = SpreadsheetApp.openById(id);
  var scriptId = ScriptApp.getScriptId();
  var valid = ss.getDeveloperMetadata().some(function(m) { return m.getKey() === STORE_.marker && m.getValue() === scriptId; });
  if (!valid) fail_('WRONG_STORE', 'هذا الشيت لا يخص مشروع المتجر المستقل. لم يتم تعديله.');
  storeCache_ = ss;
  return ss;
}
function sheet_(name) {
  if (!Object.prototype.hasOwnProperty.call(STORE_.schemas, name)) fail_('SCHEMA', 'جدول غير صالح.');
  var sheet = getStore_().getSheetByName(name);
  if (!sheet) fail_('SCHEMA', 'شغّل setupStore من محرر المشروع لاستكمال الجداول.');
  return sheet;
}
function headers_(sheet) {
  return sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0].map(String);
}
function cleanValue_(v) { return v instanceof Date ? v.toISOString() : v; }
function rows_(name) {
  var s = sheet_(name), n = s.getLastRow();
  if (n < 2) return [];
  var data = s.getRange(1,1,n,s.getLastColumn()).getValues(), head = data.shift();
  return data.filter(function(r) { return String(r[0]) !== ''; }).map(function(r) { var o = {}; head.forEach(function(k,i) { o[k] = cleanValue_(r[i]); }); return o; });
}
function safeCell_(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string') return /^[\s\uFEFF]*[=+\-@]/.test(v) ? "'" + v : v;
  if (typeof v === 'number' && !Number.isFinite(v)) fail_('VALIDATION', 'قيمة رقمية غير صالحة.');
  return v;
}
function insert_(name, obj) {
  var s = sheet_(name), head = headers_(s), key = head[0];
  if (!obj[key]) fail_('SCHEMA', 'معرف السجل مطلوب.');
  if (rows_(name).some(function(r) { return String(r[key]) === String(obj[key]); })) fail_('DUPLICATE', 'معرف سجل مكرر.');
  s.getRange(s.getLastRow()+1,1,1,head.length).setValues([head.map(function(h) { return safeCell_(obj[h]); })]);
}
function patch_(name, id, changes) {
  var s = sheet_(name), head = headers_(s), data = s.getDataRange().getValues();
  for (var i=1; i<data.length; i++) {
    if (String(data[i][0]) !== String(id)) continue;
    // Only write changed cells: untouched text is not reinterpreted as a formula.
    Object.keys(changes).sort(function(a,b) { return a==='updated_at' ? 1 : b==='updated_at' ? -1 : 0; }).forEach(function(k) { var col = head.indexOf(k); if (col === 0 && String(changes[k])===String(id)) return; if (col < 0 || col === 0) fail_('SCHEMA', 'حقل تعديل غير صالح.'); s.getRange(i+1,col+1).setValue(safeCell_(changes[k])); });
    return;
  }
  fail_('NOT_FOUND', 'السجل غير موجود.');
}
function removeBy_(name, key, value) {
  var s = sheet_(name), head = headers_(s), col = head.indexOf(key);
  if (col < 0) fail_('SCHEMA', 'حقل غير صالح.');
  var data = s.getDataRange().getValues();
  for (var i=data.length-1; i>0; i--) if (String(data[i][col]) === String(value)) s.deleteRow(i+1);
}
function flush_() { SpreadsheetApp.flush(); }
function settings_() {
  var result = {}; rows_('Settings').forEach(function(r) { result[r.key] = r.value; });
  result.test_mode = isTrue_(result.test_mode); result.orders_open = isTrue_(result.orders_open);
  result.real_content_confirmed = isTrue_(result.real_content_confirmed);
  return result;
}
