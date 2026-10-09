(() => {
  'use strict';
  const config = window.SUPABASE_CONFIG || {};
  const brandName = document.title.includes('دار') ? 'دار' : 'بيتي';
  const triggers = document.querySelectorAll('[data-auth-trigger]');
  if (!triggers.length) return;

  const dialog = document.createElement('dialog');
  dialog.className = 'auth-dialog';
  dialog.id = 'auth-dialog';
  dialog.setAttribute('aria-labelledby', 'auth-title');
  dialog.innerHTML = '<button class="auth-close" id="auth-close" type="button" aria-label="إغلاق">×</button><div class="auth-dialog-inner" id="auth-content"></div>';
  document.body.append(dialog);
  const content = dialog.querySelector('#auth-content');
  let client = null;
  let session = null;
  let profileName = '';
  let mode = 'signin';
  let connectionState = 'loading';
  const hasConfig = typeof config.url === 'string' && /^https:\/\//i.test(config.url.trim())
    && typeof config.anonKey === 'string' && config.anonKey.trim().length > 0;

  function setMessage(message, tone = 'info') {
    const node = content.querySelector('[data-auth-message]');
    if (!node) return;
    node.textContent = message;
    node.dataset.tone = tone;
  }
  function updateTriggers() {
    const signedIn = Boolean(session?.user);
    triggers.forEach((button) => {
      button.textContent = signedIn ? (profileName || 'حسابي') : 'تسجيل الدخول';
      button.setAttribute('aria-label', signedIn ? 'إدارة الحساب' : 'تسجيل الدخول');
      button.setAttribute('aria-haspopup', 'dialog');
    });
  }
  async function loadProfile(user) {
    if (!client || !user) return;
    try {
      const { data, error } = await client.from('profiles').select('display_name').eq('id', user.id).maybeSingle();
      if (!error && data?.display_name) profileName = data.display_name;
    } catch (_) {
      // Authentication remains usable if the profile migration has not been applied yet.
    }
    updateTriggers();
    if (dialog.open) render();
  }
  function renderUnavailable() {
    content.innerHTML = `<div class="auth-heading"><span class="auth-kicker">حسابك في ${brandName}</span><h2 id="auth-title">تسجيل الدخول غير موصول بعد</h2><p>لم تُضبط إعدادات Supabase العامة لهذا الموقع. لن تُرسل أي بيانات من هذه النافذة.</p></div><p class="auth-notice" role="status">يلزم عنوان المشروع ومفتاح المتصفح العام <code>anon</code> بعد تأكيد المشروع المقصود. لا تستخدم مفتاح <code>service_role</code>.</p><p class="auth-message" data-auth-message></p>`;
  }
  function render() {
    if (!hasConfig) { connectionState = 'missing'; renderUnavailable(); return; }
    if (connectionState === 'loading') {
      content.innerHTML = `<div class="auth-heading"><span class="auth-kicker">حسابك في ${brandName}</span><h2 id="auth-title">جارٍ تجهيز الدخول</h2><p>لحظات من فضلك.</p></div><p class="auth-message" data-auth-message role="status"></p>`;
      return;
    }
    if (connectionState === 'error' || !client) {
      content.innerHTML = `<div class="auth-heading"><span class="auth-kicker">حسابك في ${brandName}</span><h2 id="auth-title">تعذّر الاتصال</h2><p>لم يتم إرسال بياناتك. تحقق من إعدادات المشروع والاتصال ثم أعد المحاولة.</p></div><p class="auth-message" data-auth-message role="status"></p>`;
      return;
    }
    if (session?.user) {
      content.innerHTML = `<div class="auth-heading"><span class="auth-kicker">حسابك في ${brandName}</span><h2 id="auth-title">أهلًا بك</h2><p class="auth-account-name"></p><p class="auth-account-email"></p></div><button class="auth-submit" type="button" data-auth-signout>تسجيل الخروج</button><p class="auth-message" data-auth-message role="status"></p>`;
      content.querySelector('.auth-account-name').textContent = profileName || session.user.user_metadata?.display_name || 'حسابك';
      content.querySelector('.auth-account-email').textContent = session.user.email || '';
      return;
    }
    const isSignup = mode === 'signup';
    content.innerHTML = `<div class="auth-heading"><span class="auth-kicker">حسابك في ${brandName}</span><h2 id="auth-title">${isSignup ? 'إنشاء حساب' : 'تسجيل الدخول'}</h2><p>${isSignup ? 'أنشئ حسابًا للمتابعة.' : 'تابع إلى حسابك بأمان عبر بريدك الإلكتروني.'}</p></div><form class="auth-form" id="auth-form"><label ${isSignup ? '' : 'hidden'}>الاسم<input name="display_name" type="text" autocomplete="name" minlength="2" ${isSignup ? 'required' : ''} placeholder="الاسم الظاهر"></label><label>البريد الإلكتروني<input name="email" type="email" autocomplete="email" required placeholder="name@example.com"></label><label>كلمة المرور<input name="password" type="password" autocomplete="${isSignup ? 'new-password' : 'current-password'}" minlength="8" required placeholder="8 أحرف على الأقل"></label><button class="auth-submit" type="submit">${isSignup ? 'إنشاء الحساب' : 'دخول'}</button></form><div class="auth-options"><button type="button" data-auth-mode="${isSignup ? 'signin' : 'signup'}">${isSignup ? 'لديك حساب؟ سجّل الدخول' : 'ليس لديك حساب؟ أنشئ حسابًا'}</button><button type="button" data-auth-forgot>نسيت كلمة المرور؟</button></div><p class="auth-message" data-auth-message role="status"></p><p class="auth-footnote">قد يُطلب تأكيد البريد قبل استخدام الحساب.</p>`;
  }
  function showDialog() { if (!dialog.open) dialog.showModal(); render(); }
  const redirectTo = () => `${window.location.origin}${window.location.pathname}`;
  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-auth-trigger]');
    if (!trigger) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    showDialog();
  }, true);
  dialog.querySelector('#auth-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  content.addEventListener('click', async (event) => {
    const modeButton = event.target.closest('[data-auth-mode]');
    if (modeButton) { mode = modeButton.dataset.authMode; render(); return; }
    if (event.target.closest('[data-auth-signout]')) {
      try {
        const { error } = await client.auth.signOut();
        if (error) throw error;
        session = null; profileName = ''; mode = 'signin'; updateTriggers(); render(); setMessage('تم تسجيل الخروج.', 'success');
      } catch (_) { setMessage('تعذّر تسجيل الخروج الآن. حاول مجددًا.', 'error'); }
      return;
    }
    if (event.target.closest('[data-auth-forgot]')) {
      const email = content.querySelector('[name="email"]')?.value.trim();
      if (!email) { setMessage('اكتب بريدك الإلكتروني أولًا، ثم اختر استعادة كلمة المرور.', 'error'); return; }
      const button = event.target.closest('[data-auth-forgot]');
      button.disabled = true;
      try {
        const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: redirectTo() });
        setMessage(error ? 'تعذّر إرسال رابط الاستعادة. تحقق من البريد والإعدادات.' : 'إذا كان البريد مسجلًا، فسيصلك رابط الاستعادة.', error ? 'error' : 'success');
      } catch (_) { setMessage('تعذّر إرسال رابط الاستعادة الآن.', 'error'); }
      finally { button.disabled = false; }
    }
  });
  content.addEventListener('submit', async (event) => {
    if (event.target.id !== 'auth-form') return;
    event.preventDefault();
    const form = event.target;
    const submit = form.querySelector('[type="submit"]');
    const fields = new FormData(form);
    const email = String(fields.get('email') || '').trim();
    const password = String(fields.get('password') || '');
    submit.disabled = true;
    submit.textContent = 'جارٍ التحقق…';
    try {
      const result = mode === 'signup'
        ? await client.auth.signUp({ email, password, options: { data: { display_name: String(fields.get('display_name') || '').trim() }, emailRedirectTo: redirectTo() } })
        : await client.auth.signInWithPassword({ email, password });
      if (result.error) {
        setMessage(mode === 'signup' ? 'تعذّر إنشاء الحساب. تحقق من البريد وكلمة المرور وإعدادات البريد.' : 'تعذّر تسجيل الدخول. تحقق من البريد وكلمة المرور.', 'error');
      } else if (result.data.session) {
        session = result.data.session;
        profileName = session.user.user_metadata?.display_name || '';
        updateTriggers();
        void loadProfile(session.user);
        render();
        setMessage('تم تسجيل الدخول بنجاح.', 'success');
      } else {
        setMessage('تم إنشاء الحساب. تحقق من بريدك الإلكتروني لتأكيده قبل تسجيل الدخول.', 'success');
      }
    } catch (_) {
      setMessage('تعذّر الاتصال بخدمة المصادقة. لم نتمكن من إكمال الطلب.', 'error');
    } finally {
      const currentSubmit = content.querySelector('#auth-form [type="submit"]');
      if (currentSubmit) { currentSubmit.disabled = false; currentSubmit.textContent = mode === 'signup' ? 'إنشاء الحساب' : 'دخول'; }
    }
  });
  async function initialize() {
    if (!hasConfig) { connectionState = 'missing'; updateTriggers(); return; }
    try {
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
      client = createClient(config.url.trim(), config.anonKey.trim(), { auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true } });
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      session = data.session;
      profileName = session?.user?.user_metadata?.display_name || '';
      connectionState = 'ready';
      updateTriggers();
      if (session?.user) void loadProfile(session.user);
      client.auth.onAuthStateChange((_event, nextSession) => {
        session = nextSession;
        profileName = nextSession?.user?.user_metadata?.display_name || '';
        updateTriggers();
        if (dialog.open) render();
      });
      if (dialog.open) render();
    } catch (_) {
      connectionState = 'error';
      updateTriggers();
      if (dialog.open) render();
    }
  }
  updateTriggers();
  void initialize();
})();
