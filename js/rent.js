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
      criteriaChanged();
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
  // при возврате «Назад» результаты поиска показываем сразу — после того, как карточки размечены (см. ниже, cars())

  // гости: список пишет выбранное в скрытое поле — следим за подписью кнопки
  new MutationObserver(() => {
    if (ddValue.textContent.trim() === 'Выберите') return;
    guestsInput.value = ddValue.textContent.trim(); // на случай, если подпись сменилась раньше поля
    paintGuests();
    save();
    criteriaChanged();
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

  // --- «Найти»: по очереди спрашиваем даты и гостей, затем показываем свободные автодома
  const hint = form.querySelector('[data-rs-hint]');
  const showHint = (text) => {
    hint.textContent = text;
    hint.hidden = false;
    hint.classList.remove('is-flash'); void hint.offsetWidth; hint.classList.add('is-flash');
  };
  const hideHint = () => { hint.hidden = true; };
  // искать сам сайт не начинает — поднимаем к поиску и подсвечиваем «Найти» (подсказка — только если передана)
  const findBtn = form.querySelector('.rs-find');
  const askFind = (text) => toSearch(() => {
    if (text) showHint(text); else hideHint();
    findBtn.classList.remove('is-flash'); void findBtn.offsetWidth; findBtn.classList.add('is-flash');
    findBtn.focus({ preventScroll: true });
  });
  // плавно подвезти к результатам поиска
  const toResults = () => {
    const top = Math.round(document.getElementById('cars').getBoundingClientRect().top + window.scrollY);
    window.scrollTo({ top: Math.max(0, top - 90), behavior: reduce ? 'auto' : 'smooth' });
  };
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    save();
    hideHint();
    setTimeout(() => require(() => { runSearch(); toResults(); }), 0);
  });

  return {
    save,
    require,
    showHint,
    hideHint,
    askFind,
    toResults,
    datesText: () => (calendar.range ? datesValue.textContent : ''),
    // подставить даты (например, ближайшие свободные из карточки занятого автодома)
    setDates(from, to) {
      calendar.set(from, to);
      showDates(from, to);
      RentStore.update((s) => { s.from = RentStore.toKey(from); s.to = RentStore.toKey(to); });
    },
  };
}());

/* ---------- 2. Автодома и поиск свободных ----------
   До поиска видны все автодома — можно листать фото и читать описание; цена «от 250 $ / сутки».
   «Найти» (после дат и количества гостей), как в системах бронирования отелей:
   — сверху «Свободны на ваши даты»: у карточки цена за весь срок («1 000 $ за 4 ночи») и «Забронировать»;
     «Забронировать» открывает окошко-итог: «Оформить бронирование» → «Соберите автодом под себя»;
   — ниже отдельный блок «Не подошли под ваш запрос»: серые карточки с причиной, а у занятых —
     ближайшие свободные даты той же длины; нажатие подставляет их в поиск.
   Сам поиск — только по кнопке «Найти» (кроме возврата «Назад»: тогда показываем прежние результаты).
   Если даты или гостей поменяли вручную — результаты убираются, пока снова не нажмут «Найти».
   Порядок групп задается свойством order в сетке .cars (карточки в разметке не переставляются).
   Вместимость и занятые даты — в js/rent-availability.js. */
const NEXT_PAGE = 'rent-extras.html'; // следующий шаг — «Соберите автодом под себя»
const carsBox = document.getElementById('cars');
const DAY = 86400000;
const guestsCount = () => parseInt(RentStore.get().guests, 10) || 0;
const searchReady = () => Boolean(RentStore.dates() && guestsCount());
const nightsBetween = (a, b) => Math.round((b - a) / DAY);
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const guestsWord = (n) => RentStore.plural(n, 'гость', 'гостя', 'гостей'); // 1 гость, 2 гостя, 5 гостей
const nightsWord = (n) => RentStore.plural(n, 'ночь', 'ночи', 'ночей');
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const dayMonth = (d) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;
// «с 10 по 14 декабря» или «с 29 декабря по 2 января»
const fromTo = (a, b) => `с ${a.getMonth() === b.getMonth() ? a.getDate() : dayMonth(a)} по ${dayMonth(b)}`;
const MON = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
// «12 — 16 дек» или «29 дек — 2 янв»
const shortRange = (a, b) => (a.getMonth() === b.getMonth() ? `${a.getDate()} — ${b.getDate()} ${MON[b.getMonth()]}`
  : `${a.getDate()} ${MON[a.getMonth()]} — ${b.getDate()} ${MON[b.getMonth()]}`);
