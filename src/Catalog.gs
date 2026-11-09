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
    return {settings:publicSettings_(s),product:p ? {id:p.id,name:p.name,description:p.description,material:p.material,fit:p.fit,images:imageUrls_(p.image_urls),is_demo:isTrue_(p.is_demo)} : null,
      variants:variants,sizeGuide:guide,shipping:shipping,readiness:readiness_(s,products,allVariants,allShipping,allGuide),checkout:Object.assign(createCheckoutToken_(),{max_order_qty:numericSetting_(s,'max_order_qty',5,1,20)})};
  });
}
