// Reviewed against the linked application source; update guides when workflows change.
export const HELP_REVIEWED_AT = "2026-10-13";
export const helpArticles = [
  {
    "id": "start",
    "category": "start",
    "roles": [
      "owner",
      "manager"
    ],
    "route": "/settings",
    "source": "src/pages/SettingsPage.jsx",
    "content": {
      "en": {
        "title": "Set up your business",
        "steps": [
          "Sign in with the account assigned to you. Check the business and branch shown before entering records.",
          "The owner sets the business identity and branches, then reviews Finance & Tax settings for currency and tax rules.",
          "Create products, suppliers and staff access before daily operations. Confirm a saved record appears in its list with the correct branch."
        ],
        "note": "Available modules and actions depend on your role, business type and subscription. Ask the owner if a section is missing."
      },
      "ar": {
        "title": "ابدأ إعداد منشأتك",
        "steps": [
          "سجّل الدخول بالحساب المخصص لك، وتأكد من اسم المنشأة والفرع قبل تسجيل أي حركة.",
          "يضبط المالك بيانات المنشأة والفروع، ثم يراجع إعدادات المالية والضريبة للعملة والقواعد الضريبية.",
          "أضف المنتجات والموردين وحسابات الموظفين قبل التشغيل اليومي. تأكد أن السجل المحفوظ ظهر في القائمة بالفرع الصحيح."
        ],
        "note": "الأقسام والإجراءات المتاحة تعتمد على الدور ونوع النشاط والاشتراك. اسأل المالك إذا لم يظهر قسم."
      },
      "fa": {
        "title": "شروع کار و تنظیم کسب‌وکار",
        "steps": [
          "با حساب تعیین‌شده وارد شوید. قبل از ثبت هر معامله، نام کسب‌وکار و شعبه را بررسی کنید.",
          "اونر مشخصات کسب‌وکار و شعبه‌ها را تنظیم کند؛ سپس در تنظیمات مالی و مالیات، ارز و قواعد مالیات را بررسی کند.",
          "پیش از کار روزانه، محصولات، سپلایرها و دسترسی کارکنان را ثبت کنید. مطمئن شوید رکورد ذخیره‌شده در لیست و شعبه درست دیده می‌شود."
        ],
        "note": "بخش‌ها و عملیات قابل دسترسی به نقش، نوع کسب‌وکار و اشتراک شما بستگی دارد. برای بخش گم‌شده از اونر بپرسید."
      }
    }
  },
  {
    "id": "daily",
    "category": "start",
    "roles": [
      "owner",
      "manager"
    ],
    "route": "/owner-command-center",
    "source": "src/pages/OwnerDashboard.jsx",
    "content": {
      "en": {
        "title": "Your daily operating checklist",
        "steps": [
          "At the start of the day, check the active branch, dashboard date and unresolved alerts. Review stock before selling.",
          "During the day, record sales, purchases and expenses in their own sections. Check the saved record before retrying a slow request.",
          "At closing, review cash, network and credit sales, outstanding supplier invoices and branch settlement. Compare the same branch and period in Reports."
        ],
        "note": "Sales, profit and available cash are different figures. A transfer between owner and branch is not another sale."
      },
      "ar": {
        "title": "قائمة العمل اليومية",
        "steps": [
          "بداية اليوم: راجع الفرع والتاريخ والتنبيهات المفتوحة، وافحص المخزون قبل البيع.",
          "خلال اليوم: سجّل المبيعات والمشتريات والمصروفات في أقسامها. افحص السجل المحفوظ قبل إعادة طلب بطيء.",
          "عند الإقفال: راجع النقد والشبكة والبيع الآجل وفواتير الموردين وتسوية الفرع. قارن نفس الفرع والفترة في التقارير."
        ],
        "note": "المبيعات والربح والنقد المتاح أرقام مختلفة. التحويل بين المالك والفرع ليس عملية بيع جديدة."
      },
      "fa": {
        "title": "چک‌لیست کار روزانه",
        "steps": [
          "اول روز، شعبه فعال، تاریخ داشبورد و هشدارهای باز را بررسی کنید. قبل از فروش موجودی را ببینید.",
          "در جریان روز، فروش، خرید و مصرف را در بخش مربوط ثبت کنید. پیش از تکرار درخواست کند، رکورد ذخیره‌شده را بررسی کنید.",
          "هنگام بستن روز، فروش نقدی، شبکه و قرضی، فاکتورهای سپلایر و حساب‌دهی شعبه را مرور کنید. گزارش‌ها را با همان شعبه و دوره مقایسه کنید."
        ],
        "note": "فروش، سود و پول موجود یک چیز نیستند. انتقال پول بین اونر و شعبه فروش جدید نیست."
      }
    }
  },
  {
    "id": "branches",
    "category": "start",
    "roles": [
      "owner"
    ],
    "route": "/branch-management",
    "source": "src/pages/BranchManagement.jsx",
    "content": {
      "en": {
        "title": "Branches and staff access",
        "steps": [
          "Open Branch Management and create or review each branch under the correct business.",
          "Use Users & Access or Staff Invitations to provision a staff account with its role and assigned branch.",
          "Review Role & Permissions before giving access. Ask staff to sign in and verify the branch displayed in their portal."
        ],
        "note": "An employee record alone does not prove that a login is provisioned. Never share the owner's account with staff."
      },
      "ar": {
        "title": "الفروع وصلاحيات الموظفين",
        "steps": [
          "افتح إدارة الفروع وأضف أو راجع كل فرع تحت المنشأة الصحيحة.",
          "استخدم المستخدمين والوصول أو دعوات الموظفين لإنشاء حساب بالدور والفرع المناسبين.",
          "راجع الأدوار والصلاحيات قبل منح الوصول، واطلب من الموظف التحقق من الفرع الظاهر بعد الدخول."
        ],
        "note": "وجود سجل موظف لا يعني بالضرورة وجود حساب دخول. لا تشارك حساب المالك مع الموظفين."
      },
      "fa": {
        "title": "شعبه‌ها و دسترسی کارکنان",
        "steps": [
          "مدیریت شعبه‌ها را باز کنید و هر شعبه را در کسب‌وکار درست ثبت یا بررسی کنید.",
          "از کاربران و دسترسی یا دعوت کارکنان، حساب کاربر را با نقش و شعبه مربوط ایجاد کنید.",
          "قبل از دادن دسترسی، نقش‌ها و صلاحیت‌ها را بررسی کنید. کارمند بعد از ورود نام شعبه خود را تأیید کند."
        ],
        "note": "ثبت مشخصات کارمند به‌تنهایی به معنی ایجاد حساب ورود نیست. حساب اونر را با کارکنان شریک نسازید."
      }
    }
  },
  {
    "id": "products",
    "category": "stock",
    "roles": [
      "owner",
      "manager"
    ],
    "route": "/product-management",
    "source": "src/components/products/ProductMasterWorkspace.jsx",
    "content": {
      "en": {
        "title": "Products, categories and import",
        "steps": [
          "Open Products and choose the correct catalog. Review the product name, unit, category, price and available stock fields.",
          "For bulk entry, use the import template provided by the product workspace. Keep its column names and test a small file first.",
          "Review imported rows and errors, then check the product list and the relevant POS menu before using it in a sale."
        ],
        "note": "Purchase units and sales portions can differ. A carton, kilogram and serving must not be treated as the same unit."
      },
      "ar": {
        "title": "المنتجات والتصنيفات والاستيراد",
        "steps": [
          "افتح المنتجات واختر الكتالوج الصحيح. راجع الاسم والوحدة والتصنيف والسعر وحقول المخزون المتاحة.",
          "للإدخال الجماعي استخدم قالب الاستيراد من صفحة المنتجات. احتفظ بأسماء الأعمدة وجرّب ملفاً صغيراً أولاً.",
          "راجع الصفوف والأخطاء بعد الاستيراد، ثم افحص قائمة المنتجات وقائمة نقطة البيع قبل البيع."
        ],
        "note": "وحدة الشراء قد تختلف عن حصة البيع. الكرتون والكيلو والحصة ليست وحدة واحدة."
      },
      "fa": {
        "title": "محصولات، دسته‌بندی و امپورت",
        "steps": [
          "محصولات را باز و کاتالوگ درست را انتخاب کنید. نام، واحد، دسته‌بندی، قیمت و فیلدهای موجودی را بررسی کنید.",
          "برای ثبت دسته‌جمعی، تمپلیت امپورت همان صفحه را بگیرید. نام ستون‌ها را تغییر ندهید و اول فایل کوچک را امتحان کنید.",
          "بعد از امپورت، ردیف‌ها و خطاها را بررسی کنید؛ سپس محصول را در لیست و منوی POS مربوط ببینید."
        ],
        "note": "واحد خرید و سهم فروش می‌تواند فرق داشته باشد. کارتن، کیلو و پرس را یک واحد حساب نکنید."
      }
    }
  },
  {
    "id": "inventory",
    "category": "stock",
    "roles": [
      "owner",
      "manager"
    ],
    "route": "/inventory",
    "source": "src/pages/Inventory.jsx",
    "content": {
      "en": {
        "title": "Stock, transfers and waste",
        "steps": [
          "Select the branch and product in Inventory. Check the displayed unit and stock quantity before making changes.",
          "Use Transfers for movement between branches and Waste for damaged or consumed stock that belongs in that workflow. Enter the actual quantity and reason.",
          "Review the saved movement and stock in both source and destination where relevant. Retail stock operations and control may appear as separate tabs."
        ],
        "note": "Do not create a purchase merely to correct a stock discrepancy. Investigate the original receipt, transfer or count first."
      },
      "ar": {
        "title": "المخزون والتحويلات والهدر",
        "steps": [
          "حدد الفرع والمنتج في المخزون، وتحقق من الوحدة والكمية قبل التعديل.",
          "استخدم التحويلات لنقل المخزون بين الفروع والهدر للحركة المناسبة لهذا المسار. سجّل الكمية الفعلية والسبب.",
          "راجع الحركة المحفوظة ومخزون المصدر والوجهة عند الحاجة. قد تظهر عمليات وضبط مخزون التجزئة في تبويبات منفصلة."
        ],
        "note": "لا تنشئ مشتريات فقط لتصحيح فرق مخزون. راجع الاستلام والتحويل والجرد الأصلي أولاً."
      },
      "fa": {
        "title": "موجودی، انتقال و ضایعات",
        "steps": [
          "در انبار، شعبه و محصول را انتخاب کنید. واحد و مقدار موجودی را قبل از تغییر بررسی کنید.",
          "برای جابه‌جایی بین شعبه‌ها از انتقال و برای ضایعات از بخش ضایعات استفاده کنید. مقدار واقعی و دلیل را درج کنید.",
          "حرکت ذخیره‌شده و موجودی مبدأ و مقصد را بررسی کنید. در سوپرمارکت، عملیات و کنترل انبار ممکن است تب‌های جدا باشند."
        ],
        "note": "برای پوشاندن اختلاف موجودی خرید ساختگی ثبت نکنید؛ اول رسید خرید، انتقال یا شمارش اصلی را بررسی کنید."
      }
    }
  },
  {
    "id": "restaurant-pos",
    "category": "sales",
    "roles": [
      "owner",
      "manager"
    ],
    "route": "/restaurant/pos",
    "source": "src/pages/restaurant/RestaurantPOS.jsx",
    "content": {
      "en": {
        "title": "Restaurant POS: complete a sale",
        "steps": [
          "Open Restaurant POS, confirm the branch and add the customer's items. Check quantities, sizes, discounts and the final total.",
          "Choose the available payment method and complete payment once. Wait for a confirmed result before starting the next order.",
          "Use the receipt controls for printing. If payment succeeded but the next order did not open, use the next-order recovery action rather than charging again."
        ],
        "note": "A failed print is not evidence of a failed payment. Check the confirmed sale before retrying checkout."
      },
      "ar": {
        "title": "نقطة بيع المطعم: إتمام عملية بيع",
        "steps": [
          "افتح نقطة بيع المطعم وتأكد من الفرع وأضف طلب العميل. راجع الكميات والأحجام والخصم والمجموع النهائي.",
          "اختر وسيلة الدفع المتاحة وأكمل الدفع مرة واحدة. انتظر التأكيد قبل بدء طلب جديد.",
          "استخدم أدوات الفاتورة للطباعة. إذا نجح الدفع ولم يفتح الطلب التالي، استخدم استعادة الطلب التالي بدلاً من الدفع مجدداً."
        ],
        "note": "فشل الطباعة لا يعني فشل الدفع. تحقق من البيع المؤكد قبل تكرار الدفع."
      },
      "fa": {
        "title": "POS رستورانت: ثبت فروش",
        "steps": [
          "POS رستورانت را باز کنید، شعبه را تأیید و اقلام مشتری را اضافه کنید. تعداد، سایز، تخفیف و مبلغ نهایی را بررسی کنید.",
          "روش پرداخت موجود را انتخاب و پرداخت را یک‌بار تکمیل کنید. تا دریافت تأیید، سفارش بعدی را شروع نکنید.",
          "از دکمه‌های رسید برای چاپ استفاده کنید. اگر پرداخت موفق شد ولی سفارش بعدی باز نشد، بازیابی سفارش بعدی را بزنید؛ دوباره پول نگیرید."
        ],
        "note": "خرابی چاپ به معنی ناکامی پرداخت نیست. قبل از تکرار پرداخت، فروش ثبت‌شده را بررسی کنید."
      }
    }
  },
  {
    "id": "retail-pos",
    "category": "sales",
    "roles": [
      "owner",
      "manager"
    ],
    "route": "/retail/pos-control",
    "source": "src/pages/retail/pos/POSExecutiveDashboard.jsx",
    "content": {
      "en": {
        "title": "Retail POS and cashier devices",
        "steps": [
          "In retail mode, the owner reviews POS Control and branch devices. Confirm that the cashier account and device belong to the intended branch.",
          "At the cashier terminal, scan or select the product and review quantity, price and total before accepting payment.",
          "Complete the transaction once, then review the receipt and POS audit when investigating a discrepancy."
        ],
        "note": "A barcode must identify the intended product or variant. Test new barcodes before using them during a busy shift."
      },
      "ar": {
        "title": "نقطة بيع التجزئة وأجهزة الكاشير",
        "steps": [
          "في وضع التجزئة يراجع المالك مركز POS وأجهزة الفروع. تحقق من ربط حساب الكاشير والجهاز بالفرع الصحيح.",
          "في شاشة الكاشير امسح الباركود أو اختر المنتج وراجع الكمية والسعر والمجموع قبل الدفع.",
          "أكمل المعاملة مرة واحدة، ثم راجع الفاتورة وسجل تدقيق POS عند وجود فرق."
        ],
        "note": "يجب أن يحدد الباركود المنتج أو المتغير الصحيح. جرّب الباركود الجديد قبل وقت الازدحام."
      },
      "fa": {
        "title": "POS سوپرمارکت و دستگاه‌های صندوق",
        "steps": [
          "در حالت سوپرمارکت، اونر مرکز POS و دستگاه‌های شعبه را بررسی کند. حساب صندوق‌دار و دستگاه باید به شعبه درست وصل باشند.",
          "در صفحه صندوق، بارکد را اسکن یا محصول را انتخاب کنید و مقدار، قیمت و مجموع را قبل از پرداخت ببینید.",
          "معامله را یک‌بار تکمیل کنید؛ برای بررسی اختلاف، رسید و سابقه بررسی POS را ببینید."
        ],
        "note": "بارکد باید محصول یا نوع درست را مشخص کند. بارکد جدید را پیش از شلوغی کار امتحان کنید."
      }
    }
  },
  {
    "id": "sales-closing",
    "category": "sales",
    "roles": [
      "owner",
      "manager"
    ],
    "route": "/sales",
    "source": "src/pages/Sales.jsx",
    "content": {
      "en": {
        "title": "Daily sales and closing",
        "steps": [
          "Open Sales and select the branch and business date. Review the recorded sales and source details before adding a closing record.",
          "Enter cash, network and customer credit in their designated fields. Review purchases, expenses, cash movements and differences shown by the closing form.",
          "Save or finalize using the available action, then confirm the record in history and compare the dashboard using the same date and branch."
        ],
        "note": "Do not enter the same POS sale again as a separate manual sale. Previous cash carried forward is not new revenue; record shortages separately."
      },
      "ar": {
        "title": "المبيعات اليومية والإقفال",
        "steps": [
          "افتح المبيعات وحدد الفرع وتاريخ العمل. راجع المبيعات المسجلة ومصادرها قبل إضافة الإقفال.",
          "أدخل النقد والشبكة والبيع الآجل في خاناتها. راجع المشتريات والمصروفات وحركات النقد والفروقات الظاهرة في نموذج الإقفال.",
          "احفظ أو اعتمد بالإجراء المتاح، ثم تحقق من السجل وقارن اللوحة بنفس التاريخ والفرع."
        ],
        "note": "لا تسجل بيع POS نفسه مرة ثانية كبيع يدوي. النقد المرحّل ليس إيراداً جديداً؛ سجّل العجز بشكل منفصل."
      },
      "fa": {
        "title": "فروش روزانه و بستن حساب",
        "steps": [
          "فروش را باز و شعبه و تاریخ کاری را انتخاب کنید. قبل از بستن حساب، فروش ثبت‌شده و جزئیات منابع فروش را ببینید.",
          "نقد، شبکه و فروش قرضی را در خانه‌های مربوط درج کنید. خرید، مصارف، حرکت نقد و اختلاف‌های فورم بستن حساب را بررسی کنید.",
          "با گزینه موجود ذخیره یا نهایی کنید؛ بعد رکورد را در سابقه و داشبورد با همان تاریخ و شعبه مقایسه کنید."
        ],
        "note": "فروش ثبت‌شده POS را دوباره فروش دستی حساب نکنید. نقد انتقالی روز قبل عاید جدید نیست؛ کسری را جدا ثبت کنید."
      }
    }
  },
  {
    "id": "suppliers",
    "category": "buy",
    "roles": [
      "owner",
      "manager"
    ],
    "route": "/suppliers",
    "source": "src/components/suppliers/SupplierDetail.jsx",
    "content": {
      "en": {
        "title": "One workspace for each supplier",
        "steps": [
          "Open Suppliers and select the supplier. Use this workspace for Add invoice, New purchase order and Record payment, subject to your permissions.",
          "In Account, invoices & payments, select the branch, currency and period. Review the statement, invoice details and linked payments together.",
          "Use the Orders, Contract and price-history sections as needed. Generate Statement PDF after reviewing any reconciliation warning."
        ],
        "note": "Do not settle a supplier invoice again in another page. Zero purchase orders does not mean zero invoices; these are separate records."
      },
      "ar": {
        "title": "صفحة واحدة لحساب كل مورد",
        "steps": [
          "افتح الموردين واختر المورد. استخدم نفس الصفحة لإضافة فاتورة وأمر شراء وتسجيل دفعة حسب صلاحياتك.",
          "في الحساب والفواتير والمدفوعات حدد الفرع والعملة والفترة. راجع كشف الحساب وتفاصيل الفاتورة ودفعاتها معاً.",
          "استخدم أقسام الأوامر والعقد وسجل الأسعار عند الحاجة. أنشئ PDF لكشف الحساب بعد مراجعة تنبيه المطابقة."
        ],
        "note": "لا تسدد نفس الفاتورة مرة أخرى من صفحة ثانية. عدم وجود أوامر شراء لا يعني عدم وجود فواتير؛ هي سجلات منفصلة."
      },
      "fa": {
        "title": "یک صفحه برای حساب هر سپلایر",
        "steps": [
          "سپلایرها را باز و سپلایر را انتخاب کنید. افزودن فاکتور، سفارش خرید و ثبت پرداخت را مطابق صلاحیت خود از همین صفحه انجام دهید.",
          "در حساب، فاکتورها و پرداخت‌ها، شعبه، ارز و دوره را انتخاب کنید. صورت‌حساب، جزئیات فاکتور و پرداخت‌های مربوط را یکجا ببینید.",
          "در صورت نیاز سفارش‌ها، قرارداد و سابقه قیمت را باز کنید. بعد از بررسی هشدار تطبیق، PDF صورت‌حساب بگیرید."
        ],
        "note": "یک فاکتور را دوباره از صفحه دیگر پرداخت نکنید. صفر بودن سفارش خرید به معنی نبود فاکتور نیست؛ این‌ها رکوردهای جدا هستند."
      }
    }
  },
  {
    "id": "supplier-payments",
    "category": "buy",
    "roles": [
      "owner",
      "manager"
    ],
    "route": "/suppliers",
    "source": "src/components/suppliers/SupplierWorkspacePayment.jsx",
    "content": {
      "en": {
        "title": "Supplier payments and reconciliation",
        "steps": [
          "In the supplier workspace, choose the invoice before recording payment. Check its outstanding amount, branch and currency.",
          "Enter the amount, payment date, method and notes, then use Save / retry. If the response is interrupted, retry the same pending payment rather than creating another.",
          "After success, check the payment row and invoice balance. If a reconciliation warning remains, compare the invoice's paid amount with actual payment records."
        ],
        "note": "Do not delete or invent payments to make a warning disappear. Report the invoice number and discrepancy; statement export can be blocked until reconciled."
      },
      "ar": {
        "title": "دفعات المورد ومطابقة الحساب",
        "steps": [
          "اختر الفاتورة داخل صفحة المورد قبل تسجيل الدفعة، وراجع المتبقي والفرع والعملة.",
          "أدخل المبلغ والتاريخ والطريقة والملاحظات واضغط حفظ / إعادة المحاولة. عند انقطاع الرد أعد نفس الدفعة المعلقة بدلاً من إنشاء دفعة ثانية.",
          "بعد النجاح راجع سطر الدفعة ورصيد الفاتورة. إذا بقي تنبيه مطابقة، قارن المدفوع في الفاتورة مع سجلات الدفعات الفعلية."
        ],
        "note": "لا تحذف أو تختلق دفعات لإخفاء الفرق. أبلغ برقم الفاتورة والفرق؛ قد يتوقف تصدير الكشف حتى المطابقة."
      },
      "fa": {
        "title": "پرداخت سپلایر و تطبیق حساب",
        "steps": [
          "قبل از ثبت پرداخت، فاکتور را در صفحه سپلایر انتخاب کنید. باقی‌مانده، شعبه و ارز آن را بررسی کنید.",
          "مبلغ، تاریخ، روش و یادداشت را وارد و ذخیره / تلاش دوباره را بزنید. اگر پاسخ قطع شد، همان پرداخت در انتظار را تکرار کنید؛ پرداخت تازه نسازید.",
          "بعد از موفقیت، ردیف پرداخت و باقی‌مانده فاکتور را ببینید. اگر هشدار اختلاف ماند، مبلغ پرداخت‌شده فاکتور را با رکوردهای واقعی پرداخت مقایسه کنید."
        ],
        "note": "برای پنهان کردن اختلاف، پرداخت حذف یا ساختگی ثبت نکنید. شماره فاکتور و اختلاف را گزارش دهید؛ صدور صورت‌حساب ممکن است تا تطبیق متوقف باشد."
      }
    }
  },
  {
    "id": "purchases",
    "category": "buy",
    "roles": [
      "owner",
      "manager"
    ],
    "route": "/purchases",
    "source": "src/pages/Purchases.jsx",
    "content": {
      "en": {
        "title": "Purchases and purchase orders",
        "steps": [
          "Select the supplier, branch and invoice date. Enter the supplier invoice reference and item quantities, units, prices and tax details shown in the form.",
          "Review totals and payment status before saving. If an approval is required, follow its status in the approval workflow.",
          "Check the saved invoice and supplier balance. For advance ordering, use Purchase Orders and follow the displayed approval, shipment and receipt states."
        ],
        "note": "An order is not proof of receipt or payment. Avoid entering the same supplier invoice in both the purchase list and supplier workspace."
      },
      "ar": {
        "title": "المشتريات وأوامر الشراء",
        "steps": [
          "حدد المورد والفرع وتاريخ الفاتورة، وأدخل مرجع فاتورة المورد وكميات ووحدات وأسعار الأصناف والضريبة في النموذج.",
          "راجع المجموع وحالة الدفع قبل الحفظ. إذا لزمت الموافقة، تابع الحالة في مسار الاعتمادات.",
          "تحقق من الفاتورة ورصيد المورد. للطلب المسبق استخدم أوامر الشراء وتابع حالات الموافقة والشحن والاستلام الظاهرة."
        ],
        "note": "أمر الشراء ليس إثبات استلام أو دفع. لا تسجل نفس الفاتورة في المشتريات وصفحة المورد مرتين."
      },
      "fa": {
        "title": "خرید و سفارش خرید",
        "steps": [
          "سپلایر، شعبه و تاریخ فاکتور را انتخاب کنید. شماره فاکتور سپلایر، مقدار، واحد، قیمت و مالیات اقلام را در فورم وارد کنید.",
          "قبل از ذخیره مجموع و وضعیت پرداخت را بررسی کنید. اگر تأیید لازم است، وضعیت را در جریان تأیید دنبال کنید.",
          "فاکتور ذخیره‌شده و حساب سپلایر را ببینید. برای سفارش قبلی از سفارش خرید استفاده و مراحل تأیید، ارسال و دریافت را دنبال کنید."
        ],
        "note": "سفارش خرید مدرک دریافت یا پرداخت نیست. همان فاکتور را هم در خرید و هم در صفحه سپلایر دو بار ثبت نکنید."
      }
    }
  },
  {
    "id": "expenses",
    "category": "money",
    "roles": [
      "owner",
      "manager"
    ],
    "route": "/expenses",
    "source": "src/pages/Expenses.jsx",
    "content": {
      "en": {
        "title": "Record an expense",
        "steps": [
          "Open Expenses and choose the actual branch, date and expense category.",
          "Enter the amount and description, attach evidence if the form offers it, and review the values before saving.",
          "Find the saved expense in the list and check its effect in reports for the same period."
        ],
        "note": "Buying stock belongs in Purchases. Paying an existing supplier invoice belongs in its payment workflow; recording it again as an expense can distort reports."
      },
      "ar": {
        "title": "تسجيل المصروفات",
        "steps": [
          "افتح المصروفات واختر الفرع والتاريخ وتصنيف المصروف الصحيح.",
          "أدخل المبلغ والوصف وأرفق الإثبات إذا كان متاحاً في النموذج، ثم راجع القيم واحفظ.",
          "ابحث عن المصروف المحفوظ وراجع أثره في تقارير نفس الفترة."
        ],
        "note": "شراء المخزون مكانه المشتريات. سداد فاتورة مورد موجودة مكانه مسار الدفع؛ تسجيله كمصروف جديد قد يشوّه التقارير."
      },
      "fa": {
        "title": "ثبت مصارف",
        "steps": [
          "مصارف را باز و شعبه، تاریخ و دسته مصرف درست را انتخاب کنید.",
          "مبلغ و توضیح را وارد کنید؛ اگر فورم امکان پیوست دارد، مدرک را ضمیمه و بعد از بررسی ذخیره کنید.",
          "مصرف ذخیره‌شده را در لیست پیدا و اثر آن را در گزارش همان دوره ببینید."
        ],
        "note": "خرید جنس در بخش خرید ثبت می‌شود. پرداخت فاکتور قبلی سپلایر در جریان پرداخت خودش ثبت شود؛ ثبت دوباره آن به عنوان مصرف گزارش را غلط می‌کند."
      }
    }
  },
  {
    "id": "treasury",
    "category": "money",
    "roles": [
      "owner",
      "manager"
    ],
    "route": "/treasury",
    "source": "src/pages/Treasury.jsx",
    "content": {
      "en": {
        "title": "Treasury and branch settlement",
        "steps": [
          "Open Treasury and review Accounts and Transactions for the selected business. Check currency and account before recording money movement.",
          "Use Settlement to review each branch separately. Select Today, Week, Month, 3 months, 6 months, Year or All, and inspect opening balance, movements and closing balance.",
          "Record a real owner–branch transfer with its direction and reference. Use Reconciliation to investigate differences before relying on a balance."
        ],
        "note": "Week means the last 7 days; month and year start at the calendar boundary. 3/6 months include the current month. Settlement ledger balance is not a bank statement balance."
      },
      "ar": {
        "title": "الخزينة وتسوية الفروع",
        "steps": [
          "افتح الخزينة وراجع الحسابات والمعاملات للمنشأة. تأكد من العملة والحساب قبل تسجيل حركة مالية.",
          "في التسوية راجع كل فرع بشكل مستقل. اختر اليوم أو الأسبوع أو الشهر أو 3 أشهر أو 6 أشهر أو السنة أو الكل، وراجع الافتتاحي والحركات والختامي.",
          "سجّل التحويل الفعلي بين المالك والفرع باتجاهه ومرجعه. استخدم المطابقة للتحقق من الفروقات قبل الاعتماد على الرصيد."
        ],
        "note": "الأسبوع آخر 7 أيام، والشهر والسنة من بدايتهما. 3 و6 أشهر تشمل الشهر الحالي. رصيد دفتر التسوية ليس رصيد كشف البنك."
      },
      "fa": {
        "title": "خزانه و حساب‌دهی شعبه‌ها",
        "steps": [
          "خزانه را باز و حساب‌ها و معاملات کسب‌وکار را بررسی کنید. قبل از ثبت حرکت پول، ارز و حساب را تأیید کنید.",
          "در حساب‌دهی، هر شعبه را جدا ببینید. امروز، هفته، ماه، ۳ ماه، ۶ ماه، سال یا همه را انتخاب و مانده اول، حرکات و مانده آخر را بررسی کنید.",
          "انتقال واقعی بین اونر و شعبه را با جهت و مرجع درست ثبت کنید. قبل از اعتماد به مانده، اختلاف‌ها را در تطبیق حساب بررسی کنید."
        ],
        "note": "هفته یعنی ۷ روز اخیر؛ ماه و سال از اول تقویمی‌اند. ۳ و ۶ ماه شامل ماه فعلی است. مانده دفتر حساب‌دهی همان موجودی بانک نیست."
      }
    }
  },
  {
    "id": "network",
    "category": "money",
    "roles": [
      "owner",
      "manager"
    ],
    "route": "/network-management",
    "source": "src/pages/NetworkManagement.jsx",
    "content": {
      "en": {
        "title": "Network sales and settlement",
        "steps": [
          "Open Network Settlement and select the branch, device or source and date filters available in the page.",
          "Compare recorded network sales with the actual settlement evidence, fees and settlement dates.",
          "Review related Treasury transactions before recording another movement. Investigate missing or unmatched entries using their references."
        ],
        "note": "A network sale and its later bank settlement are not two sales. Do not manually duplicate an automatic treasury entry."
      },
      "ar": {
        "title": "مبيعات الشبكة والتسوية",
        "steps": [
          "افتح تسوية الشبكة وحدد الفرع والجهاز أو المصدر والفترة من الفلاتر المتاحة.",
          "قارن المبيعات المسجلة مع إثبات التسوية الفعلي والرسوم وتاريخ التسوية.",
          "راجع الحركات المرتبطة في الخزينة قبل تسجيل حركة أخرى، وتحقق من القيود المفقودة أو غير المطابقة بمراجعها."
        ],
        "note": "بيع الشبكة ووصول تسويته للبنك ليسا عمليتي بيع. لا تكرر قيد خزينة آلياً بإدخال يدوي."
      },
      "fa": {
        "title": "فروش شبکه و تسویه",
        "steps": [
          "تسویه شبکه را باز و شعبه، دستگاه یا منبع و دوره را از فیلترهای موجود انتخاب کنید.",
          "فروش ثبت‌شده را با مدرک واقعی تسویه، کارمزد و تاریخ تسویه مقایسه کنید.",
          "قبل از ثبت حرکت جدید، معاملات مربوط در خزانه را ببینید. رکورد گم‌شده یا ناهماهنگ را با مرجع آن بررسی کنید."
        ],
        "note": "فروش شبکه و رسیدن پول آن به بانک دو فروش نیست. رکورد اتومات خزانه را دوباره دستی ثبت نکنید."
      }
    }
  },
  {
    "id": "customers",
    "category": "money",
    "roles": [
      "owner",
      "manager"
    ],
    "route": "/customer-management",
    "source": "src/pages/CustomerManagement.jsx",
    "content": {
      "en": {
        "title": "Customers and credit balances",
        "steps": [
          "Create or select the customer's identity and contact details in Customer Management.",
          "Use Customer Credit or Debt Management for the actual financial record. Select the correct customer, branch, date and amount.",
          "Record a repayment against the appropriate debt, then review the remaining balance and history."
        ],
        "note": "Customer contact details are not a payment record. Do not count collection of an existing debt as a second sale."
      },
      "ar": {
        "title": "العملاء وأرصدة الآجل",
        "steps": [
          "أضف أو اختر هوية العميل ومعلومات التواصل في إدارة العملاء.",
          "استخدم حساب الآجل أو إدارة الديون للسجل المالي الفعلي. اختر العميل والفرع والتاريخ والمبلغ الصحيح.",
          "سجّل السداد مقابل الدين المناسب ثم راجع المتبقي والسجل."
        ],
        "note": "بيانات تواصل العميل ليست قيد دفع. تحصيل دين سابق ليس عملية بيع ثانية."
      },
      "fa": {
        "title": "مشتریان و حساب قرضی",
        "steps": [
          "هویت و معلومات تماس مشتری را در مدیریت مشتریان ثبت یا انتخاب کنید.",
          "برای رکورد مالی از حساب قرضی مشتری یا مدیریت بدهی‌ها استفاده کنید. مشتری، شعبه، تاریخ و مبلغ درست را انتخاب کنید.",
          "پرداخت را مقابل بدهی مربوط ثبت و باقی‌مانده و سابقه را بررسی کنید."
        ],
        "note": "معلومات تماس مشتری رکورد پرداخت نیست. گرفتن قرض قبلی را فروش دوم حساب نکنید."
      }
    }
  },
  {
    "id": "payroll",
    "category": "people",
    "roles": [
      "owner",
      "manager"
    ],
    "route": "/payroll",
    "source": "src/pages/Payroll.jsx",
    "content": {
      "en": {
        "title": "Employees, attendance and payroll",
        "steps": [
          "Maintain employee records with the correct branch. Provision login access separately through the owner's staff access workflow.",
          "Review Attendance and the roster, then check bonuses, deductions and applicable rules before reviewing payroll.",
          "Select the intended payroll period and branch and inspect the report against attendance and approved adjustments."
        ],
        "note": "A payroll report alone is not proof that salary was transferred. Keep payment evidence and review corrections before paying."
      },
      "ar": {
        "title": "الموظفون والحضور والرواتب",
        "steps": [
          "حدّث بيانات الموظف وفرعه. أنشئ صلاحية الدخول بشكل منفصل من مسار وصول الموظفين لدى المالك.",
          "راجع الحضور والجدول، ثم المكافآت والخصومات والقواعد المطبقة قبل مراجعة الرواتب.",
          "حدد فترة الراتب والفرع وراجع التقرير مقابل الحضور والتعديلات المعتمدة."
        ],
        "note": "تقرير الرواتب وحده ليس إثبات تحويل الراتب. احتفظ بإثبات الدفع وراجع التصحيحات قبل الصرف."
      },
      "fa": {
        "title": "کارکنان، حاضری و معاشات",
        "steps": [
          "مشخصات کارکنان و شعبه درست را ثبت کنید. دسترسی ورود را جدا از طریق بخش دسترسی کارکنان اونر بسازید.",
          "حاضری و تقسیم اوقات، سپس پاداش، کسری و قواعد مربوط را قبل از محاسبه معاش بررسی کنید.",
          "دوره معاش و شعبه را انتخاب و گزارش را با حاضری و اصلاحات تأییدشده مقایسه کنید."
        ],
        "note": "گزارش معاش به‌تنهایی مدرک انتقال معاش نیست. مدرک پرداخت را نگه دارید و قبل از پرداخت اصلاحات را بررسی کنید."
      }
    }
  },
  {
    "id": "reports",
    "category": "reports",
    "roles": [
      "owner",
      "manager"
    ],
    "route": "/reports",
    "source": "src/pages/Reports.jsx",
    "content": {
      "en": {
        "title": "Reports, analytics and PDF",
        "steps": [
          "Open Reports and select the business, branch and date range available in the report. Wait for loading to finish.",
          "Review sales, purchases, expenses and the displayed profit or cash metrics. For deeper analysis, use the accessible branch, stock-consumption or cost-control views.",
          "Use the report's PDF action and review the exported branch, period, currency and language before sharing it."
        ],
        "note": "Compare reports only with the same filters and definitions. A loading error is not zero activity; profit and cash balances should not be treated as identical."
      },
      "ar": {
        "title": "التقارير والتحليلات وPDF",
        "steps": [
          "افتح التقارير وحدد المنشأة والفرع والفترة المتاحة، وانتظر اكتمال التحميل.",
          "راجع المبيعات والمشتريات والمصروفات ومؤشرات الربح أو النقد. للتحليل الأعمق استخدم عروض الفروع واستهلاك المخزون وضبط التكلفة المتاحة لك.",
          "استخدم زر PDF وراجع الفرع والفترة والعملة واللغة في الملف قبل مشاركته."
        ],
        "note": "قارن التقارير بنفس الفلاتر والتعريفات فقط. خطأ التحميل لا يعني نشاطاً صفرياً، والربح ليس رصيد النقد."
      },
      "fa": {
        "title": "گزارش‌ها، تحلیل و PDF",
        "steps": [
          "گزارش‌ها را باز و کسب‌وکار، شعبه و دوره موجود در گزارش را انتخاب کنید. تا تکمیل دریافت معلومات صبر کنید.",
          "فروش، خرید، مصارف و شاخص سود یا نقد را بررسی کنید. برای جزئیات بیشتر، تحلیل شعبه، مصرف محصولات و کنترل هزینه قابل دسترسی را ببینید.",
          "از گزینه PDF گزارش استفاده و قبل از شریک ساختن، شعبه، دوره، ارز و زبان فایل را بررسی کنید."
        ],
        "note": "گزارش‌ها را فقط با فیلتر و تعریف یکسان مقایسه کنید. خطای بارگذاری به معنی صفر بودن کار نیست؛ سود و مانده نقد یکی نیستند."
      }
    }
  },
  {
    "id": "alerts",
    "category": "reports",
    "roles": [
      "owner",
      "manager"
    ],
    "route": "/alerts",
    "source": "src/pages/SmartAlertCenter.jsx",
    "content": {
      "en": {
        "title": "Smart Alerts and notifications",
        "steps": [
          "Open Smart Alerts and choose all, inventory or financial alerts. Read the alert and check its underlying record.",
          "Fix the actual issue in its relevant module. Mark the alert resolved only after checking the result; resolving an alert does not edit the original transaction.",
          "In Notifications, review history and available live-notification settings. Save customization before sending a test notification."
        ],
        "note": "If a page fails, retry once and capture the message. Do not repeat financial submissions just to clear an alert."
      },
      "ar": {
        "title": "التنبيهات الذكية والإشعارات",
        "steps": [
          "افتح التنبيهات الذكية واختر الكل أو المخزون أو المالية. اقرأ التنبيه وراجع السجل الأصلي.",
          "عالج السبب في القسم المعني. علّم التنبيه كمحلول بعد التحقق؛ إغلاق التنبيه لا يعدّل المعاملة الأصلية.",
          "في الإشعارات راجع السجل وإعدادات الإشعارات المباشرة المتاحة. احفظ التخصيص قبل إرسال اختبار."
        ],
        "note": "إذا فشلت الصفحة جرّب مرة واحدة وصوّر الرسالة. لا تكرر المعاملات المالية لمجرد إزالة تنبيه."
      },
      "fa": {
        "title": "هشدار هوشمند و اعلان‌ها",
        "steps": [
          "هشدار هوشمند را باز و همه، موجودی یا مالی را انتخاب کنید. متن هشدار و رکورد اصلی را بررسی کنید.",
          "علت را در بخش مربوط اصلاح کنید. بعد از بررسی نتیجه، هشدار را حل‌شده کنید؛ بستن هشدار معامله اصلی را تغییر نمی‌دهد.",
          "در اعلان‌ها سابقه و تنظیمات اعلان زنده موجود را ببینید. شخصی‌سازی را قبل از ارسال اعلان آزمایشی ذخیره کنید."
        ],
        "note": "اگر صفحه خطا داد، یک‌بار تلاش دوباره و متن خطا را ثبت کنید. برای حذف هشدار، معامله مالی را دوباره ثبت نکنید."
      }
    }
  },
  {
    "id": "approvals",
    "category": "people",
    "roles": [
      "owner",
      "manager"
    ],
    "route": "/erp-approval-center",
    "source": "src/pages/OwnerApprovalCenter.jsx",
    "content": {
      "en": {
        "title": "Approvals and activity history",
        "steps": [
          "The authorized owner opens Approvals and checks the pending record, branch, amount and supporting details.",
          "Approve or reject only after review. Refresh the record if another user has changed its status.",
          "Use Activity Logs, where permitted, to investigate who changed a record and when. Managers should follow their submission's approval status."
        ],
        "note": "Submitting a request is not approval. Do not create a replacement record merely because the first request is still pending."
      },
      "ar": {
        "title": "الاعتمادات وسجل النشاط",
        "steps": [
          "يفتح المالك المخوّل مركز الاعتمادات ويراجع السجل والفرع والمبلغ والمرفقات.",
          "وافق أو ارفض بعد المراجعة. حدّث السجل إذا غيّر مستخدم آخر حالته.",
          "استخدم سجل النشاط حسب الصلاحية لمعرفة من غيّر السجل ومتى. يتابع المدير حالة اعتماد طلبه."
        ],
        "note": "إرسال الطلب لا يعني اعتماده. لا تنشئ سجلاً بديلاً لأن الطلب الأول ما زال معلقاً."
      },
      "fa": {
        "title": "تأییدها و سابقه فعالیت",
        "steps": [
          "اونر مجاز مرکز تأییدها را باز و رکورد در انتظار، شعبه، مبلغ و مدارک را بررسی کند.",
          "بعد از بررسی تأیید یا رد کنید. اگر کاربر دیگری وضعیت را تغییر داده، رکورد را تازه کنید.",
          "در صورت داشتن صلاحیت، سابقه فعالیت را برای بررسی شخص و زمان تغییر ببینید. مدیر وضعیت تأیید درخواست خود را دنبال کند."
        ],
        "note": "ارسال درخواست به معنی تأیید نیست. چون درخواست اول در انتظار است، رکورد جایگزین نسازید."
      }
    }
  },
  {
    "id": "billing",
    "category": "start",
    "roles": [
      "owner"
    ],
    "route": "/billing",
    "source": "src/pages/Billing.jsx",
    "content": {
      "en": {
        "title": "Subscription and billing",
        "steps": [
          "Open Billing & Subscription and review your current plan, status, renewal or trial dates and included features.",
          "Select an available plan and follow the payment instructions shown. Use only the beneficiary and bank details displayed by the billing page for a manual transfer.",
          "Submit the required reference or proof and follow its review status. Confirm the subscription becomes active before relying on newly unlocked modules."
        ],
        "note": "Uploading a transfer receipt does not itself mean payment approval. Prices and trial terms are those shown in your current billing page."
      },
      "ar": {
        "title": "الاشتراك والفوترة",
        "steps": [
          "افتح الفوترة والاشتراك وراجع الخطة والحالة وتواريخ التجديد أو التجربة والميزات المشمولة.",
          "اختر خطة متاحة واتبع تعليمات الدفع الظاهرة. للتحويل اليدوي استخدم بيانات المستفيد والبنك المعروضة في صفحة الفوترة فقط.",
          "أرسل المرجع أو الإثبات المطلوب وتابع المراجعة. تحقق من تفعيل الاشتراك قبل الاعتماد على الأقسام الجديدة."
        ],
        "note": "رفع إيصال التحويل لا يعني اعتماد الدفع. الأسعار وشروط التجربة هي الظاهرة في صفحة الفوترة الحالية."
      },
      "fa": {
        "title": "اشتراک و پرداخت ساس",
        "steps": [
          "صورتحساب و اشتراک را باز و پلان فعلی، وضعیت، تاریخ تمدید یا آزمایشی و امکانات شامل را بررسی کنید.",
          "پلان موجود را انتخاب و دستور پرداخت همان صفحه را دنبال کنید. برای انتقال دستی فقط از معلومات بانک و گیرنده نمایش‌داده‌شده استفاده کنید.",
          "مرجع یا مدرک خواسته‌شده را ارسال و وضعیت بررسی را دنبال کنید. قبل از استفاده از امکانات جدید، فعال‌شدن اشتراک را تأیید کنید."
        ],
        "note": "آپلود رسید به معنی تأیید پرداخت نیست. قیمت و شرایط آزمایشی همان موارد صفحه فعلی صورتحساب است."
      }
    }
  },
  {
    "id": "manager",
    "category": "portals",
    "roles": [
      "manager"
    ],
    "route": "/manager-dashboard",
    "source": "src/pages/ManagerDashboardERP.jsx",
    "content": {
      "en": {
        "title": "Branch manager portal",
        "steps": [
          "Sign in with your manager account and check the assigned branch. If it is missing or wrong, ask the owner to correct your assignment.",
          "Use the available sales, purchase, expense and stock actions for that branch, then verify each saved record in its history.",
          "Review daily totals and pending approvals before closing. Report discrepancies with the branch, date and record reference."
        ],
        "note": "Manager access is limited by assigned branch and permissions. Changing a filter does not grant access to another branch."
      },
      "ar": {
        "title": "بوابة مدير الفرع",
        "steps": [
          "ادخل بحساب المدير وتأكد من الفرع المخصص. إذا كان مفقوداً أو خاطئاً اطلب من المالك تصحيح التعيين.",
          "استخدم إجراءات المبيعات والمشتريات والمصروفات والمخزون المتاحة لفرعك، ثم تحقق من كل سجل محفوظ.",
          "راجع إجماليات اليوم والاعتمادات المعلقة قبل الإقفال. أبلغ عن الفرق مع الفرع والتاريخ ومرجع السجل."
        ],
        "note": "صلاحية المدير مرتبطة بالفرع والصلاحيات الممنوحة. تغيير الفلتر لا يمنح صلاحية فرع آخر."
      },
      "fa": {
        "title": "پورتل مدیر شعبه",
        "steps": [
          "با حساب مدیر وارد و شعبه تعیین‌شده را بررسی کنید. اگر شعبه نیست یا غلط است، از اونر بخواهید تعیین شعبه را اصلاح کند.",
          "عملیات فروش، خرید، مصرف و انبار مجاز را برای همان شعبه انجام و هر رکورد ذخیره‌شده را در سابقه تأیید کنید.",
          "قبل از بستن روز، مجموع روز و تأییدهای در انتظار را بررسی کنید. اختلاف را با شعبه، تاریخ و مرجع رکورد گزارش دهید."
        ],
        "note": "دسترسی مدیر به شعبه و صلاحیت تعیین‌شده محدود است. تغییر فیلتر صلاحیت شعبه دیگر نمی‌دهد."
      }
    }
  },
  {
    "id": "employee",
    "category": "portals",
    "roles": [
      "employee"
    ],
    "route": "/employee-dashboard",
    "source": "src/pages/EmployeeDashboardERP.jsx",
    "content": {
      "en": {
        "title": "Employee portal",
        "steps": [
          "Use the employee account provided by your business and confirm your linked employee profile and branch.",
          "In attendance, use the available check-in or check-out action at the actual time and verify the recorded status.",
          "Review My Tasks and Announcements. Update assigned work using the actions available to your account."
        ],
        "note": "If your profile is missing, ask the owner to link your account correctly. Do not create another employee identity to bypass the problem."
      },
      "ar": {
        "title": "بوابة الموظف",
        "steps": [
          "استخدم حساب الموظف المخصص من المنشأة وتأكد من ملف الموظف المرتبط والفرع.",
          "في الحضور استخدم تسجيل الدخول أو الانصراف في الوقت الفعلي، وتحقق من الحالة المحفوظة.",
          "راجع مهامي والإعلانات، وحدّث العمل المخصص لك بالإجراءات المتاحة لحسابك."
        ],
        "note": "إذا لم يظهر ملفك اطلب من المالك ربط الحساب بشكل صحيح. لا تنشئ هوية موظف ثانية لتجاوز المشكلة."
      },
      "fa": {
        "title": "پورتل کارمند",
        "steps": [
          "از حساب کارمند تعیین‌شده استفاده و پروفایل کارمند و شعبه مربوط را بررسی کنید.",
          "در حاضری، ورود یا خروج را در وقت واقعی ثبت و وضعیت ذخیره‌شده را تأیید کنید.",
          "وظایف من و اطلاعیه‌ها را ببینید. کار تعیین‌شده را با گزینه‌های مجاز حساب خود به‌روز کنید."
        ],
        "note": "اگر پروفایل نیست، از اونر بخواهید حساب را درست وصل کند. برای دور زدن مشکل هویت کارمند دوم نسازید."
      }
    }
  },
  {
    "id": "supplier-portal",
    "category": "portals",
    "roles": [
      "supplier"
    ],
    "route": "/supplier-portal",
    "source": "src/pages/SupplierPortalERP.jsx",
    "content": {
      "en": {
        "title": "Supplier self-service portal",
        "steps": [
          "Sign in with the supplier account assigned by the business. Confirm that your supplier profile and branch are linked.",
          "Review your Invoices, Orders and History. Open an order and check its items and status before taking action.",
          "For an approved order that you have actually shipped, use the shipment confirmation action if available. Follow the updated status afterward."
        ],
        "note": "Shipment confirmation is not proof of the buyer receiving goods or paying the invoice. Ask the business to correct missing account links."
      },
      "ar": {
        "title": "بوابة المورد",
        "steps": [
          "ادخل بحساب المورد المخصص من المنشأة، وتأكد من ربط ملف المورد والفرع.",
          "راجع الفواتير والأوامر والسجل. افتح الأمر وتحقق من الأصناف والحالة قبل أي إجراء.",
          "للأمر المعتمد الذي شحنته فعلياً، استخدم تأكيد الشحن إن كان متاحاً وتابع تحديث الحالة."
        ],
        "note": "تأكيد الشحن ليس إثبات استلام المشتري أو دفع الفاتورة. اطلب من المنشأة تصحيح ربط الحساب المفقود."
      },
      "fa": {
        "title": "پورتل خود سپلایر",
        "steps": [
          "با حساب سپلایر تعیین‌شده وارد شوید و وصل بودن پروفایل سپلایر و شعبه را بررسی کنید.",
          "فاکتورها، سفارش‌ها و سابقه خود را ببینید. قبل از اقدام، اقلام و وضعیت سفارش را بررسی کنید.",
          "برای سفارش تأییدشده که واقعاً فرستاده‌اید، در صورت وجود گزینه تأیید ارسال را بزنید و وضعیت تازه را دنبال کنید."
        ],
        "note": "تأیید ارسال مدرک دریافت جنس یا پرداخت خریدار نیست. وصل نبودن حساب را از کسب‌وکار مربوط پیگیری کنید."
      }
    }
  },
  {
    "id": "platform-owner",
    "category": "portals",
    "roles": [
      "platform"
    ],
    "route": "/platform-owner",
    "source": "src/pages/PlatformOwnerPortal.jsx",
    "content": {
      "en": {
        "title": "Platform owner control center",
        "steps": [
          "Use the separate Platform Owner login with an authorized platform account. Review the dashboard and refresh if its data cannot load.",
          "Use Organizations, Users, Subscriptions and Plans to inspect the relevant account before changing status, limits or access.",
          "In Payments, review the amount, reference and proof before approving or rejecting. Check the resulting subscription and Activity history."
        ],
        "note": "Platform administration is separate from a restaurant owner's workspace. A customer account cannot grant itself platform access."
      },
      "ar": {
        "title": "مركز تحكم مالك المنصة",
        "steps": [
          "استخدم دخول مالك المنصة المنفصل بحساب مخوّل. راجع اللوحة وأعد التحميل إذا تعذر تحميل بياناتها.",
          "راجع الحساب في المنظمات والمستخدمين والاشتراكات والخطط قبل تغيير الحالة أو الحدود أو الوصول.",
          "في المدفوعات راجع المبلغ والمرجع والإثبات قبل الموافقة أو الرفض، ثم تحقق من الاشتراك وسجل النشاط."
        ],
        "note": "إدارة المنصة منفصلة عن مساحة مالك المطعم. حساب العميل لا يمنح نفسه صلاحية إدارة المنصة."
      },
      "fa": {
        "title": "مرکز کنترل اونر پلتفورم",
        "steps": [
          "با حساب مجاز از ورود جداگانه اونر پلتفورم وارد شوید. داشبورد را ببینید و اگر معلومات دریافت نشد، دوباره تلاش کنید.",
          "قبل از تغییر وضعیت، محدودیت یا دسترسی، حساب مربوط را در سازمان‌ها، کاربران، اشتراک‌ها و پلان‌ها بررسی کنید.",
          "در پرداخت‌ها، مبلغ، مرجع و مدرک را پیش از تأیید یا رد ببینید؛ بعد اشتراک و سابقه فعالیت را بررسی کنید."
        ],
        "note": "مدیریت پلتفورم از محیط اونر رستورانت جداست. حساب مشتری نمی‌تواند به خودش دسترسی مدیریت پلتفورم بدهد."
      }
    }
  },
  {
    "id": "mobile",
    "category": "trouble",
    "roles": [
      "owner",
      "manager",
      "employee",
      "supplier",
      "platform"
    ],
    "route": "/notifications",
    "source": "src/components/notifications/PushCustomization.jsx",
    "content": {
      "en": {
        "title": "Mobile use, language and notifications",
        "steps": [
          "Use the app language selector for English, Arabic or Persian. On a narrow screen, open the menu or More to find additional modules.",
          "If using the installed web app, enable notifications from its available notification controls and allow the device permission request. Save settings before testing.",
          "When sharing a PDF, check its preview and selected language. If a share or print action fails, try the download option provided by the report."
        ],
        "note": "Notification availability depends on browser, installation and device permissions. A missing push message does not prove the underlying transaction failed."
      },
      "ar": {
        "title": "الجوال واللغة والإشعارات",
        "steps": [
          "اختر الإنجليزية أو العربية أو الفارسية من محدد اللغة. على الشاشة الصغيرة افتح القائمة أو المزيد لبقية الأقسام.",
          "في تطبيق الويب المثبت فعّل الإشعارات من أدواته المتاحة واسمح بطلب الجهاز. احفظ الإعدادات قبل الاختبار.",
          "قبل مشاركة PDF راجع المعاينة واللغة. إذا تعذرت المشاركة أو الطباعة جرّب التنزيل المتاح في التقرير."
        ],
        "note": "توفر الإشعارات يعتمد على المتصفح والتثبيت وأذونات الجهاز. غياب الإشعار لا يثبت فشل المعاملة."
      },
      "fa": {
        "title": "استفاده در موبایل، زبان و اعلان",
        "steps": [
          "از انتخاب زبان اپ، انگلیسی، عربی یا فارسی را انتخاب کنید. در صفحه کوچک منو یا بیشتر را برای بخش‌های دیگر باز کنید.",
          "اگر از اپ وب نصب‌شده استفاده می‌کنید، اعلان را از تنظیمات موجود فعال و درخواست اجازه دستگاه را قبول کنید. قبل از آزمایش تنظیمات را ذخیره کنید.",
          "قبل از شریک ساختن PDF، پیش‌نمایش و زبان را ببینید. اگر اشتراک یا چاپ کار نکرد، دانلود موجود در گزارش را امتحان کنید."
        ],
        "note": "اعلان به مرورگر، نصب و اجازه دستگاه بستگی دارد. نیامدن اعلان ثابت نمی‌کند معامله ناکام شده است."
      }
    }
  },
  {
    "id": "troubleshooting",
    "category": "trouble",
    "roles": [
      "owner",
      "manager",
      "employee",
      "supplier",
      "platform"
    ],
    "route": "/support",
    "source": "src/pages/Support.jsx",
    "content": {
      "en": {
        "title": "Missing data, failed pages and support",
        "steps": [
          "First check your account, business, branch, date filters and search text. Clear unnecessary filters and retry loading once.",
          "If saving or paying was interrupted, inspect the list, invoice and transaction history before submitting again. Keep the original reference.",
          "Open Support, create a ticket and include the page, steps, expected result, actual message, branch, time and record number. Attach a screenshot if useful."
        ],
        "note": "Never include passwords or verification codes. If you cannot sign in, use the public Contact page; a blank/error page is not evidence that records were deleted."
      },
      "ar": {
        "title": "بيانات مفقودة أو صفحة متعطلة وطلب الدعم",
        "steps": [
          "تحقق أولاً من الحساب والمنشأة والفرع والتاريخ ونص البحث. أزل الفلاتر غير اللازمة وأعد التحميل مرة واحدة.",
          "إذا انقطع الحفظ أو الدفع، افحص القائمة والفاتورة وسجل المعاملات قبل التكرار واحتفظ بالمرجع الأصلي.",
          "افتح الدعم وأنشئ تذكرة تتضمن الصفحة والخطوات والنتيجة المتوقعة ورسالة الخطأ والفرع والوقت ورقم السجل. أرفق صورة عند الحاجة."
        ],
        "note": "لا ترسل كلمة المرور أو رمز التحقق. إذا تعذر الدخول استخدم صفحة التواصل العامة؛ الصفحة الفارغة أو الخطأ لا يعني حذف السجلات."
      },
      "fa": {
        "title": "معلومات گم‌شده، خطای صفحه و کمک",
        "steps": [
          "اول حساب، کسب‌وکار، شعبه، تاریخ و متن جست‌وجو را بررسی کنید. فیلتر اضافی را پاک و یک‌بار بارگذاری را تکرار کنید.",
          "اگر ذخیره یا پرداخت قطع شد، قبل از تکرار لیست، فاکتور و سابقه معاملات را ببینید. مرجع اصلی را نگه دارید.",
          "پشتیبانی را باز و تیکت با نام صفحه، مراحل، نتیجه مورد انتظار، متن خطا، شعبه، زمان و شماره رکورد ثبت کنید. در صورت نیاز تصویر ضمیمه کنید."
        ],
        "note": "رمز حساب و کد تأیید را نفرستید. اگر وارد شده نمی‌توانید، صفحه تماس عمومی را استفاده کنید؛ خطا یا صفحه خالی به معنی حذف رکوردها نیست."
      }
    }
  },
  {
    "id": "finance-settings",
    "category": "money",
    "roles": [
      "owner"
    ],
    "route": "/settings/finance",
    "source": "src/pages/FinanceTaxSettings.jsx",
    "content": {
      "en": {
        "title": "Currency, tax and financial settings",
        "steps": [
          "Open Settings → Finance & Tax and review the business currency, tax registration and displayed tax settings.",
          "Review fiscal periods and document numbering before changing them. Save the intended settings and inspect a new invoice or report.",
          "If amounts appear in another currency, check both the business settings and the currency selected in that financial workspace."
        ],
        "note": "Changing a currency label is not a currency conversion. Do not combine balances from different currencies without an explicit conversion method."
      },
      "ar": {
        "title": "العملة والضريبة والإعدادات المالية",
        "steps": [
          "افتح الإعدادات ثم المالية والضريبة وراجع عملة المنشأة والتسجيل الضريبي والإعدادات الظاهرة.",
          "راجع الفترات المالية وترقيم المستندات قبل تعديلها. احفظ الإعدادات وافحص فاتورة أو تقريراً جديداً.",
          "إذا ظهرت عملة أخرى، راجع إعدادات المنشأة والعملة المختارة داخل مساحة العمل المالية."
        ],
        "note": "تغيير اسم العملة ليس تحويل عملات. لا تجمع أرصدة عملات مختلفة دون طريقة تحويل واضحة."
      },
      "fa": {
        "title": "ارز، مالیات و تنظیمات مالی",
        "steps": [
          "تنظیمات، سپس مالی و مالیات را باز و ارز کسب‌وکار، ثبت مالیاتی و تنظیمات موجود را بررسی کنید.",
          "قبل از تغییر، دوره‌های مالی و شماره‌گذاری اسناد را ببینید. تنظیمات مورد نظر را ذخیره و یک فاکتور یا گزارش جدید را بررسی کنید.",
          "اگر ارز دیگر دیده می‌شود، هم تنظیمات کسب‌وکار و هم ارز انتخاب‌شده همان بخش مالی را بررسی کنید."
        ],
        "note": "تغییر نام ارز تبدیل ارز نیست. مانده ارزهای مختلف را بدون روش تبدیل مشخص یکجا جمع نکنید."
      }
    }
  },
  {
    "id": "scheduled-reports",
    "category": "reports",
    "roles": [
      "owner",
      "manager"
    ],
    "route": "/scheduled-reports",
    "source": "src/pages/ScheduledReports.jsx",
    "content": {
      "en": {
        "title": "Report schedules",
        "steps": [
          "Open Scheduled Reports if included in your plan and review the current reporting period and branch.",
          "Create a schedule with a name, recipient email, branch and the available daily, weekly or monthly frequency. Check the address before saving.",
          "Review active status and Last sent after the expected run. If delivery is missing, report the schedule name and expected time to Support."
        ],
        "note": "Saving a schedule does not prove email delivery. Do not assume that an unsent report reached its recipient."
      },
      "ar": {
        "title": "جدولة التقارير",
        "steps": [
          "افتح التقارير المجدولة إن كانت ضمن خطتك وراجع فترة التقرير والفرع.",
          "أنشئ الجدول بالاسم وبريد المستلم والفرع والتكرار اليومي أو الأسبوعي أو الشهري المتاح. تحقق من العنوان قبل الحفظ.",
          "راجع حالة التفعيل وآخر إرسال بعد الموعد المتوقع. عند عدم الوصول أبلغ الدعم باسم الجدول والوقت المتوقع."
        ],
        "note": "حفظ الجدول لا يثبت تسليم البريد. لا تفترض أن التقرير غير المرسل وصل للمستلم."
      },
      "fa": {
        "title": "زمان‌بندی گزارش‌ها",
        "steps": [
          "اگر پلان شما شامل آن است، گزارش‌های زمان‌بندی‌شده را باز و دوره گزارش و شعبه را بررسی کنید.",
          "زمان‌بندی را با نام، ایمیل گیرنده، شعبه و تکرار روزانه، هفتگی یا ماهانه موجود بسازید. ایمیل را قبل از ذخیره تأیید کنید.",
          "بعد از وقت مورد انتظار، وضعیت فعال و آخرین ارسال را ببینید. اگر نرسید، نام زمان‌بندی و وقت را به پشتیبانی بگویید."
        ],
        "note": "ذخیره زمان‌بندی مدرک رسیدن ایمیل نیست. فرض نکنید گزارش ارسال‌نشده به گیرنده رسیده است."
      }
    }
  },
  {
    "id": "promotions",
    "category": "sales",
    "roles": [
      "owner",
      "manager"
    ],
    "route": "/promotions",
    "source": "src/pages/PromotionsV2.jsx",
    "content": {
      "en": {
        "title": "Promotions and loyalty",
        "steps": [
          "Open Promotions and review the code, discount type, value, minimum order and usage limits before saving an offer.",
          "Check the offer's status and applicable dates. Verify the discount shown on a qualifying order before advertising it to customers.",
          "For customer points, open Loyalty and review the member and transaction history before making an available points adjustment."
        ],
        "note": "Creating a promotion does not prove every checkout applies it. Points, cashback and a cash refund are different operations."
      },
      "ar": {
        "title": "العروض والولاء",
        "steps": [
          "افتح العروض وراجع الرمز ونوع وقيمة الخصم والحد الأدنى للطلب وحدود الاستخدام قبل الحفظ.",
          "راجع الحالة والتواريخ، وتحقق من الخصم على طلب مستوفٍ للشروط قبل الإعلان للعملاء.",
          "لنقاط العملاء افتح الولاء وراجع العضو وسجل المعاملات قبل تعديل النقاط بالإجراء المتاح."
        ],
        "note": "إنشاء العرض لا يثبت تطبيقه في كل نقطة بيع. النقاط والكاش باك ورد النقد عمليات مختلفة."
      },
      "fa": {
        "title": "تخفیف‌ها و وفاداری مشتری",
        "steps": [
          "عروض را باز و کد، نوع و مقدار تخفیف، حداقل سفارش و محدودیت استفاده را قبل از ذخیره بررسی کنید.",
          "وضعیت و تاریخ‌ها را ببینید. قبل از تبلیغ، تخفیف نمایش‌داده‌شده یک سفارش واجد شرایط را بررسی کنید.",
          "برای امتیاز مشتری، وفاداری را باز و عضو و سابقه معاملات را پیش از اصلاح مجاز امتیاز ببینید."
        ],
        "note": "ایجاد تخفیف ثابت نمی‌کند همه صندوق‌ها آن را اعمال می‌کنند. امتیاز، کش‌بک و برگشت نقد عملیات متفاوت‌اند."
      }
    }
  },
  {
    "id": "tasks",
    "category": "people",
    "roles": [
      "owner",
      "manager",
      "employee"
    ],
    "route": "/tasks",
    "source": "src/pages/Tasks.jsx",
    "content": {
      "en": {
        "title": "Tasks and follow-up",
        "steps": [
          "Open Tasks and review the tasks available to your role and branch.",
          "Where permitted, create a task with a clear title, description, branch, assignee, due date and priority using the fields shown.",
          "Update its status as work progresses and verify that the intended employee can see the assignment in their portal."
        ],
        "note": "Saving a task does not prove that the assignee received it. If it is missing, check the assigned identity and branch with the owner."
      },
      "ar": {
        "title": "المهام والمتابعة",
        "steps": [
          "افتح المهام وراجع ما هو متاح لدورك وفرعك.",
          "حسب الصلاحية أنشئ مهمة بعنوان ووصف واضحين وفرع ومسؤول وموعد وأولوية من الحقول الظاهرة.",
          "حدّث الحالة مع تقدم العمل وتحقق من ظهور المهمة للموظف المقصود في بوابته."
        ],
        "note": "حفظ المهمة لا يثبت استلامها. إذا لم تظهر راجع هوية المسؤول والفرع مع المالك."
      },
      "fa": {
        "title": "وظایف و پیگیری",
        "steps": [
          "وظایف را باز و موارد قابل دسترسی نقش و شعبه خود را ببینید.",
          "در صورت صلاحیت، وظیفه با عنوان و توضیح روشن، شعبه، مسئول، مهلت و اولویت از فیلدهای موجود بسازید.",
          "با پیشرفت کار وضعیت را تغییر و دیده‌شدن وظیفه در پورتل کارمند مربوط را تأیید کنید."
        ],
        "note": "ذخیره وظیفه ثابت نمی‌کند به مسئول رسیده است. اگر دیده نشد، هویت مسئول و شعبه را با اونر بررسی کنید."
      }
    }
  },
  {
    "id": "advanced-analytics",
    "category": "reports",
    "roles": [
      "owner",
      "manager"
    ],
    "route": "/bi-center",
    "source": "src/pages/BICenter.jsx",
    "content": {
      "en": {
        "title": "Advanced analytics and forecasts",
        "steps": [
          "Open the analytics section included in your plan and select the branch and period available there.",
          "Compare trends with the underlying sales, purchase and expense records. Check whether a number represents an actual result or a forecast.",
          "Use the available business intelligence or copilot tools to investigate a question, then verify important recommendations against source records."
        ],
        "note": "A forecast or AI response is not a posted financial record or a guarantee. Review evidence before acting on a recommendation."
      },
      "ar": {
        "title": "التحليلات المتقدمة والتوقعات",
        "steps": [
          "افتح قسم التحليلات المشمول بخطتك وحدد الفرع والفترة المتاحة.",
          "قارن الاتجاهات مع سجلات المبيعات والمشتريات والمصروفات، وحدد هل الرقم فعلي أم متوقع.",
          "استخدم أدوات ذكاء الأعمال أو المساعد المتاحة لدراسة سؤال، ثم تحقق من التوصيات المهمة من السجلات الأصلية."
        ],
        "note": "التوقع أو رد الذكاء الاصطناعي ليس قيداً مالياً معتمداً ولا ضماناً. راجع الأدلة قبل تنفيذ التوصية."
      },
      "fa": {
        "title": "تحلیل پیشرفته و پیش‌بینی",
        "steps": [
          "بخش تحلیل شامل پلان خود را باز و شعبه و دوره موجود را انتخاب کنید.",
          "روندها را با رکوردهای فروش، خرید و مصرف مقایسه کنید. مشخص کنید عدد نتیجه واقعی است یا پیش‌بینی.",
          "از ابزارهای تحلیل کسب‌وکار یا دستیار موجود برای بررسی پرسش استفاده و توصیه مهم را با رکورد اصلی تأیید کنید."
        ],
        "note": "پیش‌بینی یا پاسخ هوش مصنوعی رکورد مالی ثبت‌شده یا تضمین نیست. قبل از عمل به توصیه، شواهد را بررسی کنید."
      }
    }
  },
  {
    "id": "integrations",
    "category": "start",
    "roles": [
      "owner"
    ],
    "route": "/telegram-settings",
    "source": "src/pages/TelegramSettings.jsx",
    "content": {
      "en": {
        "title": "Telegram and notification templates",
        "steps": [
          "Open Telegram settings with the owner's authorized account and review the bot and destination configuration.",
          "Use the available template editor to set the message content, then save the settings and send a test using the page controls.",
          "Verify that the message reached the intended destination and that its business, branch and figures are correct."
        ],
        "note": "Keep bot credentials private. A saved integration is not proof that messages are being delivered; check the test result before relying on it."
      },
      "ar": {
        "title": "تيليجرام وقوالب الإشعارات",
        "steps": [
          "افتح إعدادات تيليجرام بحساب المالك المخوّل وراجع إعداد البوت والوجهة.",
          "استخدم محرر القالب المتاح لكتابة الرسالة، ثم احفظ الإعدادات وأرسل اختباراً من أدوات الصفحة.",
          "تحقق من وصول الرسالة للوجهة الصحيحة ومن صحة المنشأة والفرع والأرقام."
        ],
        "note": "احتفظ ببيانات البوت بسرية. حفظ الربط لا يثبت وصول الرسائل؛ تحقق من نتيجة الاختبار قبل الاعتماد عليه."
      },
      "fa": {
        "title": "تلگرام و قالب اعلان‌ها",
        "steps": [
          "با حساب مجاز اونر تنظیمات تلگرام را باز و بات و مقصد را بررسی کنید.",
          "متن پیام را در ویرایشگر قالب موجود بنویسید، تنظیمات را ذخیره و از گزینه صفحه پیام آزمایشی بفرستید.",
          "رسیدن پیام به مقصد درست و صحت نام کسب‌وکار، شعبه و ارقام را تأیید کنید."
        ],
        "note": "مشخصات محرمانه بات را محفوظ نگه دارید. ذخیره اتصال ثابت نمی‌کند پیام‌ها می‌رسند؛ اول نتیجه آزمایش را ببینید."
      }
    }
  }
];

export function normalizeHelpSearch(value) {
  return String(value || "").normalize("NFKC").toLowerCase().replace(/[يى]/g, "ی").replace(/ك/g, "ک").replace(/[\u064B-\u065F\u0670\u0640\u200c]/g, "").replace(/\s+/g, " ").trim();
}

export function searchHelpArticles({ query = "", category = "all", role = "all" } = {}) {
  const words = normalizeHelpSearch(query).split(" ").filter(Boolean);
  return helpArticles.filter(article => (category === "all" || article.category === category)
    && (role === "all" || article.roles.includes(role))
    && words.every(word => normalizeHelpSearch([article.id, ...Object.values(article.content).flatMap(copy => [copy.title, ...copy.steps, copy.note])].join(" ")).includes(word)));
}
