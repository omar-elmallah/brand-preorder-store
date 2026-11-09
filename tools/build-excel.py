#!/usr/bin/env python3
"""Generate an offline Excel preparation workbook from the real Apps Script seed.
Development only: Python 3 + xlsxwriter + openpyxl + Node.js. No Google access.
"""
import json
import subprocess
from pathlib import Path
import xlsxwriter
from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parents[1]
EXPORT = """const {createRuntime}=require('./tools/runtime.cjs');const r=createRuntime();const schemas=JSON.parse(JSON.stringify(r.context.STORE_.schemas));const data={};for(const name of Object.keys(schemas))data[name]=['Orders','OrderItems','AuditLog'].includes(name)?[]:r.read(name);process.stdout.write(JSON.stringify({schemas,data}));"""
snapshot = json.loads(subprocess.check_output(['node', '-e', EXPORT], cwd=ROOT, text=True))
TARGET = ROOT / 'templates' / 'brand-store-template.xlsx'
TARGET.parent.mkdir(exist_ok=True)
workbook = xlsxwriter.Workbook(TARGET, {'strings_to_formulas': False, 'strings_to_urls': False})
workbook.set_properties({'title': 'BRAND NAME — تجهيز متجر الطلب المسبق', 'subject': 'Offline demo preparation template', 'author': 'BRAND NAME', 'comments': 'Demo only. No customer records, credentials, live Google binding or macros.'})
workbook.set_calc_mode('auto')
WINE, INK, PAPER, MUTED, BLUE = '#651E32', '#211C1D', '#FAF8F3', '#786D6A', '#1F5878'
base = {'font_name': 'Arial', 'font_size': 11, 'reading_order': 2, 'valign': 'vcenter'}
def fmt(**kwargs): return workbook.add_format({**base, **kwargs})
formats = {
 'title': fmt(bold=True, font_size=26, font_color='white', bg_color=INK, align='right'),
 'eyebrow': fmt(bold=True, font_size=10, font_color='white', bg_color=WINE, align='right'),
 'heading': fmt(bold=True, font_size=15, font_color=WINE),
 'body': fmt(text_wrap=True, font_color=INK),
 'muted': fmt(text_wrap=True, font_color=MUTED, font_size=10),
 'warning': fmt(text_wrap=True, bold=True, font_color=WINE, bg_color='#F1E4E7', border=1, border_color='#E1C9D0'),
 'header': fmt(bold=True, font_color='white', bg_color=WINE, text_wrap=True, align='center', reading_order=1, border=1, border_color=WINE),
 'text': fmt(font_color=BLUE, num_format='@', text_wrap=True, align='right'),
 'id': fmt(font_color=MUTED, num_format='@', reading_order=1, align='left'),
 'number': fmt(font_color=BLUE, num_format='#,##0.##', align='center'),
 'money': fmt(font_color=BLUE, num_format='#,##0" قرش"', align='center'),
 'bool': fmt(font_color=BLUE, align='center', reading_order=1),
 'link': fmt(font_color=WINE, underline=True, bold=True, bg_color='#F0EAE3'),
 'card': fmt(font_size=25, bold=True, font_color=WINE, bg_color='#F0EAE3', num_format='#,##0.00" ج.م"', align='center'),
 'card_label': fmt(font_size=10, font_color=MUTED, bg_color='#F0EAE3', align='center', text_wrap=True),
 'status': fmt(font_color=WINE, bg_color='#F1E4E7', align='center'),
}
comments = {
 'id':'معرف ثابت وفريد. لا تعِد استخدامه لمنتج آخر ولا تعتمد على رقم الصف.',
 'key':'اسم إعداد ثابت يستخدمه الكود. لا تغيّر أسماء المفاتيح.',
 'value':'قيمة الإعداد. راجع وصف الصف ونوعه؛ إعدادات التجربة تبدأ TRUE، وفتح البيع FALSE.',
 'price_minor':'سعر القطعة بالقرش، عدد صحيح موجب: 65000 = 650 جنيهًا. القيمة الحالية تجريبية.',
 'fee_minor':'رسوم الشحن بالقرش، عدد صحيح غير سالب: 6000 = 60 جنيهًا. القيمة الحالية تجريبية.',
 'preorder_limit':'فارغ = لا سقف محدد. صفر = غير متاح. غير ذلك عدد قطع صحيح غير سالب.',
 'active':'TRUE متاح، FALSE غير مفعّل. لا تستخدم نعم/لا أو 1/0.',
 'is_demo':'TRUE يعني بيانات تجريبية. لا تجعلها FALSE قبل مراجعة بيانات المنتج الحقيقي.',
 'image_urls':'نص JSON لمصفوفة روابط صور HTTPS، مثال: ["https://example.com/photo.jpg"]. [] يعني لم تُجهز الصور.',
 'product_id':'معرف من Products، مع الحفاظ على العلاقة بالمنتج.',
 'variant_id':'معرف SKU من Variants. يُسجله التطبيق تلقائيًا في بنود الطلب.',
 'phone':'نص للحفاظ على الصفر الأول. لا توجد بيانات عملاء فعلية في هذا الملف.',
 'delivery_days':'مدة التوصيل بعد تسليم الطلب لشركة الشحن؛ منفصلة عن موعد التجهيز والشحن المتوقع.',
 'created_at':'يسجله التطبيق بصيغة ISO. العرض التشغيلي بتوقيت Africa/Cairo.',
 'order_status':'حالة تنفيذ الطلب مستقلة عن حالة الدفع. تُغيّر من الإدارة فقط.',
 'payment_status':'لا يعني الدفع عند الاستلام أن أموالًا تم تحصيلها. التسجيل من الإدارة فقط.',
 'mode':'demo للطلبات التجريبية، live للحقيقية. لا تحوّل الطلب التجريبي إلى حقيقي.',
}
editable = {'Products', 'Variants', 'SizeGuide', 'Shipping', 'Settings'}
guide = workbook.add_worksheet('ابدأ هنا')
sheets = {name: workbook.add_worksheet(name) for name in snapshot['schemas']}
launch = workbook.add_worksheet('تجهيز الإطلاق')
for ws in [guide, *sheets.values(), launch]:
 ws.right_to_left(); ws.hide_gridlines(2); ws.set_zoom(90); ws.set_paper(9)
 ws.set_landscape(); ws.fit_to_pages(1,0); ws.set_margins(.3,.3,.4,.4)
 ws.set_footer('&RBRAND NAME | نسخة تجهيز وتجربة&C&P / &N')

