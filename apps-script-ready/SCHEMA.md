# الجداول الفعلية وترتيب الأعمدة

مولّد من STORE_.schemas وبذور الإعداد في الكود نفسه. أسماء الجداول والأعمدة حساسة للحروف؛ لا تغيّر ترتيبها. الصف الأول للعناوين فقط. يوقف setupStore الإعداد قبل أي تعديل عند وجود جدول قديم غير مطابق، ويوقف الخادم استخدام جدول تغيرت بنيته. لا تحتاج إلى إنشاء أي جدول أو عنوان يدويًا.

## Products

بيانات المنتج وصوره.

| الترتيب | العمود |
|---:|---|
| 1 | `id` |
| 2 | `name` |
| 3 | `description` |
| 4 | `material` |
| 5 | `fit` |
| 6 | `image_urls` |
| 7 | `active` |
| 8 | `is_demo` |

## Variants

SKU والألوان والمقاسات والسعر والتفعيل والسعة.

| الترتيب | العمود |
|---:|---|
| 1 | `id` |
| 2 | `product_id` |
| 3 | `color` |
| 4 | `color_label` |
| 5 | `size` |
| 6 | `price_minor` |
| 7 | `active` |
| 8 | `preorder_limit` |
| 9 | `is_demo` |

## SizeGuide

قياسات المقاسات بالسنتيمتر.

| الترتيب | العمود |
|---:|---|
| 1 | `id` |
| 2 | `size` |
| 3 | `chest_cm` |
| 4 | `length_cm` |
| 5 | `sleeve_cm` |
| 6 | `notes` |
| 7 | `is_demo` |

## Orders

بيانات الطلبات؛ يكتبها التطبيق فقط.

| الترتيب | العمود |
|---:|---|
| 1 | `id` |
| 2 | `created_at` |
| 3 | `updated_at` |
| 4 | `customer_name` |
| 5 | `phone` |
| 6 | `governorate_id` |
| 7 | `city` |
| 8 | `address` |
| 9 | `notes` |
| 10 | `subtotal_minor` |
| 11 | `shipping_minor` |
| 12 | `total_minor` |
| 13 | `payment_method` |
| 14 | `payment_status` |
| 15 | `collected_minor` |
| 16 | `refunded_minor` |
| 17 | `order_status` |
| 18 | `mode` |
| 19 | `idempotency_hash` |
| 20 | `payload_hash` |
| 21 | `transaction_state` |
| 22 | `item_count` |
| 23 | `utm_source` |
| 24 | `utm_medium` |
| 25 | `utm_campaign` |
| 26 | `utm_term` |
| 27 | `utm_content` |
| 28 | `capacity_released` |

## OrderItems

نسخة تفاصيل وسعر القطع عند الطلب؛ يكتبها التطبيق.

| الترتيب | العمود |
|---:|---|
| 1 | `id` |
| 2 | `order_id` |
| 3 | `variant_id` |
| 4 | `product_id` |
| 5 | `product_name` |
| 6 | `color` |
| 7 | `color_label` |
| 8 | `size` |
| 9 | `quantity` |
| 10 | `unit_price_minor` |
| 11 | `line_total_minor` |
| 12 | `mode` |

## Shipping

المحافظات ورسومها ومدة التوصيل.

| الترتيب | العمود |
|---:|---|
| 1 | `id` |
| 2 | `governorate` |
| 3 | `fee_minor` |
| 4 | `delivery_days` |
| 5 | `active` |
| 6 | `is_demo` |

## Settings

الإعدادات التشغيلية والنصوص.

| الترتيب | العمود |
|---:|---|
| 1 | `key` |
| 2 | `value` |
| 3 | `description` |

## AuditLog

التغييرات الإدارية؛ يكتبها التطبيق.

| الترتيب | العمود |
|---:|---|
| 1 | `id` |
| 2 | `created_at` |
| 3 | `actor` |
| 4 | `action` |
| 5 | `entity_id` |
| 6 | `changes_json` |

## مفاتيح Settings

القيم التالية افتراضية وآمنة للتجربة. العملات أعداد صحيحة بالقرش المصري؛ 65000 = 650 جنيهًا. الأعلام Boolean أو النص الحرفي TRUE/FALSE. موعد shipping_expected نص YYYY-MM-DD.

| key | القيمة الافتراضية | الوصف |
|---|---|---|
| `brand_name` | `BRAND NAME` | اسم مؤقت؛ يُستبدل قبل الإطلاق |
| `brand_description` | `قطعة واحدة. تفاصيل تعبر عنك.` | وصف البراند |
| `test_mode` | `true` | true للتجربة المعزولة، false للبيع الحقيقي بعد الجاهزية |
| `orders_open` | `false` | فتح الطلبات الحقيقية؛ لا يمنع تجربة الطلب الواضحة |
| `payment_method` | `demo` | demo أو cod أو manual_transfer |
| `shipping_expected` | فارغ | موعد تجهيز وتسليم الطلبات لشركة الشحن؛ حدده قبل الإطلاق |
| `preorder_message` | `المنتج بنظام الطلب المسبق. يبدأ التجهيز بعد اعتماد تفاصيل الإطلاق.` | رسالة الطلب المسبق |
| `shipping_policy` | فارغ | سياسة الشحن المعتمدة |
| `exchange_policy` | فارغ | سياسة الاستبدال المعتمدة |
| `return_policy` | فارغ | سياسة الاسترجاع المعتمدة |
| `contact_phone` | فارغ | رقم التواصل المعتمد |
| `contact_email` | فارغ | بريد التواصل |
| `real_content_confirmed` | `false` | تأكيد مراجعة الصور والخامة والمقاسات والأسعار والسياسات |
| `max_order_qty` | `5` | أقصى عدد قطع للطلب (1–20) |
| `min_form_seconds` | `3` | حد أدنى لزمن النموذج؛ حماية محدودة |
| `global_orders_per_hour` | `60` | حد طلبات الساعة للمشروع (1–300) |
| `phone_orders_per_hour` | `3` | حد طلبات الساعة للهاتف (1–20) |

## Script Properties

- `STORE_ADMIN_EMAILS`: تضيفه يدويًا؛ حساب Google واحد أو حسابان فقط، بفاصلة إنجليزية.
- `STORE_SPREADSHEET_ID`: تحفظه setupStore من الشيت المرتبط الحالي؛ لا تضفه أو تغيّره يدويًا. طلبات الويب تستخدم openById لهذا المعرف ولا تستخدم Active Spreadsheet.
- `STORE_INITIAL_SEED_PENDING` و`STORE_INITIAL_SEED_COMPLETE`: علامتان داخليتان لاستكمال أول تهيئة بأمان ومنع إعادة بذور الكتالوج المحذوفة عمدًا. لا تعدلهما.

تبويب Google الافتراضي الفارغ وأي تبويبات إضافية موجودة تظل كما هي؛ الجداول الثمانية أعلاه وحدها تخص التطبيق. لا توجد بيانات عملاء أو طلبات افتراضية. يبدأ AuditLog بسجل إعداد فعلي، وليس طلب عميل تجريبيًا.
