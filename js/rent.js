/* =========================================================
   Tian Way — скрипты страницы «Аренда автодома» (rent.html)
   Общее (масштаб, появление при прокрутке, выпадающие списки, календарь rangeCalendar) — в js/main.js,
   «корзина» аренды (даты, гости, автодом, снаряжение) — в js/rent-store.js.
   ========================================================= */

/* ---------- 1. Поиск: даты, гости, промокод ----------
   При обычном переходе на страницу поля пустые (старый выбор сбрасывается).
   При возврате кнопкой «Назад» со следующего шага — выбранное остается, чтобы не вводить заново.
   Выбор запоминается и подставляется на следующих шагах бронирования. */
const rentSearch = (function () {
  const form = document.querySelector('[data-rent-search]');
  if (!form) return null;
  const datesBtn = form.querySelector('[data-rs-dates]');
  const datesValue = form.querySelector('[data-rs-dates-value]');
  const cal = form.querySelector('[data-calendar]');
  const dd = form.querySelector('[data-dd]');
  const ddBtn = dd.querySelector('button');
  const ddValue = dd.querySelector('[data-dd-value]');
  const guestsInput = form.elements.guests;
  const promo = form.elements.promo;
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (d) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let onDates = null;  // что сделать сразу после выбора дат (например, перейти к выбранному автодому)
  let onGuests = null; // то же — после выбора количества гостей

  const showDates = (from, to) => {
    datesValue.textContent = `${fmt(from)} — ${fmt(to)}`;
    datesBtn.classList.add('is-filled');
  };
  const save = () => RentStore.update((s) => {
    if (guestsInput.value) s.guests = guestsInput.value; else delete s.guests;
    s.promo = promo.value.trim();
  });

  const calendar = rangeCalendar(cal, {
    toggle: datesBtn,
    onApply(from, to) {
      showDates(from, to);
      RentStore.update((s) => { s.from = RentStore.toKey(from); s.to = RentStore.toKey(to); });
      applyAvailability();
      if (onDates) { const next = onDates; onDates = null; setTimeout(next, 250); }
    },
  });
  new MutationObserver(() => {
    datesBtn.setAttribute('aria-expanded', String(!cal.hidden && cal.classList.contains('is-open')));
    if (cal.hidden) onDates = null; // календарь закрыли без выбора — переход отменяется
  }).observe(cal, { attributes: true, attributeFilter: ['class', 'hidden'] });

  // --- начальное состояние
  const back = document.documentElement.classList.contains('nav-back');
  if (!back) {
    RentStore.update((s) => { delete s.from; delete s.to; delete s.guests; delete s.promo; delete s.car; });
  } else {
    const saved = RentStore.get();
    const dates = RentStore.dates();
    if (dates) { calendar.set(dates.from, dates.to); showDates(dates.from, dates.to); }
    const opts = [...dd.querySelectorAll('[role="option"]')];
    const i = opts.findIndex((o) => o.textContent.trim() === saved.guests);
    if (i >= 0) {
      opts.forEach((o, k) => o.setAttribute('aria-selected', String(k === i)));
      ddValue.textContent = saved.guests;
      guestsInput.value = saved.guests;
    }
    if (saved.promo) promo.value = saved.promo;
  }
  const paintGuests = () => dd.classList.toggle('is-empty', !guestsInput.value);
  paintGuests();
  // доступность автодомов считаем после того, как карточки размечены (см. ниже, cars())

  // гости: список пишет выбранное в скрытое поле — следим за подписью кнопки
  new MutationObserver(() => {
    if (ddValue.textContent.trim() === 'Выберите') return;
    guestsInput.value = ddValue.textContent.trim(); // на случай, если подпись сменилась раньше поля
    paintGuests();
    save();
    applyAvailability();
    if (onGuests) { const next = onGuests; onGuests = null; setTimeout(next, 250); }
  }).observe(ddValue, { childList: true, characterData: true, subtree: true });
  // список закрыли, так ничего и не выбрав, — переход отменяется
  new MutationObserver(() => {
    if (!dd.classList.contains('is-open') && !guestsInput.value) onGuests = null;
  }).observe(dd, { attributes: true, attributeFilter: ['class'] });
  promo.addEventListener('input', save);

  // поднять страницу к поиску (если человек далеко внизу) и затем выполнить fn
  const toSearch = (fn) => {
    const top = Math.round(form.getBoundingClientRect().top + window.scrollY);
    const far = window.scrollY > top + 40;
    if (far) window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    setTimeout(fn, far && !reduce ? 650 : 0);
  };
  const askDates = (next) => toSearch(() => { calendar.open(); onDates = next; });
  const askGuests = (next) => toSearch(() => {
    onGuests = next;
    if (!dd.classList.contains('is-open')) ddBtn.click();
    dd.classList.remove('is-flash'); void dd.offsetWidth; dd.classList.add('is-flash');
  });
  // по очереди спрашиваем то, чего не хватает, и затем выполняем done
  const require = (done) => {
    if (!calendar.range) { askDates(() => require(done)); return; }
    if (!guestsInput.value) { askGuests(() => require(done)); return; }
    done();
  };

  // --- «Найти»: по очереди спрашиваем даты, гостей и автодом, затем — «Соберите автодом под себя»
  const hint = form.querySelector('[data-rs-hint]');
  const showHint = (text) => {
    hint.textContent = text;
    hint.hidden = false;
    hint.classList.remove('is-flash'); void hint.offsetWidth; hint.classList.add('is-flash');
  };
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    save();
    hint.hidden = true;
    setTimeout(() => require(() => {
      if (RentStore.get().car) { window.location.href = form.getAttribute('action'); return; }
      // автодом не выбран — показываем карточки и подсвечиваем кнопки «Выбрать» у подходящих
      const free = document.querySelectorAll('.car:not(.is-off) .car__choose');
      showHint(free.length ? 'Выберите автодом ниже' : 'На эти даты свободных автодомов нет — попробуйте другие даты');
      // если кнопок «Выбрать» не видно на экране — плавно подвозим к ним
      const firstBtn = document.querySelector('.car__choose').getBoundingClientRect();
      if (firstBtn.bottom > window.innerHeight || firstBtn.top < 0) {
        const top = Math.round(document.getElementById('cars').getBoundingClientRect().top + window.scrollY);
        window.scrollTo({ top: Math.max(0, top - 80), behavior: reduce ? 'auto' : 'smooth' });
      }
      free.forEach((btn, i) => {
        btn.classList.remove('is-call'); void btn.offsetWidth;
        btn.style.setProperty('--ci', i);
        btn.classList.add('is-call');
      });
    }), 0);
  });

  return {
    save,
    require,
    showHint,
    carChosen: () => { hint.hidden = true; },
  };
}());