def layout_page(ws):
 ws.set_column('A:A',3); ws.set_column('B:L',12); ws.set_column('M:M',3)
 ws.set_default_row(24); ws.set_tab_color(WINE)
 ws.merge_range('B2:L2','PRE-ORDER  /  تجهيز المتجر',formats['eyebrow']); ws.set_row(1,25)
 ws.merge_range('B3:L4','BRAND NAME',formats['title'])

layout_page(guide)
guide.merge_range('B6:L7','وضع تجريبي واضح — السعر والمقاسات والشحن أمثلة للتجربة. البيع الحقيقي مغلق، ولا توجد طلبات أو بيانات عملاء في هذا الملف.',formats['warning'])
for label, where, cells, formula, value in [
 ('سعر قطعة — مثال تجريبي','B9:D9','B10:D11','=Variants!F2/100',650),
 ('شحن القاهرة — مثال تجريبي','F9:H9','F10:H11','=Shipping!C2/100',60),
 ('إجمالي المثال — ليس طلبًا','J9:L9','J10:L11','=Variants!F2/100+Shipping!C2/100',710)]:
 guide.merge_range(where,label,formats['card_label']); guide.merge_range(cells,'',formats['card']); guide.write_formula(cells.split(':')[0],formula,formats['card'],value)
guide.merge_range('B13:L13','ابدأ بالبيانات دي',formats['heading'])
sections = [
 ('Products','اسم القطعة، وصفها، الخامة، القَصّة، وروابط الصور.'),
 ('Variants','الأسود والبرجندي × المقاسات. الأسعار بالقرش، مع التفعيل والسعة الاختيارية.'),
 ('SizeGuide','قياسات كل مقاس بالسنتيمتر. القياسات الحالية تجريبية.'),
 ('Shipping','المحافظات والرسوم ومدة التوصيل بعد الشحن. صفّان تجريبيان فقط.'),
 ('Settings','اسم البراند، التواصل، الدفع، المواعيد، والسياسات. لا تغيّر أسماء المفاتيح.'),
 ('تجهيز الإطلاق','قائمة مراجعة يدوية قبل فتح البيع الحقيقي.'),
]
for row,(name,note) in enumerate(sections,14):
 guide.merge_range(row,1,row,3,name,formats['link']); guide.write_url(row,1,f"internal:'{name}'!A1",formats['link'],name)
 guide.merge_range(row,4,row,11,note,formats['body']); guide.set_row(row,34)
