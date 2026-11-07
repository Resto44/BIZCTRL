export const EMPLOYEE_HELP_GUIDES = [
  {
    "id": "employee-management",
    "category": "people",
    "roles": [
      "owner",
      "manager"
    ],
    "route": "/employees",
    "source": "src/pages/EmployeeManagementCenter.jsx",
    "content": {
      "en": {
        "title": "Employee Management Center — shifts, attendance and location",
        "steps": [
          "Open Employee Management Center. In Employee records, assign the correct branch and verified email. The owner sets working days and shift start/end in Saudi Arabia time; an earlier end time is the following day.",
          "Entry and exit use separate six-digit, single-use codes valid for 30 minutes. Automatic delivery starts 10 minutes before each scheduled time. Codes appear on the employee dashboard and are queued for email; the owner can generate a code and the employee can request one within the allowed window.",
          "Attendance & live staff shows branch GPS setup and current location sharing. Shift location history retains distance, GPS accuracy and inside/outside events for 90 days after employee consent. Open Attendance push notifications here to enable this device and verify the People filter."
        ],
        "note": "No fresh GPS means unknown, not absent. Browser suspension interrupts location collection. Review missing check-ins before changing attendance or payroll. Managers see only their authorized sections; schedules, precise live locations and owner push settings are owner-controlled."
      },
      "ar": {
        "title": "مركز إدارة الموظفين — الدوام والحضور والموقع",
        "steps": [
          "افتح مركز إدارة الموظفين وحدد الفرع والبريد المؤكد في بيانات الموظف. يحدد المالك أيام العمل وبداية ونهاية الدوام بتوقيت السعودية؛ النهاية المبكرة تعني اليوم التالي.",
          "لكل دخول وخروج رمز مستقل من ستة أرقام لمرة واحدة وصالح ٣٠ دقيقة. يبدأ الإرسال التلقائي قبل الموعد بـ١٠ دقائق. يظهر الرمز بلوحة الموظف ويُجهز للبريد؛ يستطيع المالك توليده والموظف طلبه ضمن الوقت المسموح.",
          "قسم الحضور والموظفين يعرض إعداد GPS للفرع والمشاركة الحالية. يحتفظ سجل الموقع بالمسافة والدقة وحالة داخل/خارج النطاق ٩٠ يوماً بعد موافقة الموظف. افتح إشعارات الحضور لتفعيل الجهاز والتحقق من فلتر الموظفين People."
        ],
        "note": "عدم وصول GPS يعني حالة غير معروفة وليس غياباً. تعليق المتصفح يوقف جمع الموقع. راجع الدخول غير المسجل قبل تغيير الحضور أو الراتب. المدير يرى الأقسام المسموحة فقط؛ الجدول والموقع الدقيق وإشعارات المالك تحت صلاحية المالك."
      },
      "fa": {
        "title": "مرکز مدیریت کارمندان — شیفت، حاضری و موقعیت",
        "steps": [
          "مرکز مدیریت کارمندان را باز کنید. در مشخصات کارمند، شعبه و ایمیل تأییدشده را درست تعیین کنید. اونر روزها و ساعت شروع و پایان وظیفه را به وقت عربستان تنظیم می‌کند؛ پایان زودتر یعنی روز بعد.",
          "ورود و خروج کدهای جداگانهٔ شش‌رقمی، یک‌بارمصرف و با اعتبار ۳۰ دقیقه دارند. ارسال خودکار ۱۰ دقیقه پیش از وقت تعیین‌شده شروع می‌شود. کد در داشبورد ظاهر و برای ایمیل آماده می‌شود؛ اونر می‌تواند کد تولید کند و کارمند در زمان مجاز درخواست بدهد.",
          "در حاضری و کارمندان زنده، GPS شعبه و اشتراک فعلی دیده می‌شود. تاریخچهٔ شیفت پس از اجازهٔ کارمند فاصله، دقت و داخل/بیرون محل کار را ۹۰ روز نگه می‌دارد. برای فعال‌سازی همین دستگاه و بررسی فیلتر People، بخش پوش حاضری را باز کنید."
        ],
        "note": "نبود GPS تازه، نامشخص است نه غیابت. بسته‌شدن مرورگر جمع‌آوری موقعیت را قطع می‌کند. قبل از تغییر حاضری یا معاش، ورود ثبت‌نشده را بررسی کنید. مدیر فقط بخش‌های مجاز را می‌بیند؛ تنظیم شیفت، موقعیت دقیق و پوش اونر مخصوص اونر است."
      }
    }
  },
  {
    "id": "attendance-push",
    "category": "people",
    "roles": [
      "owner"
    ],
    "route": "/notifications",
    "source": "src/components/notifications/OwnerPushSettings.jsx",
    "content": {
      "en": {
        "title": "Attendance push — check-in, check-out and absence",
        "steps": [
          "On iPhone, install BizCTRL from Safari using Share → Add to Home Screen, then open its icon. In Employee Management Center, expand Attendance push notifications; choose Enable notifications and allow the device prompt.",
          "In push customization keep notifications enabled, the People module selected, Insert action selected and the intended branches included. Use Send test notification on each owner device; provider acceptance does not prove the alert was displayed.",
          "New check-ins and check-outs produce separate owner alerts with employee, branch and time. A recorded absent status produces an absence alert. Fifteen minutes after a scheduled shift starts without check-in, a one-time review alert is queued; days off and recorded vacation are excluded."
        ],
        "note": "A missing check-in alert does not mark the employee absent or deduct pay. GPS loss never creates an absence alert. Device permissions, connectivity and focus settings affect delivery; new devices must be enabled individually. This business attendance push is delivered to approved owners."
      },
      "ar": {
        "title": "إشعارات الحضور — الدخول والخروج والغياب",
        "steps": [
          "على الآيفون ثبّت BizCTRL عبر Safari ثم مشاركة وإضافة للشاشة الرئيسية وافتح أيقونته. من مركز إدارة الموظفين افتح إشعارات الحضور واضغط تفعيل الإشعارات واسمح بطلب الجهاز.",
          "في تخصيص الإشعارات فعّل الإرسال واختر قسم People وعملية Insert والفروع المطلوبة. جرّب إرسال إشعار اختباري لكل جهاز مالك؛ قبول مزود الإشعارات لا يؤكد ظهوره على الشاشة.",
          "يُرسل الدخول والخروج الجديدان إشعارين منفصلين باسم الموظف والفرع والوقت. تسجيل حالة غائب يرسل إشعار غياب. بعد ١٥ دقيقة من بداية دوام مجدول دون دخول يُجهز تنبيه مراجعة مرة واحدة؛ تُستثنى أيام الراحة والإجازة المسجلة."
        ],
        "note": "تنبيه الدخول المفقود لا يسجل غياباً ولا يخصم راتباً. انقطاع GPS لا يولد غياباً. الإذن والاتصال والتركيز تؤثر على الوصول؛ فعّل كل جهاز منفرداً. تصل هذه الإشعارات إلى الملاك المعتمدين."
      },
      "fa": {
        "title": "پوش حاضری — ورود، خروج و غیابت",
        "steps": [
          "در آیفون BizCTRL را از Safari با Share و Add to Home Screen نصب کرده از آیکونش باز کنید. در مرکز مدیریت کارمندان، پوش حاضری را باز و فعال‌کردن اعلان‌ها را بزنید؛ اجازهٔ دستگاه را تأیید کنید.",
          "در تنظیم اعلان‌ها، ارسال روشن، بخش People و عمل Insert انتخاب و شعبه‌های لازم شامل باشند. در هر دستگاه اونر ارسال اعلان آزمایشی را امتحان کنید؛ پذیرش سرویس پوش به معنی نمایش قطعی روی گوشی نیست.",
          "ورود و خروج جدید، اعلان‌های جداگانه با نام کارمند، شعبه و وقت دارند. ثبت وضعیت غایب اعلان غیابت می‌فرستد. اگر ۱۵ دقیقه از شروع شیفت تنظیم‌شده گذشت و ورود ثبت نشد، یک هشدار بررسی صادر می‌شود؛ روز تعطیل و رخصتی ثبت‌شده مستثناست."
        ],
        "note": "هشدار ورود ثبت‌نشده، کارمند را غایب نمی‌کند و معاش کم نمی‌کند. قطع GPS اعلان غیابت نمی‌سازد. اجازهٔ دستگاه، اینترنت و Focus بر دریافت اثر دارند؛ هر دستگاه جدا فعال شود. این پوش به اونرهای تأییدشده می‌رسد."
      }
    }
  },
  {
    "id": "employee",
    "category": "people",
    "roles": [
      "employee"
    ],
    "route": "/employee-dashboard",
    "source": "src/pages/EmployeeDashboardERP.jsx",
    "content": {
      "en": {
        "title": "Employee portal — attendance codes and shift location",
        "steps": [
          "Sign in with your approved employee account and confirm your verified email and assigned branch. Check the shift time on your dashboard. A completed shift remains closed; contact the owner if the schedule or record needs correction.",
          "Use the dashboard six-digit entry or exit code before its 30-minute expiry. Request a new code when eligible; allow precise GPS and submit Check In or Check Out. Confirm the saved server time, not just the button click.",
          "You may consent at check-in to live sharing and 90-day distance history, or start sharing during the open shift. Keep the portal open; it resumes on return during that shift. Review your own shift history, distance in meters/kilometers and GPS accuracy."
        ],
        "note": "Checkout or manual stop ends sharing; the safety limit is 16 hours. A locked phone or suspended browser cannot guarantee location updates. Missing GPS is not absence. Owner attendance push is separate from your code email and requires the owner to enable their device."
      },
      "ar": {
        "title": "بوابة الموظف — رموز الحضور وموقع الدوام",
        "steps": [
          "سجل دخولك بحساب الموظف المعتمد وتحقق من البريد المؤكد والفرع المخصص. راجع موعد الدوام بلوحتك. الدوام المكتمل يبقى مغلقاً؛ اطلب من المالك مراجعة الجدول أو السجل عند الحاجة.",
          "استخدم رمز الدخول أو الخروج ذي الستة أرقام قبل انتهاء صلاحيته خلال ٣٠ دقيقة. اطلب رمزاً جديداً عند إتاحته واسمح بـGPS الدقيق ثم سجل الدخول أو الخروج وتأكد من وقت الحفظ.",
          "يمكنك الموافقة عند الدخول على مشاركة الموقع وسجل المسافات ٩٠ يوماً أو تشغيلها أثناء الدوام المفتوح. أبقِ البوابة مفتوحة؛ تستأنف عند الرجوع لنفس الدوام. راجع سجلك والمسافة بالمتر أو الكيلومتر ودقة GPS."
        ],
        "note": "الخروج أو الإيقاف اليدوي ينهي المشاركة، وحد الأمان ١٦ ساعة. قفل الهاتف أو تعليق المتصفح لا يضمن التحديثات. غياب GPS ليس غياباً وظيفياً. إشعارات المالك منفصلة عن بريد الرمز وتتطلب تفعيل جهاز المالك."
      },
      "fa": {
        "title": "پورتل کارمند — کد حاضری و موقعیت شیفت",
        "steps": [
          "با حساب کارمند تأییدشده وارد شوید و ایمیل تأییدشده و شعبهٔ مربوط را بررسی کنید. ساعت شیفت در داشبورد است. شیفت تکمیل‌شده بسته می‌ماند؛ برای اصلاح ساعت یا رکورد به اونر مراجعه کنید.",
          "کد شش‌رقمی ورود یا خروج داشبورد را پیش از ختم اعتبار ۳۰ دقیقه استفاده کنید. در زمان مجاز کد جدید بخواهید، اجازهٔ GPS دقیق بدهید و چک‌این یا چک‌اوت کنید. وقت ثبت‌شدهٔ سرور را بررسی کنید.",
          "هنگام ورود می‌توانید اجازهٔ موقعیت زنده و تاریخچهٔ فاصلهٔ ۹۰ روزه بدهید یا در شیفت باز آن را شروع کنید. پورتل را باز نگه دارید؛ با بازگشت در همان شیفت ادامه می‌یابد. تاریخچهٔ خود، فاصله به متر/کیلومتر و دقت GPS را ببینید."
        ],
        "note": "چک‌اوت یا توقف دستی اشتراک را ختم می‌کند؛ حد ایمنی ۱۶ ساعت است. قفل گوشی یا تعلیق مرورگر ارسال را تضمین نمی‌کند. نبود GPS غیابت نیست. پوش اونر جدا از ایمیل کد شماست و دستگاه اونر باید فعال باشد."
      }
    }
  }
];
