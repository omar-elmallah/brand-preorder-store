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