guide.merge_range('B22:L22','الربط بالمتجر',formats['heading'])
steps = [
 '1  شغّل setupStore() في مشروع Apps Script الجديد؛ الدالة تنشئ شيت Google مستقلًا بعلامة ملكية المشروع.',
 '2  هذا الملف للتجهيز خارج Google. عند النقل للشيت الذي أنشأته الدالة، انقل القيم فقط إلى الجداول الخمسة القابلة للتعديل، مع الحفاظ على العناوين والمعرفات.',
 '3  لا تستبدل ملف Google بالكامل ولا تربط الكود بمعرف ملف Excel محوّل. لا تنقل هذا الملف فوق شيت أو مشروع سابق.',
 '4  Orders وOrderItems وAuditLog فارغة هنا؛ التطبيق يكتبها. لا تستخدم Excel لتغيير حالة طلب أو تسجيل دفعة يدوية.',
 '5  اترك test_mode=TRUE وorders_open=FALSE وreal_content_confirmed=FALSE لحين المراجعة الفعلية واختبارات Google.',
]
for i,step in enumerate(steps):
 row=23+i*2;guide.merge_range(row,1,row+1,11,step,formats['body']);guide.set_row(row,25);guide.set_row(row+1,20)
guide.merge_range('B35:L36','الأموال: 65000 قرش = 650 جنيهًا. موعد shipping_expected نص بصيغة YYYY-MM-DD. تفاصيل النقل موجودة في docs/EXCEL_GUIDE.md على GitHub.',formats['warning'])
guide.print_area('A1:M37'); guide.activate()

