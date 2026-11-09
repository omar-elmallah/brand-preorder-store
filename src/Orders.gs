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
