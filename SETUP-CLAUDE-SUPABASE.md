# 🚀 تفعيل نظام Claude + Supabase + GitHub Actions

## الخطوة 1: إنشاء Supabase Project

1. اذهب إلى https://app.supabase.com
2. أنشئ New Project (أو استخدم موجود)
3. انتظر انتهاء التهيئة
4. احفظ بيانات الاتصال:
   - URL: مثلاً `https://xxxx.supabase.co`
   - Service Role Key (من Settings > API)

---

## الخطوة 2: تطبيق Schema في Supabase

### أ) Schema الأساسي (booking + tasks queue):

1. اذهب إلى **Supabase Dashboard → SQL Editor**
2. انسخ محتوى `supabase-schema.sql` بالكامل
3. اضغط **Run**
4. تحقق من النجاح: يجب أن ترى الجداول في **Database → Tables**

### ب) Trigger pg_net (dispatch إلى GitHub):

1. انسخ محتوى `supabase-trigger.sql`
2. اضغط **Run**

---

## الخطوة 3: إعداد Vault (المتطلب الحرج)

هذه الخطوة تسمح لـ Supabase بإرسال dispatches إلى GitHub بأمان.

### إنشاء GitHub PAT (Personal Access Token):

1. اذهب إلى https://github.com/settings/tokens
2. اضغط **Generate new token** → **Fine-grained personal access token**
3. اسم: `supabase-dispatch` (أي اسم)
4. Expiration: 90 days (أو حسب رغبتك)
5. Resource owner: اختر حسابك
6. **Permissions:**
   - Contents: Read & Write (فقط)
7. Allowed repositories: اختر `bookish-succotash`
8. اضغط **Generate token**
9. **انسخ الـ token فوراً** (لن تراه مرة أخرى)

### تخزين الـ Token في Vault:

1. اذهب إلى **Supabase Dashboard → Vault**
2. اضغط **Create Secret**
3. أنشئ سرين:

```
Secret 1:
  Name: github_pat
  Secret: [paste the token you just created]

Secret 2:
  Name: github_repo
  Secret: bbig50507-ctrl/bookish-succotash
```

---

## الخطوة 4: تعيين GitHub Secrets

في https://github.com/bbig50507-ctrl/bookish-succotash/settings/secrets/actions

```
1. SUPABASE_URL
   Value: https://your-project-id.supabase.co

2. SUPABASE_SERVICE_ROLE_KEY
   Value: [From Supabase Settings > API > Service Role Secret]

3. ANTHROPIC_API_KEY
   Value: [From https://console.anthropic.com]
```

وأضف **Repository Variable**:

```
Name: CLAUDE_MODEL
Value: claude-3-5-sonnet-20241022
```

---

## الخطوة 5: اختبار الـ Workflow

### A) تشغيل يدوي:

1. اذهب إلى **Actions tab**
2. اختر **Process Supabase booking tasks**
3. اضغط **Run workflow** → **Run**
4. شغّل مع ترك الـ inputs فارغة (سيختار task واحد عشوائي إن وجد)

### B) اختبار كامل (insert booking → dispatch → Claude review):

```sql
-- في Supabase SQL Editor:
-- استبدل USER_ID بـ UUID فعلي من auth.users (أو استخدم gen_random_uuid())

INSERT INTO public.bookings (user_id, property_ref, check_in, check_out, guest_count, customer_note, status)
VALUES (
  '550e8400-e29b-41d4-a716-446655440000',
  'PROP-12345',
  '2026-10-15'::date,
  '2026-10-20'::date,
  2,
  'Looking for a quiet place with nice views',
  'pending_review'
);
```

تابع ما يحدث:
1. ✅ Task يُنشأ تلقائياً
2. ✅ Trigger يحاول إرسال dispatch إلى GitHub
3. ✅ Workflow يتشغل
4. ✅ Claude يراجع الحجز
5. ✅ النتيجة تُحفظ في `task_results`

---

## الخطوة 6: مراقبة السجلات

### مراجعة task_results في Supabase:

```sql
SELECT 
  tr.task_id,
  tr.result,
  tr.created_at
FROM public.task_results tr
ORDER BY tr.created_at DESC
LIMIT 10;
```

### مراجعة task_events لـ audit trail:

```sql
SELECT 
  te.task_id,
  te.old_status,
  te.new_status,
  te.detail,
  te.created_at
FROM public.task_events te
ORDER BY te.created_at DESC
LIMIT 20;
```

### مراجعة workflow logs:

اذهب إلى https://github.com/bbig50507-ctrl/bookish-succotash/actions

---

## ✅ قائمة التحقق النهائية

- [ ] Supabase project مُنشأ وفعّال
- [ ] `supabase-schema.sql` تم تطبيقه
- [ ] `supabase-trigger.sql` تم تطبيقه
- [ ] GitHub PAT تم إنشاؤه وتخزينه في Vault
- [ ] `SUPABASE_URL` و `SUPABASE_SERVICE_ROLE_KEY` و `ANTHROPIC_API_KEY` معرّفة في GitHub Secrets
- [ ] `CLAUDE_MODEL` معرّفة كـ Variable
- [ ] Workflow الأول يعمل (انظر Actions)
- [ ] test booking أُدرج بنجاح
- [ ] Claude review تم استقباله

---

## 🐛 استكشاف الأخطاء

### الخطأ: "GitHub dispatch secrets are missing"

❌ الـ secrets في Vault غير موجودة أو فارغة
✅ تحقق من أسماء الـ secrets بالضبط: `github_pat` و `github_repo`

### الخطأ: "Missing required environment variable: ANTHROPIC_API_KEY"

❌ الـ secret في GitHub لم يُعرّف
✅ أضفه في Settings → Secrets → Actions

### Task معلق في "processing":

❌ قد تكون قاعدة البيانات مقفولة أو الـ worker فشل
✅ شغّل:
```sql
-- افتح task مقفول
UPDATE public.tasks
SET status = 'queued', locked_at = NULL, available_at = now()
WHERE status = 'processing' AND locked_at < now() - interval '10 minutes';
```

---

## 🔄 سير العمل الكامل

```
1. المستخدم يُدرج booking في الواجهة
   ↓
2. Supabase trigger `bookings_enqueue_review` ينشئ task
   ↓
3. Trigger `dispatch_queued_task` يرسل repository_dispatch
   ↓
4. GitHub Actions workflow يستقبل الـ event
   ↓
5. Python script يستدعي `worker_claim_tasks`
   ↓
6. Claude API يراجع الحجز
   ↓
7. Python script يستدعي `worker_complete_task`
   ↓
8. النتيجة تُحفظ في `task_results`
   ↓
9. المستخدم يرى الحالة في تطبيقه
```

---

## 📚 ملفات مرجعية

- `supabase-schema.sql` — الجداول و RLS و worker functions
- `supabase-trigger.sql` — pg_net dispatch إلى GitHub
- `.github/workflows/process-supabase-tasks-event.yml` — معالج الـ tasks و Claude
- README.md — ملاحظات أمنية ومحدودية

---

استمتع! 🎉
