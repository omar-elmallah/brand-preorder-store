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
      return {actor:actor,orders:filtered.slice(0,200).map(adminSafeOrder_),matched_count:filtered.length,summary:summary,readiness:launchReadiness_(settings_()),settings:settings_(),pending_count:all.filter(function(o){return o.transaction_state==='pending';}).length};
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