let searched = false; // результаты поиска сейчас на экране

const carInfo = (card) => (window.RENT_CARS || {})[card.dataset.car] || {};
const busyRanges = (card) => (carInfo(card).busy || []).map(([a, b]) => [RentStore.fromKey(a), RentStore.fromKey(b)]).filter(([a, b]) => a && b);
// пересечение с занятым периодом; день выезда уже свободен
const busyOn = (card, from, to) => busyRanges(card).find(([a, b]) => from < b && to > a);

// почему автодом не подходит: { kind: 'seats' | 'busy', text } или null
function carReason(card, dates, n) {
  const seats = carInfo(card).seats;
  if (seats && n > seats) return { kind: 'seats', text: `Вмещает до ${seats} ${seats === 1 ? 'гостя' : 'гостей'}, а вас ${n}` };
  const b = busyOn(card, dates.from, dates.to);
  if (b) return { kind: 'busy', text: `Занят ${fromTo(b[0], b[1])}` };
  return null;
}

// ближайшие свободные даты той же длины (до 3 вариантов, не раньше сегодняшнего дня, в пределах 2 месяцев)
function nearestFree(card, dates) {
  const len = nightsBetween(dates.from, dates.to);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const found = [];
  for (let d = 1; d <= 60 && found.length < 3; d += 1) {
    [d, -d].forEach((shift) => {
      const from = addDays(dates.from, shift); const to = addDays(from, len);
      if (found.length < 3 && from >= today && !busyOn(card, from, to)) found.push([from, to]);
    });
  }
  return found.slice(0, 3).sort((a, b) => a[0] - b[0]);
}

// заголовки групп в сетке автодомов (создаются один раз)
function carsHead(kind) {
  let head = carsBox.querySelector(`[data-cars-head="${kind}"]`);
  if (!head) {
    head = document.createElement('div');
    head.className = `cars-head cars-head--${kind}`;
    head.dataset.carsHead = kind;
    head.innerHTML = '<h2 class="cars-head__title"></h2><p class="cars-head__text"></p>';
    carsBox.append(head);
  }
  return head;
}

// цена и кнопка карточки: до поиска — «от 250 $ / сутки» и «Выбрать», после — сумма за срок и «Забронировать»
function paintCar(card, nights) {
  const price = card.querySelector('.car__price');
  if (!price.dataset.base) price.dataset.base = price.innerHTML;
  const btn = card.querySelector('[data-choose]');
  if (nights) {
    price.innerHTML = `<span class="car__price-sum">${RentStore.money(Number(card.dataset.price) * nights)}</span>`
      + `<span class="car__price-per">за ${nights} ${nightsWord(nights)}</span>`;
    btn.textContent = 'Забронировать';
  } else {
    price.innerHTML = price.dataset.base;
    btn.textContent = 'Выбрать';
  }
}

