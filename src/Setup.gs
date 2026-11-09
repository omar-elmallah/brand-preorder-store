/** Run from editor after configuring STORE_ADMIN_EMAILS. Never accepts an external sheet ID. */
function setupStore() {
  return apiResult_(function() {
    var actor = requireAdmin_();
    return withLock_(function() {
      var props = PropertiesService.getScriptProperties();
      var ss;
      if (props.getProperty('STORE_SPREADSHEET_ID')) { ss = getStore_(); }
      else {
        ss = SpreadsheetApp.create('BRAND NAME — متجر مستقل — تجريبي');
        ss.addDeveloperMetadata(STORE_.marker, ScriptApp.getScriptId());
        // Store ID immediately: a retry completes this sheet rather than creating another.
        props.setProperty('STORE_SPREADSHEET_ID', ss.getId()); storeCache_ = ss;
      }
      ss.setSpreadsheetTimeZone(STORE_.timezone);
      Object.keys(STORE_.schemas).forEach(function(name) {
        var s = ss.getSheetByName(name) || ss.insertSheet(name), schema = STORE_.schemas[name];
        if (!s.getLastRow()) s.getRange(1,1,1,schema.length).setValues([schema]);
        else {
          var head = headers_(s);
          if (head[0] !== schema[0]) fail_('SCHEMA', 'يوجد تغيير غير متوافق في أسماء أعمدة ' + name);
          var missing = schema.filter(function(k) { return head.indexOf(k) < 0; });
          if (missing.length) s.getRange(1,head.length+1,1,missing.length).setValues([missing]);
        }
        s.setFrozenRows(1); s.getRange(1,1,1,s.getLastColumn()).setFontWeight('bold').setBackground('#f2e9df');
        // Treat free-text columns as text, preserve numbers/booleans as typed values.
        headers_(s).forEach(function(k,i) {
          if (!/_minor$|_cm$/.test(k) && ['quantity','item_count','preorder_limit','active','is_demo','capacity_released'].indexOf(k)<0) s.getRange(2,i+1,Math.max(s.getMaxRows()-1,1),1).setNumberFormat('@');
        });
      });
      seedStore_(); flush_();
      audit_(actor,'setup_store','store',{schema:1});
      var result = {spreadsheet_url:ss.getUrl(),test_mode:settings_().test_mode,note:'تم تجهيز المتجر. إعداداتك وطلباتك الحالية محفوظة.'};
      console.log(JSON.stringify(result)); return result;
    });
  });
}
function seedMissing_(name, list) {
  var key = STORE_.schemas[name][0], existing = rows_(name).map(function(r) { return String(r[key]); });
  list.forEach(function(r) { if (existing.indexOf(String(r[key])) < 0) { insert_(name,r); existing.push(String(r[key])); } });
}
function seedStore_() {
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
  seedMissing_('Settings',defaults);
  // Demo rows are restored only while real content has never been confirmed.
  // This avoids reintroducing a deleted demo SKU into a configured live catalog.
  if (isTrue_(settings_().real_content_confirmed)) return;
  seedMissing_('Products',[{id:'demo-sweatshirt',name:'سويت شيرت — نموذج تجريبي',description:'تصميم أولي لاستكشاف الألوان والمقاسات. تفاصيل المنتج النهائي لم تُعتمد بعد.',material:'خامة تجريبية — تُحدد قبل الإطلاق',fit:'قَصّة تجريبية — تُحدد قبل الإطلاق',image_urls:'[]',active:true,is_demo:true}]);
  var variants = []; ['black','burgundy'].forEach(function(c) { ['S','M','L','XL'].forEach(function(size) { variants.push({id:'demo-'+c+'-'+size,product_id:'demo-sweatshirt',color:c,color_label:c==='black'?'أسود':'برجندي',size:size,price_minor:65000,active:true,preorder_limit:'',is_demo:true}); }); });
  seedMissing_('Variants',variants);
  seedMissing_('SizeGuide',[['S',52,66,58],['M',55,69,60],['L',58,72,62],['XL',61,75,64]].map(function(r) { return {id:'demo-size-'+r[0],size:r[0],chest_cm:r[1],length_cm:r[2],sleeve_cm:r[3],notes:'قياسات تجريبية بالسنتيمتر وليست مواصفات المنتج الحقيقي',is_demo:true}; }));
  seedMissing_('Shipping',[{id:'demo-cairo',governorate:'القاهرة — تجريبي',fee_minor:6000,delivery_days:'2–4 أيام تجريبية بعد الشحن',active:true,is_demo:true},{id:'demo-giza',governorate:'الجيزة — تجريبي',fee_minor:6500,delivery_days:'2–4 أيام تجريبية بعد الشحن',active:true,is_demo:true}]);
}
