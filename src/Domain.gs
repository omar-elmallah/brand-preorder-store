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
