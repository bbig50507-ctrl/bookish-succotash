# 🏠 منصة العقارات والحجوزات

منصة احترافية لإدارة العقارات والحجوزات مع نظام دفع متكامل عبر **Supabase** و **USDT**.

## ✨ الميزات الرئيسية

✅ **نظام تسجيل الدخول** آمن (Sign Up / Login)  
✅ **رفع إثبات الدفع** مع صور واضحة  
✅ **لوحة تحكم المسؤول** لإدارة الدفعات  
✅ **تحديثات فورية** للحالات  
✅ **واجهة بالعربية** بشكل أساسي  
✅ **أمان عالي** مع متغيرات البيئة  

## 🚀 البدء السريع

### المتطلبات
- Node.js 14+
- npm أو yarn
- حساب Supabase (مجاني)

### التثبيت

\`\`\`bash
git clone https://github.com/bbig50507-ctrl/bookish-succotash.git
cd bookish-succotash
npm install
cp .env.local.example .env.local
\`\`\`

### إعداد Supabase

1. اذهب إلى [Supabase.com](https://supabase.com)
2. أنشئ مشروع جديد
3. انسخ \`Project URL\` و \`Anon Key\`
4. عدّل ملف \`.env.local\`:

\`\`\`
REACT_APP_SUPABASE_URL=your_project_url
REACT_APP_SUPABASE_ANON_KEY=your_anon_key
\`\`\`

### إنشاء جداول Supabase

\`\`\`sql
CREATE TABLE payments (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  amount DECIMAL(10, 2) NOT NULL,
  proof_image_url TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id)
);

CREATE TABLE admins (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id),
  created_at TIMESTAMP DEFAULT NOW()
);
\`\`\`

### تشغيل المشروع

\`\`\`bash
npm start
\`\`\`

يفتح على \`http://localhost:3000\`

## 📱 الاستخدام

**للعملاء:** التسجيل → إرسال الإثبات → الانتظار  
**للمسؤولين:** المراجعة → الموافقة/الرفض

## 🔒 الأمان

✅ المفاتيح في \`.env.local\` فقط  
✅ استخدم \`.gitignore\` لمنع الرفع  
✅ دوّر المفاتيح دورياً

## 📞 التواصل

افتح Issue على GitHub للتواصل والدعم.

---

**صُنع بـ ❤️ من قبل فريق التطوير**