status_lists = {'order_status':['new','confirmed','preparing','shipped','delivered','cancelled','returned'], 'payment_status':['unpaid','partial','paid','refunded'], 'payment_method':['demo','cod','manual_transfer'], 'mode':['demo','live'], 'transaction_state':['pending','committed','aborted']}
for name, schema in snapshot['schemas'].items():
 ws=sheets[name]; data=snapshot['data'][name]; ws.freeze_panes(1,1); ws.set_row(0,40)
 ws.set_tab_color(WINE if name in editable else '#9B918A')
 ws.set_default_row(30)
 for col, key in enumerate(schema):
  is_id=key=='id' or key.endswith('_id') or key in ['key','phone','size','color','idempotency_hash','payload_hash']
  form=formats['id'] if is_id else formats['money'] if key.endswith('_minor') else formats['number'] if key.endswith('_cm') or key in ['quantity','item_count','preorder_limit'] else formats['bool'] if key in ['active','is_demo','capacity_released'] else formats['text']
  width=36 if is_id else 48 if key in ['description','material','fit','notes','address','changes_json'] else 42 if key=='image_urls' else max(15,min(28,len(key)+3))
  ws.set_column(col,col,width,form)
  if key in comments:ws.write_comment(0,col,comments[key],{'author':'دليل المتجر','width':360,'height':110})
  elif key.endswith('_minor'):ws.write_comment(0,col,'عدد صحيح بالقرش المصري. يُحسب أو يُسجل من خادم المتجر؛ ليس بالجنيه العشري.')
  elif key.endswith('_cm'):ws.write_comment(0,col,'قياس بالسنتيمتر. استبدل القياس التجريبي بقياس المنتج المعتمد.')
  validation=None
  if key in ['active','is_demo','capacity_released']:validation={'validate':'list','source':['TRUE','FALSE']}
  elif key in status_lists:validation={'validate':'list','source':status_lists[key]}
  elif key.endswith('_minor') or key in ['quantity','item_count','preorder_limit']:validation={'validate':'integer','criteria':'between','minimum':1 if key in ['price_minor','quantity','item_count'] else 0,'maximum':100000000}
  elif key.endswith('_cm'):validation={'validate':'decimal','criteria':'between','minimum':0.1,'maximum':300}
  if validation:ws.data_validation(1,col,500,col,{**validation,'ignore_blank':True,'error_type':'stop','error_title':'راجع القيمة','error_message':'استخدم النوع والقيمة المحددين. راجع ملاحظة عنوان العمود.'})
 table_data=[[row.get(key,'') for key in schema] for row in data]
 ws.add_table(0,0,max(len(data),1),len(schema)-1,{'name':'tbl'+name,'style':'Table Style Light 8','columns':[{'header':key,'header_format':formats['header']} for key in schema],'data':table_data})
 ws.print_area(0,0,max(len(data)+1,2),len(schema)-1);ws.repeat_rows(0)
 # Format rows and keep actual booleans and numbers typed, strings literal.
 for r,row in enumerate(data,1):
  for c,key in enumerate(schema):
   value=row.get(key,'')
   if isinstance(value,bool):ws.write_boolean(r,c,value,formats['bool'])
   elif isinstance(value,(int,float)):ws.write_number(r,c,value,formats['money'] if key.endswith('_minor') else formats['number'])
   elif value!='':ws.write_string(r,c,str(value))
   elif name=='Settings' and key=='value':ws.write_blank(r,c,None,formats['text'])
 if name=='Settings':
  ws.set_column('B:B',56,formats['text']);ws.set_column('C:C',66,formats['muted'])
  for r,row in enumerate(data,1):
   key=row['key'];ws.set_row(r,39)
   if key in ['test_mode','orders_open','real_content_confirmed']:ws.data_validation(r,1,r,1,{'validate':'list','source':['TRUE','FALSE']})
   if key=='payment_method':ws.data_validation(r,1,r,1,{'validate':'list','source':['demo','cod','manual_transfer']})
   if key=='shipping_expected':ws.write_comment(r,1,'نص فقط بصيغة YYYY-MM-DD، مثل 2026-12-01 كمثال تنسيق لا موعد معتمد. لا تدخله كتاريخ Excel رقمي.',{'author':'دليل المتجر','width':330,'height':95})