/* ---------- 2. Карточки автодомов ---------- */
// отметка выбранного автодома на кнопках и карточках
function paintCars() {
  const chosen = (RentStore.get().car || {}).id;
  document.querySelectorAll('.car').forEach((card) => {
    const on = card.dataset.car === chosen;
    const btn = card.querySelector('[data-choose]');
    card.classList.toggle('is-chosen', on);
    btn.setAttribute('aria-pressed', String(on));
    btn.innerHTML = on ? '<svg viewBox="0 0 12 10" fill="none" aria-hidden="true"><path d="M1 5.5 4.3 8.5 11 1.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>Выбрано' : 'Выбрать';
    btn.title = on ? 'Нажмите еще раз, чтобы отменить выбор' : '';
    btn.classList.remove('is-call');
  });
}
// приписка над кнопкой: выбрать можно только один автодом
function note(btn, text) {
  btn.dataset.note = text;
  btn.classList.remove('is-noting'); void btn.offsetWidth; btn.classList.add('is-noting');
  clearTimeout(btn.noteTimer);
  btn.noteTimer = setTimeout(() => btn.classList.remove('is-noting'), 3200);
}
function noteOnly(btn, name) { note(btn, `Можно выбрать только один автодом. Сначала отмените «${name}»`); }
const offNote = (card) => `${card.dataset.off}. Выберите другие даты или другой автодом`;

