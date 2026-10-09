(() => {
  const stays = [
    { id: 'coast', title: 'شقة بإطلالة هادئة على البحر', location: 'وجهة ساحلية · قريبة من الشاطئ', type: 'coast', tags: ['family'], guests: 4, beds: 2, baths: 1, rating: '4.92', price: 95, image: 'assets/stay-coast.webp', label: 'إطلالة بحرية', description: 'مساحة مشرقة بإطلالة مريحة، مناسبة لإجازة قصيرة أو عطلة عائلية. هذه البيانات تجريبية لتوضيح شكل صفحة الإقامة.' },
    { id: 'cabin', title: 'كوخ خشبي بين التلال الخضراء', location: 'منطقة جبلية · أجواء هادئة', type: 'cabin', tags: [], guests: 5, beds: 3, baths: 2, rating: '4.98', price: 120, image: 'assets/stay-cabin.webp', label: 'الأكثر هدوءًا', description: 'كوخ مستقل تحيط به الطبيعة، مع جلسة خارجية ومساحة مناسبة للمجموعات الصغيرة. المكان والسعر مثالان غير حقيقيين.' },
    { id: 'city', title: 'استوديو دافئ في قلب المدينة', location: 'وسط المدينة · يسهل الوصول إليه', type: 'city', tags: [], guests: 2, beds: 1, baths: 1, rating: '4.87', price: 75, image: 'assets/stay-city.webp', label: 'مناسب لشخصين', description: 'استوديو عملي بتصميم بسيط، مثالي لزيارة قصيرة. الموقع والوصف والسعر أمثلة تجريبية وليست عرضًا حقيقيًا.' }
  ];

  const grid = document.querySelector('#listing-grid');
  const form = document.querySelector('#search-form');
  const destination = document.querySelector('#destination');
  const checkin = document.querySelector('#checkin');
  const checkout = document.querySelector('#checkout');
  const guestsSelect = document.querySelector('#guests');
  const count = document.querySelector('#results-count');
  const empty = document.querySelector('#empty-state');
  const favoritesFilter = document.querySelector('#favorites-filter');
  const dialog = document.querySelector('#detail-dialog');
  const toast = document.querySelector('#toast');
  const saved = new Set(JSON.parse(localStorage.getItem('masaken-favorites') || '[]'));
  let activeCategory = 'all';
  let onlyFavorites = false;
  let toastTimer;

  const iconHeart = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 8.7c0 5.1-8.8 10.2-8.8 10.2S3.2 13.8 3.2 8.7A4.7 4.7 0 0 1 12 6.2a4.7 4.7 0 0 1 8.8 2.5Z"/></svg>';
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

  function notify(message) {
    toast.textContent = message;
    toast.classList.add('show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('show'), 2600);
  }

  function filteredStays() {
    const query = destination.value.trim().toLocaleLowerCase('ar');
    const minGuests = Number(guestsSelect.value || 1);
    return stays.filter((stay) => {
      const searchable = `${stay.title} ${stay.location} ${stay.type}`.toLocaleLowerCase('ar');
      const matchesQuery = !query || searchable.includes(query);
      const matchesCategory = activeCategory === 'all' || stay.type === activeCategory || stay.tags.includes(activeCategory);
      const matchesGuests = stay.guests >= minGuests;
      const matchesFavorite = !onlyFavorites || saved.has(stay.id);
      return matchesQuery && matchesCategory && matchesGuests && matchesFavorite;
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
    document.querySelector('#show-all').hidden = results.length === stays.length && !onlyFavorites && activeCategory === 'all' && !destination.value.trim();
  }

  function showDetails(id) {
    const stay = stays.find((item) => item.id === id);
    if (!stay) return;
    document.querySelector('#dialog-photo').style.backgroundImage = `url("${stay.image}")`;
    document.querySelector('#dialog-location').textContent = stay.location;
    document.querySelector('#dialog-title').textContent = stay.title;
    document.querySelector('#dialog-description').textContent = stay.description;
    document.querySelector('#dialog-facts').innerHTML = `<span>${stay.guests} ضيوف كحد أقصى</span><span>${stay.beds} غرف نوم</span><span>${stay.baths} حمّام</span>`;
    document.querySelector('#dialog-price').innerHTML = `${new Intl.NumberFormat('ar').format(stay.price)} USDT <small>لليلة · سعر تجريبي</small>`;
    dialog.showModal();
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (Boolean(checkin.value) !== Boolean(checkout.value)) {
      notify('اختر تاريخ الوصول والمغادرة معًا');
      return;
    }
    if (checkin.value && checkout.value <= checkin.value) {
      notify('يجب أن يكون تاريخ المغادرة بعد تاريخ الوصول');
      return;
    }
    render();
    if (checkin.value) notify('هذه معاينة فقط؛ لا يتوفر فحص حقيقي للتواريخ بعد');
    document.querySelector('#listings').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  destination.addEventListener('input', render);
  guestsSelect.addEventListener('change', render);
  document.querySelectorAll('.category').forEach((button) => {
    button.addEventListener('click', () => {
      activeCategory = button.dataset.category;
      document.querySelectorAll('.category').forEach((item) => item.classList.toggle('active', item === button));
      render();
    });
  });

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
    document.querySelector('#listings').scrollIntoView({ behavior: 'smooth', block: 'start' });
    render();
  }
  favoritesFilter.addEventListener('click', toggleFavorites);
  document.querySelector('#mobile-favorites').addEventListener('click', toggleFavorites);

  document.querySelector('#clear-filters').addEventListener('click', () => {
    destination.value = '';
    guestsSelect.value = '1';
    activeCategory = 'all';
    onlyFavorites = false;
    favoritesFilter.classList.remove('active');
    favoritesFilter.innerHTML = '<span aria-hidden="true">♡</span> المفضلة فقط';
    document.querySelectorAll('.category').forEach((item) => item.classList.toggle('active', item.dataset.category === 'all'));
    render();
  });
  document.querySelector('#reset-search').addEventListener('click', () => document.querySelector('#clear-filters').click());
  document.querySelector('#show-all').addEventListener('click', () => {
    document.querySelector('#clear-filters').click();
    notify('تُعرض الآن جميع الأمثلة التجريبية');
  });
  document.querySelector('#profile-button').addEventListener('click', () => notify('الحسابات غير مفعّلة في النسخة التجريبية'));
  document.querySelector('#mobile-profile').addEventListener('click', () => notify('الحسابات غير مفعّلة في النسخة التجريبية'));
  document.querySelector('#dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  render();
})();
