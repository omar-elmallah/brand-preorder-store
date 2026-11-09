function doGet(e) {
  var admin = e && e.parameter && e.parameter.admin === '1';
  if (admin) {
    try { requireAdmin_(); } catch (err) {
      return HtmlService.createHtmlOutput('<html lang="ar" dir="rtl"><meta name="viewport" content="width=device-width, initial-scale=1"><title>الدخول غير مسموح</title><body style="font-family:Arial;padding:40px"><h1>الدخول غير مسموح</h1><p>استخدم رابط نشر الإدارة بحساب Google المصرح له. يجب نشر الإدارة بخيار التنفيذ باسم المستخدم الذي يدخل التطبيق.</p></body></html>');
    }
  }
  return HtmlService.createTemplateFromFile(admin ? 'Admin' : 'Index').evaluate().setTitle(admin ? 'إدارة المتجر' : 'BRAND NAME — طلب مسبق').addMetaTag('viewport','width=device-width, initial-scale=1');
}
function include_(file) {
  if (['Styles','Storefront'].indexOf(file)<0) fail_('VALIDATION','ملف غير صالح.');
  return HtmlService.createHtmlOutputFromFile(file).getContent();
}