/* ---------- 2.1. Свободные автодома ----------
   Когда выбраны даты и количество гостей, подходящие автодома стоят первыми, а занятые на эти даты
   или слишком маленькие — в конце списка, серыми, с пометкой; выбрать их нельзя.
   Вместимость и занятые даты — в js/rent-availability.js. */
const guestsCount = () => parseInt(RentStore.get().guests, 10) || 0;
const searchReady = () => Boolean(RentStore.dates() && guestsCount());
function applyAvailability() {
  const data = window.RENT_CARS || {};
  const dates = RentStore.dates();
  const n = guestsCount();
  const ready = Boolean(dates && n);
  let chosenOff = false;
  document.querySelectorAll('.car').forEach((card) => {
    const info = data[card.dataset.car] || {};
    let reason = '';
    if (ready) {
      const busy = (info.busy || []).some(([a, b]) => {
        const from = RentStore.fromKey(a); const to = RentStore.fromKey(b);
        return from && to && dates.from < to && dates.to > from; // пересечение; день выезда свободен
      });
      if (info.seats && n > info.seats) reason = `Вмещает до ${info.seats} ${info.seats === 1 ? 'гостя' : 'гостей'}`;
      else if (busy) reason = 'Занят на эти даты';
    }
    card.classList.toggle('is-off', Boolean(reason));
    card.style.order = reason ? '1' : '';           // неподходящие — в конец списка
    card.dataset.off = reason;
    let badge = card.querySelector('.car__off');
    if (reason) {
      if (!badge) { badge = document.createElement('span'); badge.className = 'car__off'; card.append(badge); }
      badge.textContent = reason;
    } else if (badge) badge.remove();
    card.querySelector('[data-choose]').setAttribute('aria-disabled', String(Boolean(reason)));
    if (reason && (RentStore.get().car || {}).id === card.dataset.car) chosenOff = true;
  });
  if (chosenOff) { RentStore.update((s) => { delete s.car; }); paintCars(); } // выбранный автодом стал недоступен
}
(function cars() {
  paintCars();
  document.querySelectorAll('.car').forEach((card) => {
    // фото: стрелка листает ленту по одному фото; на последнем стрелка поворачивается и возвращает к первому
    const next = card.querySelector('[data-gallery-next]');
    const gallery = card.querySelector('.car__gallery');
    const track = card.querySelector('.car__track');
    let idx = 0;
    next.addEventListener('click', () => {
      const photos = [...track.children];
      const max = Math.max(0, track.scrollWidth - gallery.clientWidth); // дальше — пустое место за последним фото
      const atEnd = card.classList.contains('is-shifted');
      idx = atEnd ? 0 : Math.min(idx + 1, photos.length - 1);
      const pos = Math.min(photos[idx].offsetLeft, max);
      track.style.transform = `translateX(${-pos}px)`;
      const end = pos >= max - 1;
      if (end) idx = photos.length - 1;
      card.classList.toggle('is-shifted', end && pos > 0);
      next.setAttribute('aria-label', end && pos > 0 ? 'К первому фото' : 'Следующее фото');
    });

    // «Подробнее» / «Скрыть описание»
    const more = card.querySelector('.car__more');
    const label = more.querySelector('[data-more-label]');
    more.addEventListener('click', () => {
      const open = card.classList.toggle('is-open');
      more.setAttribute('aria-expanded', String(open));
      label.textContent = open ? 'Скрыть описание' : 'Подробнее';
    });

    // «Выбрать»: отмечаем автодом, остаемся на странице. Выбрать можно только один —
    // при попытке выбрать второй появляется приписка; повторное нажатие на «Выбрано» снимает выбор
    const choose = card.querySelector('[data-choose]');
    choose.addEventListener('click', () => {
      // сначала даты и количество гостей: спрашиваем по очереди, потом пробуем выбрать этот автодом еще раз
      if (rentSearch && !searchReady()) {
        rentSearch.showHint('Сначала выберите даты и количество гостей');
        rentSearch.require(() => { if (!card.classList.contains('is-off')) choose.click(); else note(choose, offNote(card)); });
        return;
      }
      if (card.classList.contains('is-off')) { note(choose, offNote(card)); return; }
      const current = RentStore.get().car;
      if (current && current.id === card.dataset.car) {          // снять выбор
        RentStore.update((s) => { delete s.car; });
        paintCars();
        return;
      }
      if (current) {                                              // уже выбран другой
        noteOnly(choose, current.name);
        return;
      }
      RentStore.update((s) => {
        s.car = { id: card.dataset.car, name: card.dataset.name, price: Number(card.dataset.price) };
      });
      paintCars();
      if (rentSearch) rentSearch.carChosen();
    });
  });
  applyAvailability();
})();

