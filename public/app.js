(() => {
  const stays = [
    { id: 'coast', title: 'شقة بإطلالة هادئة على البحر', location: 'وجهة ساحلية · قريبة من الشاطئ', type: 'coast', tags: ['family'], guests: 4, beds: 2, baths: 1, rating: '4.92', price: 95, image: 'assets/stay-coast.webp', label: 'إطلالة بحرية', description: 'مساحة مشرقة بإطلالة مريحة، مناسبة لإجازة قصيرة أو عطلة عائلية. هذه البيانات تجريبية لتوضيح شكل صفحة الإقامة.' },
    { id: 'cabin', title: 'كوخ خشبي بين التلال الخضراء', location: 'منطقة جبلية · أجواء هادئة', type: 'cabin', tags: [], guests: 5, beds: 3, baths: 2, rating: '4.98', price: 120, image: 'assets/stay-cabin.webp', label: 'الأكثر هدوءًا', description: 'كوخ مستقل تحيط به الطبيعة، مع جلسة خارجية ومساحة مناسبة للمجموعات الصغيرة. المكان والسعر مثالان غير حقيقيين.' },
    { id: 'city', title: 'استوديو دافئ في قلب المدينة', location: 'وسط المدينة · يسهل الوصول إليه', type: 'city', tags: [], guests: 2, beds: 1, baths: 1, rating: '4.87', price: 75, image: 'assets/stay-city.webp', label: 'مناسب لشخصين', description: 'استوديو عملي بتصميم بسيط، مثالي لزيارة قصيرة. الموقع والوصف والسعر أمثلة تجريبية وليست عرضًا حقيقيًا.' }
  ];

  const $ = (selector) => document.querySelector(selector);
  const grid = $('#listing-grid');
  const form = $('#search-form');
  const destination = $('#destination');
  const checkin = $('#checkin');
  const checkout = $('#checkout');
  const guestsSelect = $('#guests');
  const count = $('#results-count');
  const empty = $('#empty-state');
  const favoritesFilter = $('#favorites-filter');
  const dialog = $('#detail-dialog');
  const toast = $('#toast');
  const saved = new Set(JSON.parse(localStorage.getItem('masaken-favorites') || '[]'));
  const config = window.MASAKEN_SUPABASE || {};
  const supabaseLib = window.supabase;
  let client = null;
  let currentUser = null;
  let selectedStay = null;
  let activeCategory = 'all';
  let onlyFavorites = false;
  let toastTimer;

  if (config.url && config.anonKey && supabaseLib?.createClient) {
    client = supabaseLib.createClient(config.url, config.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
  }

  const iconHeart = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 8.7c0 5.1-8.8 10.2-8.8 10.2S3.2 13.8 3.2 8.7A4.7 4.7 0 0 1 12 6.2a4.7 4.7 0 0 1 8.8 2.5Z"/></svg>';
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

  function notify(message) {
    toast.textContent = message;
    toast.classList.add('show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('show'), 3200);
  }

  function updateAccountButton() {
    const label = currentUser ? 'الحساب: ' + currentUser.email : 'الملف الشخصي';
    $('#profile-button').setAttribute('aria-label', label);
    $('#mobile-profile').setAttribute('aria-label', label);
  }

  async function loadAuthState() {
    if (!client) return;
    const { data } = await client.auth.getSession();
    currentUser = data.session?.user || null;
    updateAccountButton();
    client.auth.onAuthStateChange((_event, session) => {
      currentUser = session?.user || null;
      updateAccountButton();
    });
  }

  function filteredStays() {
    const query = destination.value.trim().toLocaleLowerCase('ar');
    const minGuests = Number(guestsSelect.value || 1);
    return stays.filter((stay) => {
      const searchable = `${stay.title} ${stay.location} ${stay.type}`.toLocaleLowerCase('ar');
      return (!query || searchable.includes(query)) &&
        (activeCategory === 'all' || stay.type === activeCategory || stay.tags.includes(activeCategory)) &&
        stay.guests >= minGuests && (!onlyFavorites || saved.has(stay.id));
    });
  }

  function render() {
    const results = filteredStays();
    grid.innerHTML = results.map((stay) => `
      <article class="listing-card">
        <div class="listing-photo-wrap">
          <img class="listing-photo" src="${escapeHtml(stay.image)}" alt="${escapeHtml(stay.title)}" loading="lazy" />
          <span class="photo-tag">${escapeHtml(stay.label)}</span>
          <button class="favorite-button ${saved.has(stay.id) ? 'is-saved' : ''}" type="button" data-favorite="${escapeHtml(stay.id)}" aria-label="${saved.has(stay.id) ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'}" aria-pressed="${saved.has(stay.id)}">${iconHeart}</button>
        </div>
        <div class="listing-info">
          <div class="listing-title-row"><h3 class="listing-title">${escapeHtml(stay.title)}</h3><span class="listing-rating"><span aria-hidden="true">★</span>${escapeHtml(stay.rating)}</span></div>
          <p class="listing-location">${escapeHtml(stay.location)}</p>
          <p class="listing-description">${stay.guests} ضيوف · ${stay.beds} غرف نوم · ${stay.baths} حمّام</p>
          <div class="price-row"><strong>${new Intl.NumberFormat('ar').format(stay.price)} USDT</strong><span>ليلة واحدة</span><span class="sample-price">تجريبي</span></div>
        </div>
        <button class="details-button" type="button" data-details="${escapeHtml(stay.id)}">عرض التفاصيل <span aria-hidden="true">←</span></button>
      </article>`).join('');
    empty.hidden = results.length > 0;
    count.textContent = results.length ? `${new Intl.NumberFormat('ar').format(results.length)} أماكن مقترحة` : 'لا توجد نتائج';
    $('#show-all').hidden = results.length === stays.length && !onlyFavorites && activeCategory === 'all' && !destination.value.trim();
  }

  function showDetails(id) {
    const stay = stays.find((item) => item.id === id);
    if (!stay) return;
    selectedStay = stay;
    $('#dialog-photo').style.backgroundImage = `url("${stay.image}")`;
    $('#dialog-location').textContent = stay.location;
    $('#dialog-title').textContent = stay.title;
    $('#dialog-description').textContent = stay.description;
    $('#dialog-facts').innerHTML = `<span>${stay.guests} ضيوف كحد أقصى</span><span>${stay.beds} غرف نوم</span><span>${stay.baths} حمّام</span>`;
    $('#dialog-price').innerHTML = `${new Intl.NumberFormat('ar').format(stay.price)} USDT <small>لليلة · سعر تجريبي</small>`;
    $('#open-booking').disabled = !client;
    $('#booking-availability').textContent = client
      ? 'يمكنك إرسال طلب للمراجعة. السعر والمكان المعروضان تجريبيان ولا يوجد تأكيد أو دفع.'
      : 'الحجز غير متاح بعد: يلزم إعداد عنوان Supabase ومفتاح anon عام في supabase-config.js.';
    dialog.showModal();
  }

  function openAuth() {
    if (!client) {
      notify('لم يُضبط اتصال Supabase بعد؛ لا يمكن تسجيل الدخول الآن');
      return;
    }
    $('#auth-dialog').showModal();
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (Boolean(checkin.value) !== Boolean(checkout.value)) return notify('اختر تاريخ الوصول والمغادرة معًا');
    if (checkin.value && checkout.value <= checkin.value) return notify('يجب أن يكون تاريخ المغادرة بعد تاريخ الوصول');
    render();
    if (checkin.value) notify('التواريخ للتصفية فقط؛ لا يوجد تحقق من التوفر');
    $('#listings').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  destination.addEventListener('input', render);
  guestsSelect.addEventListener('change', render);
  document.querySelectorAll('.category').forEach((button) => button.addEventListener('click', () => {
    activeCategory = button.dataset.category;
    document.querySelectorAll('.category').forEach((item) => item.classList.toggle('active', item === button));
    render();
  }));

  grid.addEventListener('click', (event) => {
    const favoriteButton = event.target.closest('[data-favorite]');
    const detailsButton = event.target.closest('[data-details]');
    if (favoriteButton) {
      const id = favoriteButton.dataset.favorite;
      saved.has(id) ? saved.delete(id) : saved.add(id);
      localStorage.setItem('masaken-favorites', JSON.stringify([...saved]));
      render();
      notify(saved.has(id) ? 'أُضيف المكان إلى المفضلة' : 'أُزيل المكان من المفضلة');
    }
    if (detailsButton) showDetails(detailsButton.dataset.details);
  });

  function toggleFavorites() {
    onlyFavorites = !onlyFavorites;
    favoritesFilter.classList.toggle('active', onlyFavorites);
    favoritesFilter.innerHTML = `<span aria-hidden="true">${onlyFavorites ? '♥' : '♡'}</span> ${onlyFavorites ? 'كل الأماكن' : 'المفضلة فقط'}`;
    $('#listings').scrollIntoView({ behavior: 'smooth', block: 'start' });
    render();
  }
  favoritesFilter.addEventListener('click', toggleFavorites);
  $('#mobile-favorites').addEventListener('click', toggleFavorites);

  $('#clear-filters').addEventListener('click', () => {
    destination.value = '';
    guestsSelect.value = '1';
    activeCategory = 'all';
    onlyFavorites = false;
    favoritesFilter.classList.remove('active');
    favoritesFilter.innerHTML = '<span aria-hidden="true">♡</span> المفضلة فقط';
    document.querySelectorAll('.category').forEach((item) => item.classList.toggle('active', item.dataset.category === 'all'));
    render();
  });
  $('#reset-search').addEventListener('click', () => $('#clear-filters').click());
  $('#show-all').addEventListener('click', () => { $('#clear-filters').click(); notify('تُعرض الآن جميع الأمثلة التجريبية'); });
  $('#profile-button').addEventListener('click', openAuth);
  $('#mobile-profile').addEventListener('click', openAuth);
  $('#dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  document.querySelectorAll('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => $('#' + button.dataset.closeDialog).close()));

  $('#sign-in-button').addEventListener('click', async (event) => {
    event.preventDefault();
    if (!client) return notify('اتصال Supabase غير مضبوط');
    const email = $('#auth-email').value.trim();
    const password = $('#auth-password').value;
    if (!email || !password) return notify('أدخل البريد الإلكتروني وكلمة المرور');
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) return notify(error.message);
    $('#auth-dialog').close();
    notify('تم تسجيل الدخول');
  });

  $('#sign-up-button').addEventListener('click', async () => {
    if (!client) return notify('اتصال Supabase غير مضبوط');
    const email = $('#auth-email').value.trim();
    const password = $('#auth-password').value;
    if (!email || password.length < 8) return notify('أدخل بريدًا صالحًا وكلمة مرور من 8 أحرف على الأقل');
    const { data, error } = await client.auth.signUp({ email, password });
    if (error) return notify(error.message);
    if (data.session) {
      $('#auth-dialog').close();
      notify('تم إنشاء الحساب وتسجيل الدخول');
    } else {
      notify('تم إنشاء الحساب؛ راجع بريدك لتأكيده ثم سجّل الدخول');
    }
  });

  $('#open-booking').addEventListener('click', () => {
    if (!client || !selectedStay) return;
    if (!currentUser) {
      dialog.close();
      notify('سجّل الدخول أولًا لإرسال طلب الحجز');
      openAuth();
      return;
    }
    dialog.close();
    $('#booking-property').textContent = `${selectedStay.title} — السعر المعروض توضيحي`;
    $('#booking-checkin').value = checkin.value;
    $('#booking-checkout').value = checkout.value;
    $('#booking-guests').value = String(Math.min(Number(guestsSelect.value || 1), selectedStay.guests));
    $('#booking-dialog').showModal();
  });

  $('#booking-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!client || !currentUser || !selectedStay) return notify('سجّل الدخول ثم أعد المحاولة');
    const arrival = $('#booking-checkin').value;
    const departure = $('#booking-checkout').value;
    const guestCount = Number($('#booking-guests').value);
    if (departure <= arrival) return notify('يجب أن يكون تاريخ المغادرة بعد تاريخ الوصول');
    if (guestCount > selectedStay.guests) return notify('عدد الضيوف يتجاوز السعة الموضحة للمكان');
    const button = $('#submit-booking');
    button.disabled = true;
    button.textContent = 'جارٍ إرسال الطلب…';
    try {
      const { error } = await client.from('bookings').insert({
        user_id: currentUser.id,
        property_ref: selectedStay.id,
        check_in: arrival,
        check_out: departure,
        guest_count: guestCount,
        customer_note: $('#booking-note').value.trim() || null,
        status: 'pending_review'
      });
      if (error) throw error;
      $('#booking-dialog').close();
      dialog.close();
      $('#booking-note').value = '';
      notify('وصل طلبك للمراجعة. هذا ليس تأكيدًا للحجز أو الدفع.');
    } catch (error) {
      console.error('Booking submission failed:', error.message);
      notify('تعذّر إرسال الطلب. تحقق من إعداد Supabase وحاول مجددًا.');
    } finally {
      button.disabled = false;
      button.textContent = 'إرسال طلب الحجز';
    }
  });

  loadAuthState().catch(() => notify('تعذّر تحميل حالة الحساب'));
  updateAccountButton();
  render();
})();