layout_page(launch)
launch.merge_range('B6:L7','قائمة مراجعة يدوية؛ لا تفتح البيع تلقائيًا ولا تثبت اكتمال إعدادات الخادم. لا تغيّر حالات المراجعة إلا بعد تحقق فعلي.',formats['warning'])
launch.merge_range('B9:H9','البند المطلوب',formats['header']);launch.merge_range('I9:L9','حالة المراجعة',formats['header'])
checks=[
 'اعتماد اسم البراند والوصف النهائي.',
 'صور المنتج الحقيقية والخامة والقَصّة وحقوق استخدام الصور.',
 'المقاسات والقياسات الحقيقية؛ إزالة صفوف SizeGuide التجريبية عند الاستبدال.',
 'اعتماد سعر كل لون ومقاس بالقرش، وتفعيل المتاح فقط.',
 'اعتماد محافظات الشحن ورسومها ومدة التوصيل بعد الشحن.',
 'اعتماد تاريخ الشحن المتوقع بصيغة YYYY-MM-DD، منفصلًا عن مدة التوصيل.',
 'اعتماد طريقة الدفع وتعليماتها؛ COD لا يعني تحصيلًا.',
 'اعتماد سياسات الشحن والاستبدال والاسترجاع وبيانات التواصل.',
 'استبدال أو تعطيل الديمو؛ لا تغيّر is_demo بلا مراجعة للبيانات الفعلية.',
 'إنشاء الشيت والمشروع المستقلين واختبار دخول عمر ومصطفى ورفض غيرهما.',
 'اختبار طلب كامل ومنع التكرار والسعة والإلغاء واستعادة الحفظ والدفع.',
 'اجتياز docs/GOOGLE_TESTS.md؛ ثم تأكيد المحتوى وفتح البيع يدويًا من الإدارة.',
]
for i,label in enumerate(checks,9):
 launch.merge_range(i,1,i,7,label,formats['body']);launch.merge_range(i,8,i,11,'لم يُراجع',formats['status']);launch.set_row(i,42)
 launch.data_validation(i,8,i,8,{'validate':'list','source':['لم يُراجع','تمت المراجعة']})
 launch.conditional_format(i,8,i,11,{'type':'text','criteria':'containing','value':'تمت المراجعة','format':fmt(bg_color='#E8F0E7',font_color='#365F39')})
launch.merge_range('B24:H24','بنود راجعتها فعليًا',formats['heading']);launch.merge_range('I24:L24','',formats['card']);launch.write_formula('I24','=COUNTIF(I10:I21,"تمت المراجعة")',fmt(bold=True,font_size=22,font_color=WINE,align='center'),0)
launch.merge_range('B27:L29','لا تضع بيانات عملاء أو أرقام تحويلات أو مفاتيح داخل نسخة على GitHub. المصنف الحالي عام وقابل للتحميل ويحتوي أمثلة فقط. احفظ أي نسخة تشغيلية لاحقة في مكان خاص.',formats['warning'])
launch.print_area('A1:M30')
workbook.close()

# Round-trip the saved binary: schema compatibility, preserved numeric money and
# boolean types, empty ledgers, no accidental code/URLs or formula errors.
saved=load_workbook(TARGET,data_only=False)
assert len(saved.sheetnames)==10
for name,schema in snapshot['schemas'].items():
 ws=saved[name]
 assert [ws.cell(1,i+1).value for i in range(len(schema))]==schema,name
 actual=[[ws.cell(r,c+1).value if ws.cell(r,c+1).value is not None else '' for c in range(len(schema))] for r in range(2,ws.max_row+1)]
 actual=[r for r in actual if r[0]!='']
 expected=[[row.get(k,'') for k in schema] for row in snapshot['data'][name]]
 assert actual==expected,(name,actual,expected)
 assert len({row[0] for row in actual})==len(actual),name
 assert all(cell.data_type!='f' for row in ws for cell in row),name
 assert ws.sheet_view.rightToLeft is True,name
for name in ['Orders','OrderItems','AuditLog']:
 assert all(cell.value is None for row in saved[name].iter_rows(min_row=2) for cell in row),name
settings={saved['Settings'].cell(r,1).value:saved['Settings'].cell(r,2).value for r in range(2,saved['Settings'].max_row+1)}
assert settings['test_mode'] is True and settings['orders_open'] is False and settings['real_content_confirmed'] is False
assert type(saved['Variants']['F2'].value) is int and saved['Variants']['F2'].value==65000
assert saved.vba_archive is None and not saved._external_links
cached=load_workbook(TARGET,data_only=True)
assert [cached['ابدأ هنا'][cell].value for cell in ['B10','F10','J10']]==[650,60,710]
assert cached['تجهيز الإطلاق']['I24'].value==0
print(json.dumps({'file':str(TARGET),'bytes':TARGET.stat().st_size,'tabs':10,'demo_variants':8,'customer_records':0,'real_sales_open':False,'roundtrip':'verified'},ensure_ascii=False))