// панель занятого автодома: «Нет свободных дат…» и ближайшие свободные даты.
// Если не подходит по числу гостей — панели нет, причина только на пометке над фото
function paintAlt(card, reason, dates) {
  let alt = card.querySelector('.car__alt');
  if (!reason || reason.kind !== 'busy') { if (alt) alt.remove(); card.style.removeProperty('--alt-h'); return; }
  if (!alt) { alt = document.createElement('div'); alt.className = 'car__alt'; card.append(alt); }
  const len = nightsBetween(dates.from, dates.to);
  const opts = nearestFree(card, dates);
  alt.innerHTML = `<p class="car__alt-text">Нет свободных дат ${fromTo(dates.from, dates.to)}</p>`
    + (opts.length ? '<p class="car__alt-sub">Можно забронировать другие даты:</p><div class="car__alt-list">'
      + opts.map(([a, b]) => `<button class="car__alt-opt" type="button" data-from="${RentStore.toKey(a)}" data-to="${RentStore.toKey(b)}">`
        + `<b>${shortRange(a, b)}</b><span>${len} ${nightsWord(len)} · ${RentStore.money(Number(card.dataset.price) * len)}</span></button>`).join('')
      + '</div>' : '<p class="car__alt-sub">В ближайшие два месяца на такой срок занят</p>');
  card.style.setProperty('--alt-h', `${alt.offsetHeight + 24}px`);
}

function runSearch() {
  const dates = RentStore.dates();
  const n = guestsCount();
  if (!dates || !n) return;
  const nights = nightsBetween(dates.from, dates.to);
  let free = 0; let off = 0;
  document.querySelectorAll('.car').forEach((card) => {
    const reason = carReason(card, dates, n);
    card.classList.toggle('is-off', Boolean(reason));
    card.style.order = reason ? '3' : '1';
    let badge = card.querySelector('.car__off');
    if (reason) {
      if (!badge) { badge = document.createElement('span'); badge.className = 'car__off'; card.append(badge); }
      badge.textContent = reason.text;
    } else if (badge) badge.remove();
    paintCar(card, reason ? 0 : nights);
    paintAlt(card, reason, dates);
    if (reason) off += 1; else free += 1;
  });

  const what = `${rentSearch ? rentSearch.datesText() : ''} · ${nights} ${nightsWord(nights)} · ${n} ${guestsWord(n)}`;
  const freeHead = carsHead('free');
  freeHead.style.order = '0';
  freeHead.querySelector('.cars-head__title').textContent = free ? 'Свободны на ваши даты' : 'Свободных автодомов нет';
  freeHead.querySelector('.cars-head__text').textContent = what;
  const offHead = carsHead('off');
  offHead.style.order = '2';
  offHead.hidden = !off || !free; // свободных нет — второй заголовок не нужен
  offHead.querySelector('.cars-head__title').textContent = 'Не подошли под ваш запрос';
  offHead.querySelector('.cars-head__text').textContent = 'Причина и ближайшие свободные даты — на карточке';
  carsBox.classList.add('is-searched');
  searched = true;
  if (rentSearch) rentSearch.hideHint();
}

function clearSearch() {
  document.querySelectorAll('.car').forEach((card) => {
    card.classList.remove('is-off');
    card.style.order = '';
    const badge = card.querySelector('.car__off');
    if (badge) badge.remove();
    paintCar(card, 0);
    paintAlt(card, null);
  });
  carsBox.querySelectorAll('[data-cars-head]').forEach((h) => h.remove());
  carsBox.classList.remove('is-searched');
  searched = false;
}

// даты или гости изменились вручную: старые результаты убираем и просим нажать «Найти»
function criteriaChanged() {
  if (!searched) return;
  clearSearch();
  if (rentSearch && searchReady()) rentSearch.showHint('Нажмите «Найти», чтобы обновить список');
}

/* ---------- 2.1. Окошко-итог «Забронировать» ----------
   Автодом, даты, гости, аренда за срок и итог; «Оформить бронирование» запоминает автодом
   и ведет на «Соберите автодом под себя». Закрыть: «Вернуться к выбору», крестик, фон или Esc. */