/* ---------- 3. Снаряжение: «В корзину» → счетчик «− 1 +» (общая логика — RentStore.cartControls) ---------- */
RentStore.cartControls(document);

/* ---------- 4. Большой просмотр фото автодома ----------
   Клик по фото в галерее карточки — фото открывается крупно поверх страницы.
   Листать: стрелки по бокам или ← →; закрыть: крестик, клик по темному фону или Esc.
   Крупная версия — из data-full (img/rent/full/…), иначе само фото. */
(function lightbox() {
  const icon = (d) => `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="${d}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const box = document.createElement('div');
  box.className = 'lightbox';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', 'Фото автодома');
  box.innerHTML = `
    <img class="lightbox__img" alt="">
    <button class="lightbox__btn lightbox__btn--prev" type="button" aria-label="Предыдущее фото">${icon('M15 5l-7 7 7 7')}</button>
    <button class="lightbox__btn lightbox__btn--next" type="button" aria-label="Следующее фото">${icon('M9 5l7 7-7 7')}</button>
    <button class="lightbox__btn lightbox__btn--close" type="button" aria-label="Закрыть">${icon('M6 6l12 12M18 6L6 18')}</button>
    <p class="lightbox__cap"><span data-lb-cap></span><span class="lightbox__count" data-lb-count></span></p>`;
  document.body.append(box);
  const img = box.querySelector('.lightbox__img');
  const cap = box.querySelector('[data-lb-cap]');
  const count = box.querySelector('[data-lb-count]');
  const prevBtn = box.querySelector('.lightbox__btn--prev');
  const nextBtn = box.querySelector('.lightbox__btn--next');
  let list = []; let index = 0; let lastFocus = null;

  function show(i) {
    index = (i + list.length) % list.length;
    const ph = list[index];
    img.classList.add('is-loading');
    img.onload = () => img.classList.remove('is-loading');
    img.src = ph.dataset.full || ph.currentSrc || ph.src;
    img.alt = ph.alt || '';
    cap.textContent = ''; // подпись не показываем — только номер фото
    count.textContent = list.length > 1 ? `${index + 1} / ${list.length}` : '';
    prevBtn.hidden = nextBtn.hidden = list.length < 2;
    // заранее подгружаем соседнее фото, чтобы листание было без задержки
    const nb = list[(index + 1) % list.length];
    if (nb) { const pre = new Image(); pre.src = nb.dataset.full || nb.src; }
  }
  function open(photos, i) {
    list = photos; lastFocus = document.activeElement;
    show(i);
    box.classList.add('is-open');
    document.documentElement.style.overflow = 'hidden'; // страница под просмотром не прокручивается
    box.querySelector('.lightbox__btn--close').focus({ preventScroll: true });
  }
  function close() {
    box.classList.remove('is-open');
    document.documentElement.style.overflow = '';
    if (lastFocus) lastFocus.focus({ preventScroll: true });
  }

  document.querySelectorAll('.car').forEach((card) => {
    const photos = [...card.querySelectorAll('.car__track img.car__photo')];
    photos.forEach((ph, i) => ph.addEventListener('click', () => open(photos, i)));
  });
  prevBtn.addEventListener('click', () => show(index - 1));
  nextBtn.addEventListener('click', () => show(index + 1));
  box.querySelector('.lightbox__btn--close').addEventListener('click', close);
  box.addEventListener('click', (e) => { if (e.target === box) close(); }); // клик по темному фону
  document.addEventListener('keydown', (e) => {
    if (!box.classList.contains('is-open')) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft' && list.length > 1) show(index - 1);
    else if (e.key === 'ArrowRight' && list.length > 1) show(index + 1);
  });
})();