const bookModal = (function () {
  const box = document.createElement('div');
  box.className = 'rent-modal';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-labelledby', 'rent-modal-title');
  box.innerHTML = `
    <div class="rent-modal__card">
      <button class="rent-modal__close" type="button" aria-label="Закрыть"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
      <h2 class="rent-modal__title" id="rent-modal-title">Ваше бронирование</h2>
      <p class="rent-modal__car" data-m-car></p>
      <dl class="rent-modal__rows">
        <div><dt>Даты</dt><dd data-m-dates></dd></div>
        <div><dt>Гости</dt><dd data-m-guests></dd></div>
        <div><dt data-m-rent-label>Аренда</dt><dd data-m-rent></dd></div>
      </dl>
      <p class="rent-modal__total"><span>Итого</span><b data-m-total></b></p>
      <p class="rent-modal__note">Снаряжение и дополнительные услуги можно добавить на следующем шаге</p>
      <div class="rent-modal__btns">
        <a class="rent-modal__go" href="${NEXT_PAGE}" data-m-go>Оформить бронирование</a>
        <button class="rent-modal__back" type="button" data-m-back>Вернуться к выбору</button>
      </div>
    </div>`;
  document.body.append(box);
  const $ = (q) => box.querySelector(q);
  let card = null; let lastFocus = null;

  function open(c) {
    card = c; lastFocus = document.activeElement;
    const dates = RentStore.dates(); const n = guestsCount();
    const nights = nightsBetween(dates.from, dates.to);
    const price = Number(card.dataset.price);
    $('[data-m-car]').textContent = `Автодом ${card.dataset.name}`;
    $('[data-m-dates]').textContent = `${dates.from.getMonth() === dates.to.getMonth() ? dates.from.getDate() : dayMonth(dates.from)} — ${dayMonth(dates.to)}, ${nights} ${nightsWord(nights)}`;
    $('[data-m-guests]').textContent = `${n} ${guestsWord(n)}`;
    $('[data-m-rent-label]').textContent = `${RentStore.money(price)} × ${nights} ${nightsWord(nights)}`;
    $('[data-m-rent]').textContent = RentStore.money(price * nights);
    $('[data-m-total]').textContent = RentStore.money(price * nights);
    box.classList.add('is-open');
    document.documentElement.style.overflow = 'hidden';
    $('[data-m-go]').focus({ preventScroll: true });
  }
  function close() {
    box.classList.remove('is-open');
    document.documentElement.style.overflow = '';
    if (lastFocus) lastFocus.focus({ preventScroll: true });
  }
  $('[data-m-go]').addEventListener('click', () => {
    RentStore.update((s) => { s.car = { id: card.dataset.car, name: card.dataset.name, price: Number(card.dataset.price) }; });
  });
  $('[data-m-back]').addEventListener('click', close);
  $('.rent-modal__close').addEventListener('click', close);
  box.addEventListener('click', (e) => { if (e.target === box) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && box.classList.contains('is-open')) close(); });
  return { open };
}());

/* ---------- 2.2. Карточки: фото, «Подробнее», «Выбрать» / «Забронировать» ---------- */
(function cars() {
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

    // «Выбрать» до поиска: спрашиваем даты и гостей и просим нажать «Найти» (сам поиск — только по кнопке);
    // «Забронировать» после поиска — окошко-итог
    const choose = card.querySelector('[data-choose]');
    choose.addEventListener('click', () => {
      if (!searched && rentSearch) {
        rentSearch.showHint('Сначала выберите даты и количество гостей');
        rentSearch.require(() => rentSearch.askFind());
        return;
      }
      if (!card.classList.contains('is-off')) bookModal.open(card);
    });

    // ближайшие свободные даты у занятого автодома: подставляем их в поиск и просим нажать «Найти»
    card.addEventListener('click', (e) => {
      const opt = e.target.closest('.car__alt-opt');
      if (!opt || !rentSearch) return;
      rentSearch.setDates(RentStore.fromKey(opt.dataset.from), RentStore.fromKey(opt.dataset.to));
      clearSearch();
      rentSearch.askFind('Даты подставлены — нажмите «Найти»');
    });
  });
  // возврат «Назад» со следующего шага: поиск уже был — показываем его результаты такими, как были
  if (document.documentElement.classList.contains('nav-back') && searchReady()) runSearch();
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
